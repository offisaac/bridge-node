/**
 * Agent Video - Video Processing Agent
 *
 * Manages video encoding, transcoding, streaming, and video analysis.
 *
 * Usage: node agent-video.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   job     - List processing jobs
 *   list    - List videos
 */

class Video {
  constructor(config) {
    this.id = `video-${Date.now()}`;
    this.name = config.name;
    this.originalUrl = config.originalUrl;
    this.duration = config.duration || 0; // seconds
    this.dimensions = config.dimensions || null; // width x height
    this.fps = config.fps || 30;
    this.codec = config.codec || 'h264';
    this.bitrate = config.bitrate || 0;
    this.size = config.size || 0; // bytes
    this.status = config.status || 'uploaded'; // uploaded, processing, ready, error
    this.formats = []; // available formats
    this.thumbnails = [];
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
  }

  addFormat(format) {
    this.formats.push(format);
  }

  complete() {
    this.status = 'ready';
  }

  fail(error) {
    this.status = 'error';
    this.metadata.error = error;
  }

  addThumbnail(time, url) {
    this.thumbnails.push({ time, url });
  }
}

class EncodingJob {
  constructor(config) {
    this.id = `job-${Date.now()}`;
    this.videoId = config.videoId;
    this.outputFormat = config.outputFormat; // mp4, webm, hls
    this.resolution = config.resolution; // 1080p, 720p, 480p, 360p
    this.quality = config.quality || 'medium'; // low, medium, high
    this.status = 'pending'; // pending, processing, completed, failed
    this.progress = 0;
    this.startTime = null;
    this.endTime = null;
    this.outputUrl = null;
  }

  start() {
    this.status = 'processing';
    this.startTime = Date.now();
  }

  updateProgress(progress) {
    this.progress = Math.min(100, Math.max(0, progress));
  }

  complete(outputUrl) {
    this.status = 'completed';
    this.progress = 100;
    this.endTime = Date.now();
    this.outputUrl = outputUrl;
  }

  fail(error) {
    this.status = 'failed';
    this.endTime = Date.now();
    this.metadata = { error };
  }

  getDuration() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return Math.floor((end - this.startTime) / 1000);
  }
}

class StreamConfig {
  constructor(config) {
    this.id = `stream-${Date.now()}`;
    this.videoId = config.videoId;
    this.protocol = config.protocol || 'hls'; // hls, dash
    this.bitrates = config.bitrates || [];
    this.resolutions = config.resolutions || [];
    this.status = 'inactive';
    this.url = null;
  }

  activate(url) {
    this.status = 'active';
    this.url = url;
  }

  deactivate() {
    this.status = 'inactive';
  }
}

class VideoAnalysis {
  constructor(config) {
    this.id = `analysis-${Date.now()}`;
    this.videoId = config.videoId;
    this.scenes = config.scenes || [];
    this.duration = config.duration || 0;
    this.frames = config.frames || 0;
    this.keyframes = config.keyframes || 0;
    this.status = 'pending';
  }

  complete(results) {
    this.scenes = results.scenes || [];
    this.duration = results.duration || 0;
    this.frames = results.frames || 0;
    this.keyframes = results.keyframes || 0;
    this.status = 'completed';
  }
}

class VideoAgent {
  constructor(config = {}) {
    this.videos = new Map();
    this.jobs = new Map();
    this.streamConfigs = new Map();
    this.analyses = new Map();
    this.stats = {
      videosUploaded: 0,
      jobsCompleted: 0,
      totalProcessingTime: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo videos
    const videos = [
      {
        name: 'Product Demo',
        originalUrl: '/videos/original/product-demo.mp4',
        duration: 180,
        dimensions: '1920x1080',
        fps: 30,
        codec: 'h264',
        bitrate: 8000000,
        size: 180000000
      },
      {
        name: 'Tutorial Video',
        originalUrl: '/videos/original/tutorial.mp4',
        duration: 600,
        dimensions: '1920x1080',
        fps: 30,
        codec: 'h264',
        bitrate: 6000000,
        size: 450000000
      },
      {
        name: 'Promo Clip',
        originalUrl: '/videos/original/promo.mp4',
        duration: 30,
        dimensions: '1920x1080',
        fps: 60,
        codec: 'h265',
        bitrate: 15000000,
        size: 56000000
      }
    ];

    videos.forEach(v => {
      const video = new Video(v);
      video.status = 'ready';

      // Add formats
      video.addFormat({ name: '1080p', resolution: '1920x1080', bitrate: 5000000, url: `${v.originalUrl}_1080p.mp4` });
      video.addFormat({ name: '720p', resolution: '1280x720', bitrate: 2500000, url: `${v.originalUrl}_720p.mp4` });
      video.addFormat({ name: '480p', resolution: '854x480', bitrate: 1000000, url: `${v.originalUrl}_480p.mp4` });

      // Add thumbnails
      video.addThumbnail(5, `/videos/thumbs/${video.id}_thumb_05.jpg`);
      video.addThumbnail(30, `/videos/thumbs/${video.id}_thumb_30.jpg`);
      video.addThumbnail(60, `/videos/thumbs/${video.id}_thumb_60.jpg`);

      this.videos.set(video.id, video);
      this.stats.videosUploaded++;
    });
  }

  uploadVideo(config) {
    const video = new Video(config);
    this.videos.set(video.id, video);
    this.stats.videosUploaded++;
    console.log(`   Uploaded: ${video.name} (${video.duration}s)`);
    return video;
  }

  createEncodingJob(config) {
    const job = new EncodingJob(config);
    this.jobs.set(job.id, job);
    job.start();
    console.log(`   Created encoding job: ${job.outputFormat} (${job.resolution})`);
    return job;
  }

  updateJobProgress(jobId, progress) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.updateProgress(progress);
    return job;
  }

  completeJob(jobId, outputUrl) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    job.complete(outputUrl);
    this.stats.jobsCompleted++;
    this.stats.totalProcessingTime += job.getDuration();

    // Update video formats
    const video = this.videos.get(job.videoId);
    if (video) {
      video.addFormat({
        name: job.resolution,
        resolution: job.resolution,
        bitrate: job.quality === 'high' ? 5000000 : job.quality === 'medium' ? 2500000 : 1000000,
        url: outputUrl
      });
    }

    return job;
  }

  createStreamConfig(config) {
    const stream = new StreamConfig(config);
    this.streamConfigs.set(stream.id, stream);

    const baseUrl = `/videos/stream/${config.videoId}`;
    stream.activate(`${baseUrl}/playlist.m3u8`);

    console.log(`   Created HLS stream: ${stream.url}`);
    return stream;
  }

  analyzeVideo(videoId) {
    const video = this.videos.get(videoId);
    if (!video) return null;

    const analysis = new VideoAnalysis({
      videoId,
      duration: video.duration,
      frames: Math.floor(video.duration * video.fps),
      keyframes: Math.floor(video.duration * video.fps / 10)
    });

    // Simulate scene detection
    analysis.complete({
      scenes: [
        { start: 0, end: 30, thumbnail: '/scenes/scene_01.jpg' },
        { start: 30, end: 60, thumbnail: '/scenes/scene_02.jpg' },
        { start: 60, end: 90, thumbnail: '/scenes/scene_03.jpg' }
      ],
      duration: video.duration,
      frames: Math.floor(video.duration * video.fps),
      keyframes: Math.floor(video.duration * video.fps / 10)
    });

    this.analyses.set(analysis.id, analysis);
    console.log(`   Analyzed: ${video.name} (${analysis.scenes.length} scenes)`);
    return analysis;
  }

  generateThumbnail(videoId, time) {
    const video = this.videos.get(videoId);
    if (!video) return null;

    const thumbnail = {
      time,
      url: `/videos/thumbs/${video.id}_thumb_${time}.jpg`
    };
    video.addThumbnail(time, thumbnail.url);
    console.log(`   Generated thumbnail at ${time}s`);
    return thumbnail;
  }

  listVideos(status = null) {
    const videos = Array.from(this.videos.values());
    if (status) {
      return videos.filter(v => v.status === status);
    }
    return videos;
  }

  listJobs(status = null) {
    const jobs = Array.from(this.jobs.values());
    if (status) {
      return jobs.filter(j => j.status === status);
    }
    return jobs;
  }

  getVideo(videoId) {
    return this.videos.get(videoId);
  }

  getStats() {
    const videos = Array.from(this.videos.values());
    const completedJobs = this.listJobs('completed');
    const processingTime = this.stats.totalProcessingTime;

    return {
      videosUploaded: this.stats.videosUploaded,
      videosReady: videos.filter(v => v.status === 'ready').length,
      jobsCompleted: this.stats.jobsCompleted,
      totalProcessingTime: `${Math.floor(processingTime / 60)}m ${processingTime % 60}s`,
      activeStreams: Array.from(this.streamConfigs.values()).filter(s => s.status === 'active').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const video = new VideoAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Video Demo\n');

    // 1. List Videos
    console.log('1. Videos:');
    const videos = video.listVideos();
    videos.forEach(v => {
      console.log(`   - ${v.name}: ${v.duration}s (${v.dimensions})`);
    });

    // 2. Video Details
    console.log('\n2. Video Details:');
    if (videos.length > 0) {
      const v = videos[0];
      console.log(`   ${v.name}:`);
      console.log(`     Duration: ${v.duration}s`);
      console.log(`     Resolution: ${v.dimensions}`);
      console.log(`     FPS: ${v.fps}`);
      console.log(`     Formats: ${v.formats.length}`);
      console.log(`     Thumbnails: ${v.thumbnails.length}`);
    }

    // 3. Upload Video
    console.log('\n3. Upload Video:');
    const newVideo = video.uploadVideo({
      name: 'New Tutorial',
      originalUrl: '/videos/original/new-tutorial.mp4',
      duration: 300,
      dimensions: '1920x1080',
      fps: 30,
      size: 225000000
    });

    // 4. Create Encoding Job
    console.log('\n4. Create Encoding Jobs:');
    const job1 = video.createEncodingJob({
      videoId: newVideo.id,
      outputFormat: 'mp4',
      resolution: '1080p',
      quality: 'high'
    });

    const job2 = video.createEncodingJob({
      videoId: newVideo.id,
      outputFormat: 'mp4',
      resolution: '720p',
      quality: 'medium'
    });

    // 5. Process Job
    console.log('\n5. Process Jobs:');
    video.updateJobProgress(job1.id, 25);
    video.updateJobProgress(job1.id, 50);
    video.updateJobProgress(job1.id, 75);
    video.completeJob(job1.id, `${newVideo.originalUrl}_1080p.mp4`);

    video.updateJobProgress(job2.id, 50);
    video.completeJob(job2.id, `${newVideo.originalUrl}_720p.mp4`);

    // 6. Create Stream
    console.log('\n6. Create Streaming:');
    const stream = video.createStreamConfig({
      videoId: newVideo.id,
      protocol: 'hls',
      resolutions: ['1080p', '720p', '480p'],
      bitrates: [5000, 2500, 1000]
    });
    console.log(`   Stream URL: ${stream.url}`);

    // 7. Analyze Video
    console.log('\n7. Video Analysis:');
    const analysis = video.analyzeVideo(videos[0].id);
    console.log(`   Scenes detected: ${analysis.scenes.length}`);
    console.log(`   Total frames: ${analysis.frames}`);
    console.log(`   Keyframes: ${analysis.keyframes}`);

    // 8. Generate Thumbnail
    console.log('\n8. Generate Thumbnail:');
    video.generateThumbnail(videos[0].id, 45);

    // 9. List Jobs
    console.log('\n9. Encoding Jobs:');
    const jobs = video.listJobs();
    jobs.forEach(j => {
      const v = video.getVideo(j.videoId);
      console.log(`   - ${j.outputFormat} ${j.resolution}: ${j.status} (${j.progress}%)`);
    });

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = video.getStats();
    console.log(`   Videos Uploaded: ${stats.videosUploaded}`);
    console.log(`   Videos Ready: ${stats.videosReady}`);
    console.log(`   Jobs Completed: ${stats.jobsCompleted}`);
    console.log(`   Total Processing Time: ${stats.totalProcessingTime}`);
    console.log(`   Active Streams: ${stats.activeStreams}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'job':
    console.log('Encoding Jobs:');
    video.listJobs().forEach(j => {
      console.log(`  ${j.id}: ${j.status} (${j.progress}%)`);
    });
    break;

  case 'list':
    console.log('Videos:');
    video.listVideos().forEach(v => {
      console.log(`  ${v.name}: ${v.status}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-video.js [demo|job|list]');
}

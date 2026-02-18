/**
 * Agent STT - Speech-to-Text Agent
 *
 * Provides speech recognition capabilities.
 *
 * Usage: node agent-stt.js [command]
 * Commands:
 *   demo     - Run demonstration
 *   recognize - Recognize speech from audio
 *   models   - List available models
 */

class RecognitionResult {
  constructor(config) {
    this.id = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.transcript = config.transcript;
    this.confidence = config.confidence || 0.95;
    this.language = config.language || 'en-US';
    this.words = config.words || [];
    this.timestamps = config.timestamps || [];
  }
}

class AudioChunk {
  constructor(config) {
    this.id = `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.data = config.data;
    this.sampleRate = config.sampleRate || 16000;
    this.duration = config.duration;
    this.channels = config.channels || 1;
  }
}

class RecognitionModel {
  constructor(config) {
    this.id = `model-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.language = config.language;
    this.accuracy = config.accuracy; // low, medium, high
    this.latency = config.latency || 'medium'; // low, medium, high
    this.supportsStreaming = config.supportsStreaming || false;
  }
}

class SpeechContext {
  constructor(config) {
    this.id = `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.phrases = config.phrases || [];
    this.customWords = config.customWords || [];
  }
}

class STTAgent {
  constructor(config = {}) {
    this.name = config.name || 'STTAgent';
    this.version = config.version || '1.0';
    this.models = new Map();
    this.contexts = new Map();
    this.results = new Map();
    this.stats = {
      recognitionsCompleted: 0,
      totalDuration: 0,
      averageConfidence: 0
    };
    this.initModels();
  }

  initModels() {
    const models = [
      { name: 'base', language: 'en-US', accuracy: 'medium', latency: 'low', supportsStreaming: true },
      { name: 'enhanced', language: 'en-US', accuracy: 'high', latency: 'medium', supportsStreaming: true },
      { name: 'premium', language: 'en-US', accuracy: 'high', latency: 'high', supportsStreaming: false },
      { name: 'base', language: 'zh-CN', accuracy: 'medium', latency: 'low', supportsStreaming: true },
      { name: 'enhanced', language: 'zh-CN', accuracy: 'high', latency: 'medium', supportsStreaming: true }
    ];
    models.forEach(m => {
      const model = new RecognitionModel(m);
      this.models.set(model.name, model);
    });
  }

  recognize(audioData, language = 'en-US', modelName = 'enhanced') {
    const model = this.models.get(modelName);
    const confidence = model?.accuracy === 'high' ? 0.95 : 0.88;

    const words = ['Recognized', 'speech', 'from', 'audio'];
    const timestamps = words.map((w, i) => i * 0.5);

    const result = new RecognitionResult({
      transcript: 'This is the recognized speech from the audio input.',
      confidence,
      language,
      words,
      timestamps
    });

    this.results.set(result.id, result);

    this.stats.recognitionsCompleted++;
    this.stats.totalDuration += 2;
    this.stats.averageConfidence = (this.stats.averageConfidence * (this.stats.recognitionsCompleted - 1) + confidence) / this.stats.recognitionsCompleted;

    return result;
  }

  recognizeStream(audioChunks, language = 'en-US') {
    const results = [];
    audioChunks.forEach(chunk => {
      const result = this.recognize(chunk.data, language);
      results.push(result);
    });
    return results;
  }

  createContext(phrases = [], customWords = []) {
    const context = new SpeechContext({ phrases, customWords });
    this.contexts.set(context.id, context);
    return context;
  }

  recognizeWithContext(audioData, contextId, language = 'en-US') {
    const context = this.contexts.get(contextId);
    if (!context) {
      return this.recognize(audioData, language);
    }

    // Prioritize context phrases
    const result = this.recognize(audioData, language);
    result.confidence = Math.min(result.confidence + 0.05, 1.0);
    return result;
  }

  listModels(language = null) {
    if (language) {
      return Array.from(this.models.values()).filter(m => m.language === language);
    }
    return Array.from(this.models.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const stt = new STTAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent STT Demo\n');

    // 1. List Models
    console.log('1. Recognition Models:');
    const models = stt.listModels();
    console.log(`   Total: ${models.length} models`);
    models.slice(0, 3).forEach(m => {
      console.log(`   - ${m.name} (${m.language}): ${m.accuracy} accuracy, ${m.latency} latency`);
    });

    // 2. Recognize Speech
    console.log('\n2. Recognize Speech:');
    const result1 = stt.recognize('[audio_data]', 'en-US', 'enhanced');
    console.log(`   Transcript: ${result1.transcript}`);
    console.log(`   Confidence: ${result1.confidence}`);
    console.log(`   Language: ${result1.language}`);

    // 3. Recognize Chinese
    console.log('\n3. Recognize Chinese:');
    const result2 = stt.recognize('[audio_data]', 'zh-CN', 'enhanced');
    console.log(`   Transcript: ${result2.transcript}`);
    console.log(`   Language: ${result2.language}`);

    // 4. Speech Context
    console.log('\n4. Speech Context:');
    const context = stt.createContext(
      ['machine learning', 'artificial intelligence'],
      ['AI', 'ML', 'DL']
    );
    console.log(`   Context ID: ${context.id}`);
    console.log(`   Custom phrases: ${context.phrases.length}`);

    // 5. Words with Timestamps
    console.log('\n5. Words with Timestamps:');
    result1.words.forEach((w, i) => {
      console.log(`   [${result1.timestamps[i]}s] ${w}`);
    });

    // 6. Statistics
    console.log('\n6. Statistics:');
    const stats = stt.getStats();
    console.log(`   Recognitions: ${stats.recognitionsCompleted}`);
    console.log(`   Total Duration: ${stats.totalDuration}s`);
    console.log(`   Avg Confidence: ${stats.averageConfidence.toFixed(2)}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'recognize':
    const audio = args.slice(1).join(' ') || '[audio]';
    const result = stt.recognize(audio);
    console.log(`Transcript: ${result.transcript}`);
    console.log(`Confidence: ${result.confidence}`);
    break;

  case 'models':
    console.log('Available Models:');
    stt.listModels().forEach(m => {
      console.log(`  ${m.name} (${m.language}): ${m.accuracy} accuracy`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-stt.js [demo|recognize|models]');
}

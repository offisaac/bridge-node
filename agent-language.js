/**
 * Agent Language - Language Processing Agent
 *
 * Provides language detection, analysis, and processing capabilities.
 *
 * Usage: node agent-language.js [command]
 * Commands:
 *   demo      - Run demonstration
 *   detect    - Detect language
 *   analyze   - Analyze text
 */

class LanguageDetection {
  constructor(config) {
    this.id = `det-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.language = config.language;
    this.confidence = config.confidence;
    this.probabilities = config.probabilities || [];
  }
}

class TextAnalysis {
  constructor(config) {
    this.id = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.text = config.text;
    this.wordCount = config.wordCount;
    this.charCount = config.charCount;
    this.sentenceCount = config.sentenceCount;
    this.readability = config.readability || {};
    this.sentiment = config.sentiment || {};
    this.entities = config.entities || [];
  }
}

class LanguageProfile {
  constructor(config) {
    this.id = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.language = config.language;
    this.dialect = config.dialect;
    this.region = config.region;
    this.characteristics = config.characteristics || {};
  }
}

class TextNormalization {
  constructor(config) {
    this.id = `norm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.original = config.original;
    this.normalized = config.normalized;
    this.changes = config.changes || [];
  }
}

class LanguageAgent {
  constructor(config = {}) {
    this.name = config.name || 'LanguageAgent';
    this.version = config.version || '1.0';
    this.profiles = new Map();
    this.analyses = new Map();
    this.supportedLanguages = [
      'en', 'zh', 'es', 'fr', 'de', 'ja', 'ko', 'ru', 'ar', 'pt',
      'it', 'hi', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'ms', 'el'
    ];
    this.stats = {
      textsAnalyzed: 0,
      languagesDetected: 0,
      avgConfidence: 0
    };
    this.initProfiles();
  }

  initProfiles() {
    const profiles = [
      { language: 'en', dialect: 'American', region: 'US', characteristics: { script: 'Latin', direction: 'ltr' } },
      { language: 'zh', dialect: 'Mandarin', region: 'CN', characteristics: { script: 'CJK', direction: 'ltr' } },
      { language: 'ja', dialect: 'Standard', region: 'JP', characteristics: { script: 'CJK', direction: 'ltr' } },
      { language: 'ar', dialect: 'Standard', region: 'SA', characteristics: { script: 'Arabic', direction: 'rtl' } }
    ];
    profiles.forEach(p => {
      const profile = new LanguageProfile(p);
      this.profiles.set(profile.language, profile);
    });
  }

  detectLanguage(text) {
    // Simple language detection based on character patterns
    let language = 'en';
    let confidence = 0.9;

    if (/[\u4e00-\u9fff]/.test(text)) {
      language = 'zh';
      confidence = 0.95;
    } else if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      language = 'ja';
      confidence = 0.92;
    } else if (/[\uac00-\ud7af]/.test(text)) {
      language = 'ko';
      confidence = 0.93;
    } else if (/[\u0600-\u06ff]/.test(text)) {
      language = 'ar';
      confidence = 0.94;
    }

    const detection = new LanguageDetection({
      language,
      confidence,
      probabilities: [
        { language, confidence },
        { language: 'en', confidence: 1 - confidence }
      ]
    });

    this.stats.languagesDetected++;
    this.stats.avgConfidence = (this.stats.avgConfidence * (this.stats.languagesDetected - 1) + confidence) / this.stats.languagesDetected;

    return detection;
  }

  analyzeText(text) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    const analysis = new TextAnalysis({
      text,
      wordCount: words.length,
      charCount: text.length,
      sentenceCount: sentences.length,
      readability: {
        score: 75,
        level: 'moderate'
      },
      sentiment: {
        score: 0.2,
        label: 'neutral'
      },
      entities: [
        { text: 'Example', type: 'generic' }
      ]
    });

    this.analyses.set(analysis.id, analysis);
    this.stats.textsAnalyzed++;

    return analysis;
  }

  normalizeText(text) {
    const normalized = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();

    const changes = [];
    if (text !== normalized) {
      changes.push('Whitespace normalized');
    }

    return new TextNormalization({
      original: text,
      normalized,
      changes
    });
  }

  getLanguageProfile(language) {
    return this.profiles.get(language);
  }

  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const language = new LanguageAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Language Demo\n');

    // 1. Supported Languages
    console.log('1. Supported Languages:');
    console.log(`   Total: ${language.getSupportedLanguages().length} languages`);

    // 2. Language Detection - English
    console.log('\n2. Detect Language (English):');
    const detection1 = language.detectLanguage('Hello world');
    console.log(`   Language: ${detection1.language}`);
    console.log(`   Confidence: ${detection1.confidence}`);

    // 3. Language Detection - Chinese
    console.log('\n3. Detect Language (Chinese):');
    const detection2 = language.detectLanguage('你好世界');
    console.log(`   Language: ${detection2.language}`);
    console.log(`   Confidence: ${detection2.confidence}`);

    // 4. Text Analysis
    console.log('\n4. Text Analysis:');
    const analysis = language.analyzeText('This is a sample text. It contains multiple sentences for analysis.');
    console.log(`   Words: ${analysis.wordCount}`);
    console.log(`   Characters: ${analysis.charCount}`);
    console.log(`   Sentences: ${analysis.sentenceCount}`);
    console.log(`   Sentiment: ${analysis.sentiment.label} (${analysis.sentiment.score})`);
    console.log(`   Readability: ${analysis.readability.level}`);

    // 5. Text Normalization
    console.log('\n5. Text Normalization:');
    const normalized = language.normalizeText('  Hello   world  \n\n  ');
    console.log(`   Original: "${normalized.original}"`);
    console.log(`   Normalized: "${normalized.normalized}"`);
    console.log(`   Changes: ${normalized.changes.join(', ')}`);

    // 6. Language Profile
    console.log('\n6. Language Profile:');
    const profile = language.getLanguageProfile('zh');
    if (profile) {
      console.log(`   Language: ${profile.language}`);
      console.log(`   Dialect: ${profile.dialect}`);
      console.log(`   Script: ${profile.characteristics.script}`);
      console.log(`   Direction: ${profile.characteristics.direction}`);
    }

    // 7. Statistics
    console.log('\n7. Statistics:');
    const stats = language.getStats();
    console.log(`   Texts Analyzed: ${stats.textsAnalyzed}`);
    console.log(`   Languages Detected: ${stats.languagesDetected}`);
    console.log(`   Avg Confidence: ${stats.avgConfidence.toFixed(2)}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'detect':
    const text = args.slice(1).join(' ');
    if (!text) {
      console.log('Usage: node agent-language.js detect <text>');
      process.exit(1);
    }
    const detection = language.detectLanguage(text);
    console.log(`Language: ${detection.language} (${detection.confidence})`);
    break;

  case 'analyze':
    const analyzeText = args.slice(1).join(' ');
    if (!analyzeText) {
      console.log('Usage: node agent-language.js analyze <text>');
      process.exit(1);
    }
    const result = language.analyzeText(analyzeText);
    console.log(`Words: ${result.wordCount}, Chars: ${result.charCount}, Sentences: ${result.sentenceCount}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-language.js [demo|detect|analyze]');
}

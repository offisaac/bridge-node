/**
 * Agent Translation - Language Translation Agent
 *
 * Provides multilingual translation capabilities.
 *
 * Usage: node agent-translation.js [command]
 * Commands:
 *   demo      - Run demonstration
 *   translate - Translate text
 *   languages - List supported languages
 */

class Language {
  constructor(config) {
    this.code = config.code;
    this.name = config.name;
    this.nativeName = config.nativeName;
    this.direction = config.direction || 'ltr'; // ltr or rtl
  }
}

class TranslationPair {
  constructor(config) {
    this.id = `pair-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sourceLang = config.sourceLang;
    this.targetLang = config.targetLang;
    this.sourceText = config.sourceText;
    this.translatedText = config.translatedText;
    this.confidence = config.confidence || 0.95;
  }
}

class GlossaryTerm {
  constructor(config) {
    this.id = `glossary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.term = config.term;
    this.translation = config.translation;
    this.languagePair = config.languagePair;
    this.context = config.context || '';
  }
}

class TranslationMemory {
  constructor(config) {
    this.id = `tm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sourceText = config.sourceText;
    this.translatedText = config.translatedText;
    this.sourceLang = config.sourceLang;
    this.targetLang = config.targetLang;
    this.usageCount = 1;
    this.lastUsed = Date.now();
  }

  incrementUsage() {
    this.usageCount++;
    this.lastUsed = Date.now();
  }
}

class TranslationAgent {
  constructor(config = {}) {
    this.name = config.name || 'TranslationAgent';
    this.version = config.version || '1.0';
    this.languages = new Map();
    this.glossary = new Map();
    this.translationMemory = new Map();
    this.stats = {
      translationsCompleted: 0,
      charactersTranslated: 0,
      cacheHits: 0
    };
    this.initLanguages();
  }

  initLanguages() {
    const langs = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' }
    ];
    langs.forEach(l => {
      const lang = new Language(l);
      this.languages.set(lang.code, lang);
    });
  }

  translate(text, sourceLang, targetLang) {
    // Check translation memory first
    const tmKey = `${sourceLang}:${targetLang}:${text}`;
    if (this.translationMemory.has(tmKey)) {
      const tm = this.translationMemory.get(tmKey);
      tm.incrementUsage();
      this.stats.cacheHits++;
      return new TranslationPair({
        sourceLang,
        targetLang,
        sourceText: text,
        translatedText: tm.translatedText,
        confidence: 0.98
      });
    }

    // Simulate translation
    const translatedText = `[${targetLang}] ${text}`;
    const pair = new TranslationPair({
      sourceLang,
      targetLang,
      sourceText: text,
      translatedText
    });

    // Store in translation memory
    this.translationMemory.set(tmKey, new TranslationMemory({
      sourceText: text,
      translatedText,
      sourceLang,
      targetLang
    }));

    this.stats.translationsCompleted++;
    this.stats.charactersTranslated += text.length;

    return pair;
  }

  addGlossaryTerm(term, translation, languagePair) {
    const glossaryTerm = new GlossaryTerm({
      term,
      translation,
      languagePair
    });
    this.glossary.set(glossaryTerm.id, glossaryTerm);
    return glossaryTerm;
  }

  listLanguages() {
    return Array.from(this.languages.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const translator = new TranslationAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Translation Demo\n');

    // 1. List Languages
    console.log('1. Supported Languages:');
    const langs = translator.listLanguages();
    console.log(`   Total: ${langs.length} languages`);
    console.log(`   Sample: ${langs[0].name} (${langs[0].code}), ${langs[1].name} (${langs[1].code})`);

    // 2. Translate English to Chinese
    console.log('\n2. Translate EN to ZH:');
    const result1 = translator.translate('Hello world', 'en', 'zh');
    console.log(`   Source: ${result1.sourceText}`);
    console.log(`   Target: ${result1.translatedText}`);

    // 3. Translate English to Spanish
    console.log('\n3. Translate EN to ES:');
    const result2 = translator.translate('Good morning', 'en', 'es');
    console.log(`   Source: ${result2.sourceText}`);
    console.log(`   Target: ${result2.translatedText}`);

    // 4. Translate with cache hit
    console.log('\n4. Translation Memory (cache hit):');
    const result3 = translator.translate('Hello world', 'en', 'zh');
    console.log(`   Translated: ${result3.translatedText}`);
    console.log(`   Confidence: ${result3.confidence}`);

    // 5. Add Glossary Term
    console.log('\n5. Glossary:');
    const term = translator.addGlossaryTerm('machine learning', '机器学习', 'en-zh');
    console.log(`   Added: ${term.term} -> ${term.translation}`);

    // 6. Statistics
    console.log('\n6. Statistics:');
    const stats = translator.getStats();
    console.log(`   Translations: ${stats.translationsCompleted}`);
    console.log(`   Characters: ${stats.charactersTranslated}`);
    console.log(`   Cache Hits: ${stats.cacheHits}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'translate':
    const text = args[1];
    const source = args[2] || 'en';
    const target = args[3] || 'zh';
    if (!text) {
      console.log('Usage: node agent-translation.js translate <text> [source] [target]');
      process.exit(1);
    }
    const result = translator.translate(text, source, target);
    console.log(`${result.sourceText} -> ${result.translatedText}`);
    break;

  case 'languages':
    console.log('Supported Languages:');
    translator.listLanguages().forEach(l => {
      console.log(`  ${l.code}: ${l.name} (${l.nativeName})`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-translation.js [demo|translate|languages]');
}

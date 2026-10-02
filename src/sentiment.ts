/**
 * ============================================================================
 * MODULE: Aspect-Level Sentiment Classifier (src/sentiment.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Role in Pipeline:
 * 1. Takes extracted (aspect, opinion) pairs.
 * 2. Analyzes the sentiment valence and polarity of the opinion phrase using a
 *    VADER-based lexicon scoring engine adapted for E-Commerce terminology.
 * 3. Handles linguistic modifier nuances:
 *    - Negations ('not comfortable' -> Negative, 'not slow' -> Positive)
 *    - Intensifiers ('super fast' -> Boosted Positive, 'very hot' -> Boosted Negative)
 *    - Dampeners ('slightly loose' -> Dampened Negative)
 * 4. Categorizes into: Positive, Negative, Neutral with a normalized score [-1.0, +1.0].
 */

import { AspectOpinionPair, AspectSentimentResult, SentimentLabel } from "./types.js";

// Valence dictionary for general English and domain-specific e-commerce words
const SENTIMENT_LEXICON: Record<string, number> = {
  // --- Strongly Positive (Valence >= +2.5) ---
  phenomenal: 3.8,
  outstanding: 3.7,
  breathtaking: 3.6,
  flawless: 3.5,
  fantastic: 3.5,
  exceptional: 3.4,
  brilliant: 3.3,
  amazing: 3.3,
  superb: 3.2,
  magical: 3.2,
  unbeatable: 3.1,
  magnificent: 3.1,
  perfect: 3.0,
  stunningly: 3.0,
  silky: 2.8,
  gorgeous: 2.8,
  crystal: 2.7,
  "top notch": 3.4,
  "crystal clear": 3.5,

  // --- Moderately Positive (Valence +1.5 to +2.4) ---
  premium: 2.4,
  sturdy: 2.3,
  durable: 2.3,
  impressive: 2.3,
  reliable: 2.2,
  vibrant: 2.2,
  sharp: 2.1,
  smooth: 2.1,
  crisp: 2.0,
  comfortable: 2.0,
  accurate: 2.0,
  rich: 1.9,
  fast: 1.9,
  solid: 1.9,
  handy: 1.8,
  convenient: 1.8,
  breathable: 1.8,
  stylish: 1.8,
  modern: 1.7,
  lightweight: 1.7,
  intuitive: 1.7,
  snappy: 1.7,
  plush: 1.7,
  snug: 1.6,
  insightful: 1.6,
  good: 1.5,
  great: 2.0,
  clear: 1.6,
  clean: 1.5,
  decent: 1.0,
  easy: 1.4,
  rapid: 1.5,
  seamless: 2.2,

  // --- Mildly Positive (Valence +0.5 to +1.4) ---
  fine: 0.8,
  compact: 0.9,
  clicky: 0.8,
  versatile: 1.1,
  spacious: 1.2,
  roomy: 1.1,
  tailored: 1.2,
  cozy: 1.4,
  safe: 1.2,

  // --- Mildly Negative (Valence -0.5 to -1.4) ---
  stiff: -1.0,
  heavy: -1.0,
  bulky: -1.1,
  baggy: -1.0,
  pricey: -1.2,
  costly: -1.2,
  high: -0.9,
  loud: -1.1,
  narrow: -0.9,
  tight: -1.0,
  small: -0.8,
  dull: -1.3,
  flat: -1.0,
  bland: -1.3,
  scratchy: -1.4,
  slippery: -1.3,
  grainy: -1.4,
  tinny: -1.4,

  hot: -2.0,
  overheating: -2.8,
  throttles: -2.2,
  disappointing: -2.3,
  unhelpful: -2.2,
  delayed: -1.9,
  glitchy: -2.2,
  slow: -1.8,
  sluggish: -1.9,
  weak: -1.8,
  difficult: -1.7,
  confusing: -1.7,
  cluttered: -1.6,
  intrusive: -1.7,
  fragile: -1.8,
  flimsy: -2.0,
  insufficient: -1.8,
  expensive: -1.7,
  annoying: -2.0,
  frustrating: -2.2,
  uncomfortable: -2.3,
  loose: -1.2,
  complicated: -1.6,
  leaked: -2.2,

  // --- Strongly Negative (Valence <= -2.5) ---
  terrible: -3.4,
  horrible: -3.4,
  furious: -3.2,
  broken: -3.0,
  useless: -3.0,
  awful: -3.1,
  poor: -2.5,
  bad: -2.5
};

// Words that reverse the valence of following terms
const NEGATION_WORDS = new Set([
  "not", "never", "no", "n't", "cannot", "hardly", "barely", "scarcely", "without"
]);

// Modifier intensifiers that amplify sentiment valence
const INTENSIFIERS: Record<string, number> = {
  very: 0.35,
  super: 0.4,
  really: 0.35,
  extremely: 0.45,
  highly: 0.35,
  remarkably: 0.4,
  stunningly: 0.4,
  phenomenally: 0.45,
  insanely: 0.45,
  totally: 0.3,
  completely: 0.35,
  way: 0.3,
  too: 0.3,
  so: 0.25,
  exceptionally: 0.4
};

// Modifier dampeners that reduce sentiment valence
const DAMPENERS: Record<string, number> = {
  slightly: -0.25,
  somewhat: -0.2,
  bit: -0.2,
  little: -0.2,
  barely: -0.3,
  hardly: -0.3
};

export class AspectSentimentClassifier {
  /**
   * Evaluates the sentiment score and label for an opinion phrase.
   */
  public classifyOpinion(opinionText: string): { label: SentimentLabel; score: number; method: string } {
    const rawWords = opinionText.toLowerCase().replace(/[^\w\s'-]/g, "").split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) {
      return { label: "Neutral", score: 0.0, method: "Rule-Lexicon" };
    }

    let hasNegation = false;
    let boostModifier = 0.0;
    const scores: number[] = [];

    // First check multi-word idioms (e.g. "top notch", "crystal clear", "too small")
    const joined = rawWords.join(" ");
    if (SENTIMENT_LEXICON[joined] !== undefined) {
      scores.push(SENTIMENT_LEXICON[joined]);
    }

    for (let i = 0; i < rawWords.length; i++) {
      const word = rawWords[i];

      // Check negation
      if (NEGATION_WORDS.has(word) || word.endsWith("n't")) {
        hasNegation = true;
        continue;
      }

      // Check intensifiers
      if (INTENSIFIERS[word] !== undefined) {
        boostModifier += INTENSIFIERS[word];
        continue;
      }

      // Check dampeners
      if (DAMPENERS[word] !== undefined) {
        boostModifier += DAMPENERS[word];
        continue;
      }

      // Check base lexicon
      let baseValence = SENTIMENT_LEXICON[word];

      // Stemming fallback (e.g. 'unhelpful' -> -2.2, 'uncomfortable' -> -2.3)
      if (baseValence === undefined) {
        if (word.startsWith("un") && SENTIMENT_LEXICON[word.slice(2)] !== undefined) {
          baseValence = -1.0 * SENTIMENT_LEXICON[word.slice(2)];
        }
      }

      if (baseValence !== undefined) {
        let wordScore = baseValence;

        // Apply intensifier or dampener
        if (wordScore > 0) {
          wordScore += boostModifier;
        } else if (wordScore < 0) {
          wordScore -= boostModifier;
        }

        scores.push(wordScore);
        // Reset boost after application
        boostModifier = 0.0;
      }
    }

    // If no sentiment words found, evaluate default
    if (scores.length === 0) {
      // Check if it's an action verb with "well"
      if (opinionText.includes("well") || opinionText.includes("easily")) {
        scores.push(1.8);
      } else {
        return { label: "Neutral", score: 0.0, method: "Rule-Lexicon" };
      }
    }

    // Sum scores
    let totalValence = scores.reduce((acc, curr) => acc + curr, 0);

    // Apply negation flip (VADER standard multiplier = -0.74)
    if (hasNegation) {
      totalValence = totalValence * -0.74;
    }

    // VADER Compound Normalization: S = sum / sqrt(sum^2 + alpha) where alpha = 15
    const compound = totalValence / Math.sqrt(totalValence * totalValence + 15);
    const normalizedScore = Number(compound.toFixed(2));

    let label: SentimentLabel = "Neutral";
    if (normalizedScore >= 0.05) {
      label = "Positive";
    } else if (normalizedScore <= -0.05) {
      label = "Negative";
    }

    return {
      label,
      score: normalizedScore,
      method: "E-Commerce VADER Engine"
    };
  }

  /**
   * Analyzes an array of aspect-opinion pairs and returns structured results.
   */
  public analyzePairs(pairs: AspectOpinionPair[]): AspectSentimentResult[] {
    return pairs.map((pair) => {
      const res = this.classifyOpinion(pair.opinion);
      return {
        aspect: pair.aspect,
        opinion: pair.opinion,
        sentiment: res.label,
        score: res.score,
        method: res.method
      };
    });
  }
}

// Standalone execution test
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("sentiment.ts")) {
  console.log("================================================================================");
  console.log("TESTING TYPESCRIPT ASPECT SENTIMENT CLASSIFIER");
  console.log("================================================================================");

  const classifier = new AspectSentimentClassifier();
  const testOpinions = [
    { aspect: "sound quality", opinion: "phenomenal" },
    { aspect: "battery life", opinion: "terrible" },
    { aspect: "ear cushions", opinion: "not comfortable" },
    { aspect: "charging speed", opinion: "super fast" },
    { aspect: "customer service", opinion: "unhelpful" },
    { aspect: "sole grip", opinion: "slippery on wet roads" },
    { aspect: "screen", opinion: "sharp and crisp" },
    { aspect: "cooling system", opinion: "very hot" },
    { aspect: "touch registration", opinion: "sluggish" },
    { aspect: "connection", opinion: "not slow" }
  ];

  console.log(`${"Aspect".padEnd(22)} | ${"Opinion".padEnd(25)} | ${"Sentiment".padEnd(10)} | ${"Score"}`);
  console.log("-".repeat(70));

  const results = classifier.analyzePairs(testOpinions);
  for (const r of results) {
    console.log(`${r.aspect.padEnd(22)} | ${r.opinion.padEnd(25)} | ${r.sentiment.padEnd(10)} | ${r.score >= 0 ? "+" : ""}${r.score.toFixed(2)}`);
  }
}


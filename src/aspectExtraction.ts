/**
 * ============================================================================
 * MODULE: Aspect & Opinion Extraction (src/aspectExtraction.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Role in Pipeline:
 * 1. Identifies product aspect noun phrases (e.g. 'active noise cancellation',
 *    'sound quality', 'battery life', 'camera performance', 'charging speed', 'customer service').
 * 2. Identifies opinion modifiers across clause boundaries:
 *    - Clause Predicates: "noise cancellation is phenomenal" -> (noise cancellation, phenomenal)
 *    - Attributive Modifiers: "phenomenal sound quality" -> (sound quality, phenomenal)
 *    - Action Verb Descriptors: "battery life lasts over 30 hours" -> (battery life, lasts over 30 hours)
 *    - Negations: "ear cushions are not comfortable" -> (ear cushions, not comfortable)
 *    - Intensifiers: "charging speed is super fast" -> (charging speed, super fast)
 *    - Coordinate Clauses: "display is bright and vibrant" -> (display, bright), (display, vibrant)
 */

import { Token, AspectOpinionPair } from "./types.js";
import { cleanText, splitSentences, tokenizeSentence } from "./preprocess.js";

// Stop nouns that shouldn't be counted as standalone aspects unless part of a compound
const STANDALONE_STOP_NOUNS = new Set([
  "session", "sessions", "day", "days", "week", "weeks", "month", "months",
  "year", "years", "time", "times", "thing", "things", "picture", "pictures",
  "photo", "photos", "people", "person", "bit", "lot", "way", "something",
  "anything", "everything", "nothing", "product", "item", "road", "roads",
  "box", "star", "stars", "experience", "light", "lights", "mode", "run", "runs"
]);

// Purely descriptive prefixes/modifiers that attach to nouns rather than standing alone as opinions
const DESCRIPTIVE_NOUN_MODIFIERS = new Set([
  "active", "sound", "noise", "ear", "camera", "battery", "display", "screen",
  "charging", "cooling", "fan", "fabric", "stitching", "delivery", "sole",
  "running", "step", "heart", "rate", "mobile", "app", "suction", "pet",
  "brewing", "coffee", "cleaning", "backup", "quality", "service", "customer",
  "wrist", "phone", "audio", "video", "call", "voice", "touch", "control",
  "bluetooth", "gps", "filtration", "steam", "pressure", "water"
]);

// Linking & auxiliary verbs
const COPULAR_VERBS = new Set([
  "is", "are", "was", "were", "be", "been", "being", "feel", "feels", "felt",
  "look", "looks", "looked", "seem", "seems", "seemed", "sound", "sounds",
  "sounded", "get", "gets", "got", "remain", "remains"
]);

const ACTION_OPINION_VERBS = new Set([
  "works", "work", "worked", "lasts", "last", "lasted", "runs", "run",
  "heats", "heat", "throttles", "lacks", "absorbs", "leaked", "leaks"
]);

/**
 * Splits a sentence into linguistic clauses using punctuation and coordinating conjunctions.
 */
function splitClauses(sentence: string): string[] {
  return sentence
    .split(/[,;]|(?:\s+(?:but|though|although|while|however|whereas|and|plus)\s+)/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Extracts candidate aspect noun phrases from a token array.
 */
function extractAspectFromTokens(tokens: Token[]): string | null {
  const nounIndices: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.pos === "NOUN" || tok.pos === "PROPN" || DESCRIPTIVE_NOUN_MODIFIERS.has(tok.lower)) {
      nounIndices.push(i);
    }
  }

  if (nounIndices.length === 0) return null;

  // Group consecutive noun tokens into compound noun phrases
  const nounPhrases: string[] = [];
  let currentGroup: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isNoun = tok.pos === "NOUN" || tok.pos === "PROPN" || DESCRIPTIVE_NOUN_MODIFIERS.has(tok.lower);

    if (isNoun && tok.pos !== "PUNCT") {
      currentGroup.push(tok);
    } else {
      if (currentGroup.length > 0) {
        nounPhrases.push(currentGroup.map((t) => t.lower).join(" "));
        currentGroup = [];
      }
    }
  }
  if (currentGroup.length > 0) {
    nounPhrases.push(currentGroup.map((t) => t.lower).join(" "));
  }

  // Return the most descriptive noun phrase (longest non-stop noun)
  const validPhrases = nounPhrases.filter((p) => {
    if (STANDALONE_STOP_NOUNS.has(p) && !p.includes(" ")) return false;
    return p.length > 1;
  });

  return validPhrases.length > 0 ? validPhrases[0] : null;
}

/**
 * Extracts opinion words (adjectives, adverbs, participles) from tokens following a verb.
 */
function extractOpinionsFromTokens(tokens: Token[]): string[] {
  const opinions: string[] = [];
  let currentModifiers: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Negations and intensifiers
    if (tok.lower === "not" || tok.lower === "never" || tok.lower === "n't" || tok.pos === "ADV") {
      currentModifiers.push(tok.lower);
      continue;
    }

    // Adjectives & opinion terms
    if (tok.pos === "ADJ" && !DESCRIPTIVE_NOUN_MODIFIERS.has(tok.lower)) {
      const fullOpinion = [...currentModifiers, tok.lower].join(" ").trim();
      if (fullOpinion.length > 0) {
        opinions.push(fullOpinion);
      }
      currentModifiers = [];
    } else if (ACTION_OPINION_VERBS.has(tok.lower)) {
      // e.g. "works well", "lasts over 30 hours"
      const nextWord = tokens[i + 1]?.lower || "";
      const fullOpinion = nextWord ? `${tok.lower} ${nextWord}` : tok.lower;
      opinions.push(fullOpinion);
      currentModifiers = [];
    } else if (tok.lower === "well" || tok.lower === "easily") {
      opinions.push(tok.lower);
      currentModifiers = [];
    }
  }

  return opinions;
}

/**
 * Analyzes a single clause to discover aspect-opinion linkages.
 */
function analyzeClause(clauseTokens: Token[]): AspectOpinionPair[] {
  const pairs: AspectOpinionPair[] = [];

  // Find verb position
  let verbIndex = -1;
  for (let i = 0; i < clauseTokens.length; i++) {
    const tok = clauseTokens[i];
    if (COPULAR_VERBS.has(tok.lower) || ACTION_OPINION_VERBS.has(tok.lower) || tok.pos === "VERB") {
      verbIndex = i;
      break;
    }
  }

  if (verbIndex !== -1) {
    const subjectTokens = clauseTokens.slice(0, verbIndex);
    const predicateTokens = clauseTokens.slice(verbIndex + 1);

    const aspect = extractAspectFromTokens(subjectTokens);
    const opinions = extractOpinionsFromTokens(predicateTokens);

    if (aspect && opinions.length > 0) {
      for (const op of opinions) {
        pairs.push({ aspect, opinion: op });
      }
      return pairs;
    }
  }

  // Fallback: Check Attributive Adjective modifying Noun (e.g., "truly premium build", "phenomenal sound quality")
  for (let i = 0; i < clauseTokens.length; i++) {
    const tok = clauseTokens[i];
    if (tok.pos === "ADJ" && !DESCRIPTIVE_NOUN_MODIFIERS.has(tok.lower)) {
      let lookbackIndex = i - 1;
      const modifiers: string[] = [];
      while (lookbackIndex >= 0 && (clauseTokens[lookbackIndex].pos === "ADV" || clauseTokens[lookbackIndex].lower === "not")) {
        modifiers.unshift(clauseTokens[lookbackIndex].lower);
        lookbackIndex--;
      }

      const opinion = [...modifiers, tok.lower].join(" ").trim();
      const followingTokens = clauseTokens.slice(i + 1);
      const aspect = extractAspectFromTokens(followingTokens);

      if (aspect && opinion) {
        pairs.push({ aspect, opinion });
      }
    }
  }

  return pairs;
}

/**
 * Extracts aspect-opinion pairs from an entire customer review text.
 */
export function extractAspectOpinionPairs(text: string): AspectOpinionPair[] {
  const cleaned = cleanText(text);
  const sentences = splitSentences(cleaned);
  const allPairs: AspectOpinionPair[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const clauses = splitClauses(sentence);

    for (const clause of clauses) {
      const tokens = tokenizeSentence(clause);
      const clausePairs = analyzeClause(tokens);

      for (const p of clausePairs) {
        const key = `${p.aspect.toLowerCase()}:::${p.opinion.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          allPairs.push(p);
        }
      }
    }
  }

  return allPairs;
}

// Standalone execution test
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("aspectExtraction.ts")) {
  console.log("================================================================================");
  console.log("TESTING TYPESCRIPT ASPECT-OPINION EXTRACTION");
  console.log("================================================================================");

  const testReviews = [
    "The active noise cancellation is phenomenal and sound quality is crisp, but the headband gets uncomfortable.",
    "Call quality is crystal clear and battery life easily lasts over 30 hours! Truly premium build.",
    "Camera quality is outstanding in low light, but the battery backup is disappointing and price is high.",
    "Display is bright and vibrant, charging speed is super fast, but customer service was unhelpful."
  ];

  for (const rev of testReviews) {
    console.log(`\nReview: "${rev}"`);
    const pairs = extractAspectOpinionPairs(rev);
    console.log(`Extracted ${pairs.length} pairs:`);
    pairs.forEach((p) => {
      console.log(`  -> Aspect: [${p.aspect}] | Opinion: [${p.opinion}]`);
    });
  }
}

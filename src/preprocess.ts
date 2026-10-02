/**
 * ============================================================================
 * MODULE: Preprocessing & Linguistic Tokenizer (src/preprocess.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Role in Pipeline:
 * 1. Cleans raw customer review text:
 *    - Unescapes HTML entities (&amp;, &quot;, &#34;)
 *    - Strips HTML tags (<br />, <p>)
 *    - Translates sentiment emojis to descriptive text (😍 -> amazing, 👎 -> bad)
 *    - Strips URLs and mentions (http://..., @user)
 *    - Normalizes exaggerated character repetitions (e.g. 'goooood' -> 'good')
 *    - Expands English contractions (e.g. "can't" -> "cannot")
 * 2. Tokenizes sentences into words with Part-Of-Speech (POS) and Dependency annotations.
 */

import { Token, POSCategory } from "./types.js";

// Popular e-commerce emoji sentiment dictionary
export const EMOJI_SENTIMENT_MAP: Record<string, string> = {
  "😍": " amazing ",
  "🥰": " wonderful ",
  "❤️": " love ",
  "💖": " love ",
  "👍": " good ",
  "🔥": " great ",
  "✨": " excellent ",
  "⭐": " star ",
  "🌟": " outstanding ",
  "👌": " perfect ",
  "💯": " top notch ",
  "👏": " impressive ",
  "👎": " bad ",
  "😡": " furious ",
  "🤬": " terrible ",
  "🤮": " horrible ",
  "💩": " terrible ",
  "💔": " broken ",
  "😭": " crying ",
  "😢": " sad ",
  "🙄": " annoying ",
  "⚠️": " warning ",
  "❌": " poor "
};

// Contraction expansion map
export const CONTRACTIONS: Record<string, string> = {
  "can't": "cannot",
  "won't": "will not",
  "n't": " not",
  "'re": " are",
  "'s": " is",
  "'d": " would",
  "'ll": " will",
  "'t": " not",
  "'ve": " have",
  "'m": " am"
};

// Common closed-class and function word lists for linguistic tagging
const PRONOUNS = new Set([
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "their", "our", "its", "this", "that", "these", "those"
]);

const DETERMINERS = new Set(["the", "a", "an", "this", "that", "these", "those", "each", "every", "all", "some"]);

const PREPOSITIONS = new Set([
  "in", "on", "at", "for", "with", "by", "from", "to", "of", "about", "into",
  "through", "during", "under", "over", "after", "before", "between", "without"
]);

const CONJUNCTIONS = new Set(["and", "but", "or", "nor", "though", "although", "while", "yet", "however", "so", "plus"]);

const COPULAR_VERBS = new Set(["is", "are", "was", "were", "be", "been", "being", "feels", "feel", "looks", "look", "seems", "seem", "sounds", "sound"]);

const ADVERBS = new Set([
  "very", "super", "really", "extremely", "highly", "too", "so", "quite", "pretty",
  "noticeably", "substantially", "barely", "hardly", "slightly", "completely",
  "totally", "well", "easily", "remarkably", "stunningly", "phenomenally", "effortlessly",
  "constantly", "intermittently", "sluggishly", "outdoors", "always", "never", "not"
]);

const KNOWN_ADJECTIVES = new Set([
  "phenomenal", "active", "crystal", "clear", "fantastic", "terrible", "premium", "sturdy", "comfortable", "outstanding",
  "disappointing", "high", "bright", "vibrant", "fast", "unhelpful", "horrible",
  "hot", "smooth", "solid", "amazing", "loud", "soft", "breathable", "dull",
  "perfect", "durable", "delayed", "slippery", "stylish", "modern", "small",
  "tight", "sharp", "accurate", "glitchy", "slow", "impressive", "strong",
  "confusing", "weak", "rich", "difficult", "crisp", "uncomfortable", "clear",
  "compact", "decent", "magical", "exceptional", "lightweight", "grainy",
  "convenient", "fragile", "silky", "gorgeous", "insane", "handy", "incredible",
  "unmatched", "bulky", "heavy", "mediocre", "clean", "clicky", "insufficient",
  "brilliant", "flawless", "breathtaking", "ergonomic", "tinny", "intuitive",
  "insightful", "stiff", "pinpoint", "basic", "robust", "unnoticeable", "rapid",
  "loose", "complicated", "magnificent", "seamless", "plush", "snug", "bland",
  "scratchy", "baggy", "infinite", "ink", "cluttered", "flat", "natural",
  "lifelike", "snappy", "intrusive", "sluggish", "pocketable", "good", "bad",
  "poor", "great", "easy", "expensive", "costly", "cheap", "wide", "narrow",
  "truly", "barista-level", "top", "tier"
]);

const KNOWN_NOUNS = new Set([
  "sound", "quality", "cancellation", "battery", "life", "backup", "headband",
  "call", "touch", "control", "controls", "support", "bass", "response", "app",
  "connection", "bluetooth", "microphone", "ear", "cups", "mode", "audio",
  "tips", "fit", "speed", "price", "frame", "display", "performance", "photos",
  "photo", "device", "button", "speakers", "speaker", "screen", "drain", "glass",
  "video", "ios", "corner", "corners", "palm", "processing", "color", "colors",
  "shutter", "lag", "features", "build", "phone", "sensor", "dictation", "reception",
  "scanner", "ui", "promise", "factor", "hand", "trackpad", "design", "keyboard",
  "ram", "memory", "sharpness", "port", "ports", "finish", "fan", "fans", "deck",
  "webcam", "chassis", "lighting", "gesture", "tracking", "metrics", "algorithm",
  "algorithms", "strap", "face", "feedback", "gps", "endurance", "suggestions",
  "casing", "illumination", "dust", "suction", "power", "efficiency", "trigger",
  "fatigue", "tool", "dustbin", "mechanism", "wand", "parts", "filtration",
  "system", "cooker", "pot", "function", "ring", "manual", "instructions", "valve",
  "latch", "extraction", "crema", "wand", "interface", "reservoir", "taste",
  "grinder", "cycle", "machine", "avoidance", "cables", "map", "station",
  "scheduling", "cleaning", "brush", "bag", "wheels", "rugs", "integration",
  "noise", "cushioning", "runs", "mesh", "upper", "breathability", "grip",
  "padding", "width", "feet", "durability", "tread", "wear", "trainer", "shoe",
  "shoes", "support", "insoles", "blisters", "absorption", "transitions", "lockdown",
  "traction", "comfort", "lining", "weight", "stitching", "eyelets", "fabric",
  "waist", "size", "zipper", "material", "loops", "length", "exterior", "warmth",
  "pockets", "pilling", "construction", "ratio", "menu", "ads", "bezel",
  "panel", "pixels", "warranty", "remote", "glare", "reflection", "handshakes",
  "light", "resolution", "cover", "registration"
]);

/**
 * Normalizes emojis into descriptive sentiment tokens or strips unhandled ones.
 */
export function normalizeEmojis(text: string): string {
  let result = text;
  for (const [emoji, replacement] of Object.entries(EMOJI_SENTIMENT_MAP)) {
    if (result.includes(emoji)) {
      result = result.split(emoji).join(replacement);
    }
  }
  // Strip remaining non-ASCII artifacts
  return result.replace(/[^\x00-\x7F]+/g, " ");
}

/**
 * Normalizes exaggerated character repetitions (e.g. 'goooood' -> 'good').
 */
export function normalizeElongatedWords(text: string): string {
  return text.replace(/(.)\1{2,}/g, "$1$1");
}

/**
 * Unescapes standard HTML entities.
 */
export function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&nbsp;/g, " ");
}

/**
 * Cleans and normalizes raw review text.
 */
export function cleanText(text: string): string {
  if (!text || typeof text !== "string") return "";

  let cleaned = unescapeHtml(text);
  cleaned = cleaned.replace(/<[^>]+>/g, " "); // Strip HTML tags
  cleaned = cleaned.replace(/https?:\/\/\S+|www\.\S+/g, " "); // Strip URLs
  cleaned = cleaned.replace(/@\w+/g, " "); // Strip mentions
  cleaned = normalizeEmojis(cleaned);

  // Normalize smart quotes and dashes
  cleaned = cleaned
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, " ");

  // Expand contractions
  for (const [pattern, replacement] of Object.entries(CONTRACTIONS)) {
    const regex = new RegExp(pattern.replace("'", "\\'"), "gi");
    cleaned = cleaned.replace(regex, replacement);
  }

  cleaned = normalizeElongatedWords(cleaned);
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Simple English lemmatizer.
 */
function lemmatize(word: string, pos: POSCategory): string {
  const lower = word.toLowerCase();
  if (pos === "NOUN") {
    if (lower.endsWith("ies") && lower.length > 4) return lower.slice(0, -3) + "y";
    if (lower.endsWith("es") && (lower.endsWith("shes") || lower.endsWith("ches") || lower.endsWith("sses"))) return lower.slice(0, -2);
    if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 3) return lower.slice(0, -1);
  }
  if (pos === "VERB") {
    if (lower === "is" || lower === "are" || lower === "was" || lower === "were") return "be";
    if (lower.endsWith("ing") && lower.length > 4) return lower.slice(0, -3);
    if (lower.endsWith("ed") && lower.length > 3) return lower.slice(0, -2);
    if (lower.endsWith("s") && lower.length > 3) return lower.slice(0, -1);
  }
  return lower;
}

/**
 * Tokenizes raw text into sentences.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Tokenizes and POS-tags a single sentence with syntactic dependency labels.
 */
export function tokenizeSentence(sentence: string): Token[] {
  const rawTokens = sentence.match(/[\w'-]+|[.,!?;:()]/g) || [];
  const tokens: Token[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const raw = rawTokens[i];
    const lower = raw.toLowerCase();

    let pos: POSCategory = "X";
    let tag = "NN";

    if (/^[.,!?;:()]+$/.test(raw)) {
      pos = "PUNCT";
      tag = raw;
    } else if (PRONOUNS.has(lower)) {
      pos = "PRON";
      tag = "PRP";
    } else if (DETERMINERS.has(lower)) {
      pos = "DET";
      tag = "DT";
    } else if (PREPOSITIONS.has(lower)) {
      pos = "ADP";
      tag = "IN";
    } else if (CONJUNCTIONS.has(lower)) {
      pos = "CONJ";
      tag = "CC";
    } else if (COPULAR_VERBS.has(lower)) {
      pos = "VERB";
      tag = "VBZ";
    } else if (ADVERBS.has(lower) || lower.endsWith("ly")) {
      pos = "ADV";
      tag = "RB";
    } else if (KNOWN_ADJECTIVES.has(lower) || lower.endsWith("able") || lower.endsWith("ful") || lower.endsWith("ous") || lower.endsWith("ive")) {
      pos = "ADJ";
      tag = "JJ";
    } else if (KNOWN_NOUNS.has(lower) || /^[A-Z]/.test(raw)) {
      pos = "NOUN";
      tag = "NN";
    } else if (/^\d+$/.test(raw)) {
      pos = "NUM";
      tag = "CD";
    } else {
      // Default heuristic: If next word is noun, likely adjective; otherwise noun
      pos = "NOUN";
      tag = "NN";
    }

    const lemma = lemmatize(lower, pos);

    tokens.push({
      index: i,
      text: raw,
      lower,
      lemma,
      pos,
      tag,
      dep: "dep",
      headIndex: -1
    });
  }

  // Syntactic Dependency Assignment Pass
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const nextTok = tokens[i + 1];
    const prevTok = tokens[i - 1];

    if (tok.pos === "ADJ") {
      if (nextTok && nextTok.pos === "NOUN") {
        tok.dep = "amod";
        tok.headIndex = nextTok.index;
      }
    } else if (tok.pos === "NOUN") {
      if (nextTok && nextTok.pos === "NOUN") {
        tok.dep = "compound";
        tok.headIndex = nextTok.index;
      }
    } else if (tok.lower === "not" || tok.lower === "n't" || tok.lower === "never") {
      tok.dep = "neg";
      if (nextTok) tok.headIndex = nextTok.index;
    } else if (tok.pos === "ADV") {
      tok.dep = "advmod";
      if (nextTok) tok.headIndex = nextTok.index;
    } else if (tok.pos === "CONJ") {
      tok.dep = "cc";
    }
  }

  return tokens;
}

/**
 * Preprocesses a review text and returns tokens for each sentence.
 */
export function preprocessReview(text: string): Token[][] {
  const cleaned = cleanText(text);
  const sentences = splitSentences(cleaned);
  return sentences.map((s) => tokenizeSentence(s));
}

// Standalone execution test
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("preprocess.ts")) {
  console.log("================================================================================");
  console.log("TESTING TYPESCRIPT PREPROCESSING & TOKENIZER");
  console.log("================================================================================");

  const sample = "The active noise cancellation is phenomenal 😍, but the battery life is terrible! <br />";
  const cleaned = cleanText(sample);
  console.log(`Original : "${sample}"`);
  console.log(`Cleaned  : "${cleaned}"\n`);

  const sentences = preprocessReview(sample);
  sentences.forEach((tokens, idx) => {
    console.log(`Sentence #${idx + 1} (${tokens.length} tokens):`);
    console.log(
      tokens
        .map((t) => `${t.text}[${t.pos}:${t.dep}]`)
        .join(" ")
    );
  });
}


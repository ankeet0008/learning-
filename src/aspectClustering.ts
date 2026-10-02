/**
 * ============================================================================
 * MODULE: Aspect Clustering & Taxonomy Canonicalization (src/aspectClustering.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Role in Pipeline:
 * 1. Groups raw, fragmented aspect terms (e.g. 'battery life', 'charging speed', 'battery drain')
 *    into high-level Canonical Categories (e.g. 'Battery & Power').
 * 2. Uses keyword taxonomy matching and token-similarity fallbacks.
 * 3. Computes Net Sentiment Scores (NSS = (Pos - Neg) / Total * 100).
 * 4. Provides a Head-to-Head Product Comparison Engine across categories.
 */

import {
  CanonicalCategory,
  CategorizedAspectResult,
  AspectSentimentResult,
  CategorySummary,
  HierarchicalProductMatrix,
  ProductComparisonReport,
  ProductComparisonMetric,
  ReviewAnalysis
} from "./types.js";

// Comprehensive domain keyword taxonomy for e-commerce canonical categories
const CATEGORY_TAXONOMY: Record<CanonicalCategory, string[]> = {
  "Battery & Power": [
    "battery", "power", "charging", "charger", "magsafe", "backup", "drain",
    "adapter", "brick", "plug", "socket", "endurance", "runtime", "watts", "charge"
  ],
  "Audio & Sound": [
    "sound", "audio", "noise", "cancellation", "speaker", "speakers", "bass",
    "treble", "microphone", "mic", "transparency", "volume", "voice", "acoustic",
    "clarity", "ear cups", "earcups", "tinny"
  ],
  "Display & Visuals": [
    "display", "screen", "oled", "amoled", "brightness", "refresh", "rate",
    "sharpness", "contrast", "resolution", "bezel", "anti-reflective", "glare",
    "viewing", "pixels", "color", "colors", "hdr", "graphics", "panel", "front light"
  ],
  "Camera & Imaging": [
    "camera", "photo", "photos", "video", "recording", "lens", "zoom", "shutter",
    "daylight", "low light", "portrait", "sensor", "laser", "illumination", "night mode"
  ],
  "Performance & Software": [
    "performance", "gaming", "software", "processor", "ios", "android", "app",
    "ui", "ram", "memory", "boot", "speed", "rendering", "fps", "lag", "framerate",
    "siri", "alexa", "integration", "algorithm", "algorithms", "dictation", "haptic",
    "tracking", "gesture", "gps", "filtration", "efficiency", "suction", "navigation",
    "avoidance", "scheduling", "presets", "sauté", "extraction", "grinder",
    "fast", "slow", "connection", "bluetooth", "pairing", "reception"
  ],
  "Build Quality & Design": [
    "build", "design", "titanium", "frame", "chassis", "material", "finish",
    "durability", "scratch", "waterproof", "water", "resistance", "glass", "sturdy",
    "aluminum", "metal", "weight", "plastic", "tread", "wear", "bezel", "deck",
    "wand", "pot", "casing", "base station", "buttons", "button", "aesthetic",
    "flush-front", "back glass", "back cover", "trackpad", "keyboard", "touchpad",
    "s-pen", "controls", "touch controls", "touch registration", "remote"
  ],
  "Comfort & Ergonomics": [
    "comfort", "cushioning", "cushions", "headband", "fit", "strap", "ear tips",
    "palm", "size", "width", "tight", "padding", "fabric", "breathability",
    "insole", "insoles", "arch", "support", "lining", "collar", "waist", "zipper",
    "pocket", "pockets", "warmth", "texture", "blisters", "corners", "lockdown",
    "hand", "wrist", "hand fatigue", "trigger"
  ],
  "Customer Service & Value": [
    "price", "cost", "value", "customer", "service", "support", "warranty",
    "delivery", "shipping", "return", "replacement", "package", "packaging",
    "manual", "instructions", "parts", "retail price", "ads", "store"
  ],
  "General & Other": []
};

/**
 * Maps a raw aspect phrase to its corresponding Canonical Category.
 */
export function categorizeAspect(aspect: string): { category: CanonicalCategory; confidence: number } {
  const aspectClean = aspect.toLowerCase().trim();
  const aspectTokens = aspectClean.split(/\s+/).filter(Boolean);

  let bestCategory: CanonicalCategory = "General & Other";
  let maxScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_TAXONOMY) as [CanonicalCategory, string[]][]) {
    if (category === "General & Other") continue;

    let score = 0;
    for (const kw of keywords) {
      // Exact match check
      if (aspectClean === kw) {
        score += 3.0;
      } else if (aspectClean.includes(kw)) {
        score += 1.5;
      } else {
        // Token level match
        for (const tok of aspectTokens) {
          if (tok === kw) {
            score += 1.0;
          }
        }
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  const confidence = maxScore > 0 ? Math.min(1.0, Number((maxScore / 3.0).toFixed(2))) : 0.4;
  return { category: bestCategory, confidence };
}

/**
 * Enhances aspect-sentiment results by attaching their canonical category.
 */
export function categorizeAspectResults(results: AspectSentimentResult[]): CategorizedAspectResult[] {
  return results.map((res) => {
    const { category, confidence } = categorizeAspect(res.aspect);
    return {
      ...res,
      category,
      confidence
    };
  });
}

/**
 * Computes Net Sentiment Score (NSS = (Pos - Neg) / Total * 100) and qualitative health status.
 */
export function calculateNetSentimentScore(
  positive: number,
  negative: number,
  neutral: number
): { nss: number; status: string } {
  const total = positive + negative + neutral;
  if (total === 0) return { nss: 0, status: "No Data" };

  const nss = Math.round(((positive - negative) / total) * 100);

  let status = "Mixed / Neutral";
  if (nss >= 60) {
    status = "Outstanding / Delight";
  } else if (nss >= 20) {
    status = "Strong Performer / Good";
  } else if (nss >= -19) {
    status = "Mixed / Neutral";
  } else if (nss >= -50) {
    status = "Needs Improvement / Warning";
  } else {
    status = "Critical Defect / Alert";
  }

  return { nss, status };
}

/**
 * Builds a hierarchical product intelligence matrix aggregated by canonical categories.
 */
export function buildHierarchicalMatrix(reviewsAnalysis: ReviewAnalysis[]): HierarchicalProductMatrix {
  const matrix: HierarchicalProductMatrix = {};

  for (const rev of reviewsAnalysis) {
    if (!matrix[rev.product]) {
      matrix[rev.product] = {} as Record<CanonicalCategory, CategorySummary>;
    }

    for (const asp of rev.aspects) {
      const cat = asp.category;
      if (!matrix[rev.product][cat]) {
        matrix[rev.product][cat] = {
          category: cat,
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0,
          nss: 0,
          status: "",
          aspects: {}
        };
      }

      const catSummary = matrix[rev.product][cat];
      catSummary[asp.sentiment === "Positive" ? "positive" : asp.sentiment === "Negative" ? "negative" : "neutral"]++;
      catSummary.total++;

      // Sub-aspect accumulation
      const aspKey = asp.aspect.toLowerCase();
      if (!catSummary.aspects[aspKey]) {
        catSummary.aspects[aspKey] = { Positive: 0, Negative: 0, Neutral: 0 };
      }
      catSummary.aspects[aspKey][asp.sentiment]++;
    }
  }

  // Calculate NSS for each product category
  for (const product of Object.keys(matrix)) {
    for (const cat of Object.keys(matrix[product]) as CanonicalCategory[]) {
      const summary = matrix[product][cat];
      const { nss, status } = calculateNetSentimentScore(summary.positive, summary.negative, summary.neutral);
      summary.nss = nss;
      summary.status = status;
    }
  }

  return matrix;
}

/**
 * Compares two products side-by-side across all canonical categories.
 */
export function compareProducts(
  matrix: HierarchicalProductMatrix,
  productAName: string,
  productBName: string
): ProductComparisonReport {
  // Fuzzy match product names if exact match isn't found
  const availableProducts = Object.keys(matrix);
  const findMatch = (query: string) => {
    return availableProducts.find((p) => p.toLowerCase().includes(query.toLowerCase())) || query;
  };

  const actualProdA = findMatch(productAName);
  const actualProdB = findMatch(productBName);

  const dataA = matrix[actualProdA] || {};
  const dataB = matrix[actualProdB] || {};

  const allCategories = new Set([
    ...(Object.keys(dataA) as CanonicalCategory[]),
    ...(Object.keys(dataB) as CanonicalCategory[])
  ]);

  const metrics: ProductComparisonMetric[] = [];
  let scoreA = 0;
  let scoreB = 0;

  for (const cat of allCategories) {
    if (cat === "General & Other") continue;

    const catA = dataA[cat] || { total: 0, nss: 0, positive: 0 };
    const catB = dataB[cat] || { total: 0, nss: 0, positive: 0 };

    const posRateA = catA.total > 0 ? Math.round((catA.positive / catA.total) * 100) : 0;
    const posRateB = catB.total > 0 ? Math.round((catB.positive / catB.total) * 100) : 0;

    let winner = "Tie / Inconclusive";
    let verdictNote = "Similar performance";

    if (catA.total > 0 && catB.total === 0) {
      if (catA.nss > 0) {
        winner = actualProdA;
        verdictNote = `${actualProdA} evaluated positively (+${catA.nss}% NSS)`;
        scoreA++;
      } else if (catA.nss < 0) {
        winner = `${actualProdA} (Flagged Alert)`;
        verdictNote = `${actualProdA} has negative sentiment (${catA.nss}% NSS)`;
        scoreB++;
      } else {
        winner = "Inconclusive";
        verdictNote = `Only evaluated for ${actualProdA} (Neutral)`;
      }
    } else if (catB.total > 0 && catA.total === 0) {
      if (catB.nss > 0) {
        winner = actualProdB;
        verdictNote = `${actualProdB} evaluated positively (+${catB.nss}% NSS)`;
        scoreB++;
      } else if (catB.nss < 0) {
        winner = `${actualProdB} (Flagged Alert)`;
        verdictNote = `${actualProdB} has negative sentiment (${catB.nss}% NSS)`;
        scoreA++;
      } else {
        winner = "Inconclusive";
        verdictNote = `Only evaluated for ${actualProdB} (Neutral)`;
      }
    } else if (catA.nss > catB.nss) {
      winner = actualProdA;
      verdictNote = `${actualProdA} leads by +${catA.nss - catB.nss}% NSS`;
      scoreA++;
    } else if (catB.nss > catA.nss) {
      winner = actualProdB;
      verdictNote = `${actualProdB} leads by +${catB.nss - catA.nss}% NSS`;
      scoreB++;
    }

    metrics.push({
      category: cat,
      productA: {
        name: actualProdA,
        totalMentions: catA.total,
        nss: catA.nss,
        positiveRate: posRateA
      },
      productB: {
        name: actualProdB,
        totalMentions: catB.total,
        nss: catB.nss,
        positiveRate: posRateB
      },
      winner,
      verdictNote
    });
  }

  const overallWinner = scoreA > scoreB ? actualProdA : scoreB > scoreA ? actualProdB : "Draw / Equal Competitors";

  return {
    productA: actualProdA,
    productB: actualProdB,
    metrics,
    overallWinner
  };
}

/**
 * Prints a formatted head-to-head comparison card in the terminal.
 */
export function printComparisonReport(report: ProductComparisonReport): void {
  console.log("\n" + "=".repeat(84));
  console.log("             HEAD-TO-HEAD PRODUCT ASPECT INTELLIGENCE COMPARISON");
  console.log("=".repeat(84));
  console.log(`  [Product A]: ${report.productA}`);
  console.log(`  [Product B]: ${report.productB}\n`);

  console.log(
    `${"Category".padEnd(24)} | ${"Product A (NSS)".padEnd(16)} | ${"Product B (NSS)".padEnd(16)} | Winner / Advantage`
  );
  console.log("-".repeat(84));

  for (const m of report.metrics) {
    const aStr = m.productA.totalMentions > 0 ? `${m.productA.nss >= 0 ? "+" : ""}${m.productA.nss}% (${m.productA.totalMentions} rev)` : "N/A";
    const bStr = m.productB.totalMentions > 0 ? `${m.productB.nss >= 0 ? "+" : ""}${m.productB.nss}% (${m.productB.totalMentions} rev)` : "N/A";
    const winnerDisplay = m.winner === report.productA ? `[A] ${report.productA}` : m.winner === report.productB ? `[B] ${report.productB}` : m.winner;

    console.log(
      `${m.category.padEnd(24)} | ${aStr.padEnd(16)} | ${bStr.padEnd(16)} | ${winnerDisplay}`
    );
  }

  console.log("=".repeat(84));
  console.log(`  🏆 OVERALL BENCHMARK WINNER: ${report.overallWinner}`);
  console.log("=".repeat(84) + "\n");
}

// Standalone execution test
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("aspectClustering.ts")) {
  console.log("================================================================================");
  console.log("TESTING TYPESCRIPT ASPECT CLUSTERING & TAXONOMY");
  console.log("================================================================================");

  const sampleAspects = [
    "battery life",
    "charging speed",
    "battery drain",
    "sound quality",
    "active noise cancellation",
    "internal speakers",
    "camera performance",
    "low light photos",
    "screen refresh rate",
    "oled display",
    "trackpad",
    "titanium frame",
    "ear cushions",
    "customer support",
    "retail price"
  ];

  console.log(`${"Raw Aspect".padEnd(30)} | ${"Canonical Category".padEnd(26)} | Confidence`);
  console.log("-".repeat(70));

  for (const asp of sampleAspects) {
    const { category, confidence } = categorizeAspect(asp);
    console.log(`${asp.padEnd(30)} | ${category.padEnd(26)} | ${(confidence * 100).toFixed(0)}%`);
  }
}

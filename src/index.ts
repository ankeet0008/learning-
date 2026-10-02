/**
 * ============================================================================
 * MAIN PIPELINE EXECUTION (src/index.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Description:
 * End-to-End Aspect-Based Sentiment Analysis & Canonical Clustering Pipeline:
 * 1. Ingest customer review datasets (Kaggle or Sample)
 * 2. Profile dataset via Exploratory Data Analysis (EDA)
 * 3. Extract (Aspect, Opinion) syntactic pairs
 * 4. Classify Aspect Sentiment Polarity via E-Commerce VADER engine
 * 5. Canonicalize aspects into 8 standardized High-Level Categories
 * 6. Compute Net Sentiment Scores (NSS = (Pos - Neg) / Total * 100)
 * 7. Display Hierarchical Product Intelligence Trees & Compare Products
 * 8. Export structured analytical datasets to CSV/JSON in outputs/
 *
 * Usage:
 *   npm start
 *   npm run pipeline:kaggle
 *   npx tsx src/index.ts --dataset kaggle --compare "iPhone 15 Pro" "Galaxy S24 Ultra"
 */

import * as fs from "fs";
import * as path from "path";
import {
  Review,
  ReviewAnalysis,
  HierarchicalProductMatrix,
  PipelineOptions,
  ProductComparisonReport
} from "./types.js";
import { loadDataset, generateEDAReport, printEDASummary } from "./datasetLoader.js";
import { extractAspectOpinionPairs } from "./aspectExtraction.js";
import { AspectSentimentClassifier } from "./sentiment.js";
import {
  categorizeAspectResults,
  buildHierarchicalMatrix,
  compareProducts,
  printComparisonReport
} from "./aspectClustering.js";

/**
 * Parses CLI command line arguments.
 */
function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const options: PipelineOptions = {
    dataset: "kaggle",
    sampleSize: undefined,
    category: undefined,
    product: undefined,
    showEDA: false,
    exportResults: false,
    outputDir: "./outputs",
    compare: undefined
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dataset" && args[i + 1]) {
      options.dataset = args[++i];
    } else if (arg === "--sample-size" && args[i + 1]) {
      options.sampleSize = parseInt(args[++i], 10);
    } else if (arg === "--category" && args[i + 1]) {
      options.category = args[++i];
    } else if (arg === "--product" && args[i + 1]) {
      options.product = args[++i];
    } else if (arg === "--eda") {
      options.showEDA = true;
    } else if (arg === "--export") {
      options.exportResults = true;
    } else if (arg === "--output-dir" && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === "--compare" && args[i + 1] && args[i + 2]) {
      options.compare = [args[++i], args[++i]];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Aspect-Based E-Commerce Feedback Summarizer (Phase 2)

Options:
  --dataset <name|path>        Dataset source: 'kaggle', 'sample', or custom CSV path (default: 'kaggle')
  --sample-size <number>       Limit the number of reviews to process (e.g. 25, 50, 100)
  --category <name>            Filter reviews by category (e.g. 'Smartphones', 'Audio', 'Laptops')
  --product <name>             Filter reviews by product name (e.g. 'AirPods', 'MacBook')
  --compare <prodA> <prodB>    Head-to-head comparison between two products across canonical categories
  --eda                        Display Exploratory Data Analysis (EDA) profile
  --export                     Export extracted aspects and product matrices to CSV in outputs/
  --output-dir <path>          Directory path for exported results (default: './outputs')
  --help, -h                   Show this help message
      `);
      process.exit(0);
    }
  }

  return options;
}

/**
 * Resolves dataset file path from option identifier.
 */
function resolveDatasetPath(datasetOption: string): string {
  if (datasetOption === "sample") {
    return path.resolve(process.cwd(), "data", "sample_reviews.csv");
  }
  if (datasetOption === "kaggle") {
    return path.resolve(process.cwd(), "data", "kaggle_amazon_sample.csv");
  }
  return path.resolve(process.cwd(), datasetOption);
}

/**
 * Capitalizes string cleanly for presentation.
 */
function titleCase(str: string): string {
  return str
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

/**
 * Exports analysis results and hierarchical category matrices to CSV files.
 */
function exportResults(
  reviewsAnalysis: ReviewAnalysis[],
  hierarchicalMatrix: HierarchicalProductMatrix,
  comparisonReport: ProductComparisonReport | null,
  outputDir: string
): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Export Aspect-Sentiment Results with Categories Table
  const aspectsCsvRows: string[] = [
    "review_id,product,category,rating,canonical_category,aspect,opinion,sentiment,score,method"
  ];

  for (const rev of reviewsAnalysis) {
    for (const asp of rev.aspects) {
      const row = [
        `"${rev.review_id}"`,
        `"${rev.product.replace(/"/g, '""')}"`,
        `"${rev.category}"`,
        rev.rating !== null && rev.rating !== undefined ? rev.rating : "",
        `"${asp.category}"`,
        `"${asp.aspect}"`,
        `"${asp.opinion}"`,
        `"${asp.sentiment}"`,
        asp.score,
        `"${asp.method}"`
      ];
      aspectsCsvRows.push(row.join(","));
    }
  }

  const aspectsCsvPath = path.join(outputDir, "aspect_sentiment_results.csv");
  fs.writeFileSync(aspectsCsvPath, aspectsCsvRows.join("\n"), "utf-8");

  // 2. Export Category-Level Product Matrix Table
  const categoryCsvRows: string[] = [
    "product,canonical_category,positive_count,negative_count,neutral_count,total_mentions,net_sentiment_score,health_status"
  ];

  for (const [prod, categories] of Object.entries(hierarchicalMatrix)) {
    for (const [catName, summary] of Object.entries(categories)) {
      const row = [
        `"${prod.replace(/"/g, '""')}"`,
        `"${catName}"`,
        summary.positive,
        summary.negative,
        summary.neutral,
        summary.total,
        `${summary.nss}%`,
        `"${summary.status}"`
      ];
      categoryCsvRows.push(row.join(","));
    }
  }

  const categoryCsvPath = path.join(outputDir, "category_aspect_matrix.csv");
  fs.writeFileSync(categoryCsvPath, categoryCsvRows.join("\n"), "utf-8");

  // 3. Export Comparison Table if comparison was run
  if (comparisonReport) {
    const compCsvRows: string[] = [
      "canonical_category,product_a_name,product_a_nss,product_a_mentions,product_b_name,product_b_nss,product_b_mentions,winner,verdict"
    ];

    for (const m of comparisonReport.metrics) {
      const row = [
        `"${m.category}"`,
        `"${m.productA.name.replace(/"/g, '""')}"`,
        `${m.productA.nss}%`,
        m.productA.totalMentions,
        `"${m.productB.name.replace(/"/g, '""')}"`,
        `${m.productB.nss}%`,
        m.productB.totalMentions,
        `"${m.winner.replace(/"/g, '""')}"`,
        `"${m.verdictNote}"`
      ];
      compCsvRows.push(row.join(","));
    }

    const compCsvPath = path.join(outputDir, "product_comparison.csv");
    fs.writeFileSync(compCsvPath, compCsvRows.join("\n"), "utf-8");
  }

  console.log(`\n[EXPORT] Successfully saved analytical datasets to:`);
  console.log(`  -> ${aspectsCsvPath}`);
  console.log(`  -> ${categoryCsvPath}`);
  if (comparisonReport) {
    console.log(`  -> ${path.join(outputDir, "product_comparison.csv")}`);
  }
}

/**
 * Main Pipeline Orchestrator.
 */
export async function runPipeline(): Promise<void> {
  console.log("=".repeat(80));
  console.log("  ASPECT-BASED E-COMMERCE PRODUCT FEEDBACK SUMMARIZER (TypeScript)");
  console.log("  Phase 2 - Aspect Canonicalization & Category Intelligence Matrix");
  console.log("=".repeat(80));

  const options = parseArgs();
  const datasetPath = resolveDatasetPath(options.dataset);

  // 1. Ingest Dataset
  console.log(`\n[1/4] Loading customer reviews dataset from '${path.basename(datasetPath)}'...`);
  const reviews: Review[] = loadDataset(datasetPath, {
    sampleSize: options.sampleSize,
    category: options.category,
    product: options.product
  });
  console.log(`  -> Successfully loaded and standardized ${reviews.length} customer reviews.`);

  // 2. Display EDA if requested
  if (options.showEDA) {
    console.log("\n[2/4] Profiling dataset statistics...");
    const eda = generateEDAReport(reviews);
    printEDASummary(eda);
  } else {
    console.log("\n[2/4] Skipping dataset EDA profiling (use '--eda' flag to view).");
  }

  // 3. Aspect Extraction & Sentiment Analysis & Canonical Clustering
  console.log("\n[3/4] Extracting aspects, classifying sentiment & categorizing into canonical taxonomy...");
  const classifier = new AspectSentimentClassifier();
  const reviewsAnalysis: ReviewAnalysis[] = [];

  let totalAspectsFound = 0;

  console.log("\n" + "=".repeat(80));
  console.log("                     INDIVIDUAL REVIEW SUMMARIES");
  console.log("=".repeat(80));

  for (let i = 0; i < reviews.length; i++) {
    const rev = reviews[i];
    const pairs = extractAspectOpinionPairs(rev.review_text);
    const aspectResults = classifier.analyzePairs(pairs);
    const categorizedAspects = categorizeAspectResults(aspectResults);
    totalAspectsFound += categorizedAspects.length;

    reviewsAnalysis.push({
      review_id: rev.review_id,
      product: rev.product,
      category: rev.category,
      rating: rev.rating,
      review_text: rev.review_text,
      aspects: categorizedAspects
    });

    // Display review card
    const ratingStr = rev.rating ? ` | Rating: ${rev.rating}★` : "";
    console.log(`\nReview #${rev.review_id} | Product: ${rev.product} [${rev.category}]${ratingStr}`);
    console.log(`Text: "${rev.review_text}"`);
    console.log("Aspects & Sentiments (Categorized):");

    if (categorizedAspects.length === 0) {
      console.log("  (No explicit aspect-opinion pairs detected)");
    } else {
      for (const item of categorizedAspects) {
        const aspectDisplay = titleCase(item.aspect).padEnd(20);
        const catBadge = `[${item.category}]`.padEnd(26);
        const tag = item.sentiment === "Positive" ? "[+ POS]" : item.sentiment === "Negative" ? "[- NEG]" : "[* NEU]";
        const scoreFormatted = (item.score >= 0 ? "+" : "") + item.score.toFixed(2);
        console.log(
          `  ${tag.padEnd(8)} ${aspectDisplay} ${catBadge} : ${item.sentiment.padEnd(8)} (Opinion: '${item.opinion}', Score: ${scoreFormatted})`
        );
      }
    }
    console.log("-".repeat(80));
  }

  // 4. Hierarchical Product-Level Feedback Matrix
  console.log("\n" + "=".repeat(80));
  console.log("         HIERARCHICAL CATEGORY-LEVEL PRODUCT INTELLIGENCE MATRIX");
  console.log("=".repeat(80));
  console.log("Aggregated customer sentiment grouped under high-level Canonical Categories with Net Sentiment Scores (NSS):\n");

  const hierarchicalMatrix = buildHierarchicalMatrix(reviewsAnalysis);

  for (const [product, categories] of Object.entries(hierarchicalMatrix)) {
    console.log(`📦 Product: ${product}`);
    for (const [catName, summary] of Object.entries(categories)) {
      const nssSign = summary.nss >= 0 ? "+" : "";
      const nssFormatted = `${nssSign}${summary.nss}%`.padStart(5);
      const icon = summary.nss >= 20 ? "👍" : summary.nss <= -20 ? "⚠️" : "⚖️";

      console.log(
        `  ├── ${icon} ${catName.padEnd(26)} [NSS: ${nssFormatted}] (Pos: ${summary.positive} | Neg: ${summary.negative} | Neu: ${summary.neutral}) - ${summary.status}`
      );

      // Print sub-aspect breakdown
      const subAspectEntries = Object.entries(summary.aspects);
      for (let s = 0; s < subAspectEntries.length; s++) {
        const [subAsp, counts] = subAspectEntries[s];
        const isLast = s === subAspectEntries.length - 1;
        const branch = isLast ? "       └──" : "       ├──";
        console.log(
          `  │${branch} ${titleCase(subAsp).padEnd(22)}: +${counts.Positive} Pos, -${counts.Negative} Neg, *${counts.Neutral} Neu`
        );
      }
    }
    console.log();
  }

  // 5. Head-to-Head Comparison if requested
  let comparisonReport: ProductComparisonReport | null = null;
  if (options.compare) {
    comparisonReport = compareProducts(hierarchicalMatrix, options.compare[0], options.compare[1]);
    printComparisonReport(comparisonReport);
  }

  // 6. Pipeline Summary & Export
  console.log("=".repeat(80));
  console.log(
    `Pipeline Execution Complete: ${reviews.length} reviews processed, ${totalAspectsFound} aspect-opinion pairs canonicalized into ${Object.keys(hierarchicalMatrix).length} product profiles.`
  );
  console.log("=".repeat(80));

  if (options.exportResults) {
    exportResults(reviewsAnalysis, hierarchicalMatrix, comparisonReport, options.outputDir || "./outputs");
  }
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].replace(/\\/g, "/").endsWith("index.ts") || process.argv[1].replace(/\\/g, "/").endsWith("index.js"))) {
  runPipeline().catch((err) => {
    console.error("[FATAL ERROR]:", err);
    process.exit(1);
  });
}

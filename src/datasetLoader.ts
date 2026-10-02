/**
 * ============================================================================
 * MODULE: Dataset Loader & EDA Profiler (src/datasetLoader.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Role in Pipeline:
 * 1. Robust CSV Parsing: Handles multi-line quotes, commas in fields, and UTF-8 text.
 * 2. Universal Schema Standardization: Auto-detects and standardizes columns across
 *    Kaggle, Amazon, Flipkart, and Yelp datasets.
 * 3. Dataset Profiling & EDA: Computes word counts, category splits, and rating stats.
 * 4. Filtering & Slicing: Supports category, product, and sample size restrictions.
 */

import * as fs from "fs";
import * as path from "path";
import { Review, EDAReport } from "./types.js";

// Column candidate aliases for automatic schema normalization
const COLUMN_MAPPINGS: Record<string, string[]> = {
  review_text: [
    "review_text", "reviews.text", "text", "reviewtext", "review_body",
    "review", "body", "content", "comments", "customer_review", "feedback"
  ],
  product: [
    "product_name", "product", "name", "item_name", "product_title",
    "title", "item", "brand", "asin", "clothing_id"
  ],
  rating: [
    "rating", "stars", "overall", "score", "reviews.rating",
    "star_rating", "rating_score", "user_rating"
  ],
  category: [
    "category", "department", "department_name", "class_name",
    "product_category", "division", "type", "genre"
  ],
  review_id: [
    "review_id", "id", "index", "uid", "order_id", "reviewid"
  ]
};

/**
 * Robust CSV parser that correctly handles commas inside quoted fields and multiline rows.
 */
export function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.replace(/^["']|["']$/g, "").trim());
  const records: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      const val = row[c] !== undefined ? row[c].replace(/^["']|["']$/g, "").trim() : "";
      record[header] = val;
    }
    records.push(record);
  }

  return records;
}

/**
 * Maps raw records to standard Review objects.
 */
export function standardizeRecords(records: Record<string, string>[]): Review[] {
  if (records.length === 0) return [];

  const firstRecord = records[0];
  const colKeys = Object.keys(firstRecord);
  const matchedCols: Record<string, string> = {};

  for (const [targetKey, candidates] of Object.entries(COLUMN_MAPPINGS)) {
    for (const cand of candidates) {
      const found = colKeys.find(
        (k) => k.toLowerCase().replace(/[\s._-]+/g, "") === cand.toLowerCase().replace(/[\s._-]+/g, "")
      );
      if (found) {
        matchedCols[targetKey] = found;
        break;
      }
    }
  }

  const textKey = matchedCols["review_text"] || colKeys.find((k) => k.toLowerCase().includes("text") || k.toLowerCase().includes("review"));
  if (!textKey) {
    throw new Error(`Unable to detect review text column. Available columns: ${colKeys.join(", ")}`);
  }

  const prodKey = matchedCols["product"];
  const catKey = matchedCols["category"];
  const ratingKey = matchedCols["rating"];
  const idKey = matchedCols["review_id"];

  const reviews: Review[] = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rawText = rec[textKey];
    if (!rawText || rawText.trim().length === 0) continue;

    const ratingVal = ratingKey && rec[ratingKey] ? parseFloat(rec[ratingKey]) : null;

    reviews.push({
      review_id: idKey && rec[idKey] ? rec[idKey] : i + 1,
      product: prodKey && rec[prodKey] ? rec[prodKey] : "General Product",
      category: catKey && rec[catKey] ? rec[catKey] : "General",
      rating: !isNaN(Number(ratingVal)) ? ratingVal : null,
      review_text: rawText
    });
  }

  return reviews;
}

/**
 * Loads and standardizes reviews dataset from a CSV file.
 */
export function loadDataset(
  filePath: string,
  options: { sampleSize?: number; category?: string; product?: string } = {}
): Review[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dataset file not found at path: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const rawRecords = parseCsv(content);
  let reviews = standardizeRecords(rawRecords);

  // Filter by category
  if (options.category && options.category.toLowerCase() !== "all") {
    const catLower = options.category.toLowerCase();
    reviews = reviews.filter((r) => r.category.toLowerCase().includes(catLower));
  }

  // Filter by product
  if (options.product && options.product.toLowerCase() !== "all") {
    const prodLower = options.product.toLowerCase();
    reviews = reviews.filter((r) => r.product.toLowerCase().includes(prodLower));
  }

  // Slice by sample size
  if (options.sampleSize && options.sampleSize > 0 && reviews.length > options.sampleSize) {
    reviews = reviews.slice(0, options.sampleSize);
  }

  return reviews;
}

/**
 * Computes Exploratory Data Analysis (EDA) metrics.
 */
export function generateEDAReport(reviews: Review[]): EDAReport {
  const wordCounts = reviews.map((r) => r.review_text.split(/\s+/).filter(Boolean).length);
  const charCounts = reviews.map((r) => r.review_text.length);

  const categoriesBreakdown: Record<string, number> = {};
  const productsBreakdown: Record<string, number> = {};
  const ratingDistribution: Record<string, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;

  const multiAspectRegex = /\b(?:but|though|however|while|yet|although|and)\b/i;
  let multiAspectCount = 0;

  for (const r of reviews) {
    // Categories
    categoriesBreakdown[r.category] = (categoriesBreakdown[r.category] || 0) + 1;

    // Products
    productsBreakdown[r.product] = (productsBreakdown[r.product] || 0) + 1;

    // Ratings
    if (r.rating !== null && r.rating !== undefined && !isNaN(r.rating)) {
      const rounded = Math.round(r.rating);
      ratingDistribution[rounded] = (ratingDistribution[rounded] || 0) + 1;
      ratingSum += r.rating;
      ratingCount++;
    }

    // Multi-aspect estimation
    if (multiAspectRegex.test(r.review_text)) {
      multiAspectCount++;
    }
  }

  wordCounts.sort((a, b) => a - b);
  const medianWords = wordCounts.length > 0 ? wordCounts[Math.floor(wordCounts.length / 2)] : 0;
  const avgWords = wordCounts.length > 0 ? Number((wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length).toFixed(1)) : 0;
  const minWords = wordCounts.length > 0 ? wordCounts[0] : 0;
  const maxWords = wordCounts.length > 0 ? wordCounts[wordCounts.length - 1] : 0;

  const avgChars = charCounts.length > 0 ? Number((charCounts.reduce((a, b) => a + b, 0) / charCounts.length).toFixed(1)) : 0;

  return {
    total_reviews: reviews.length,
    unique_products: Object.keys(productsBreakdown).length,
    unique_categories: Object.keys(categoriesBreakdown).length,
    categories_breakdown: categoriesBreakdown,
    top_products: productsBreakdown,
    text_stats: {
      avg_words: avgWords,
      min_words: minWords,
      max_words: maxWords,
      median_words: medianWords,
      avg_chars: avgChars
    },
    multi_aspect_reviews_est: multiAspectCount,
    multi_aspect_pct: reviews.length > 0 ? Number(((multiAspectCount / reviews.length) * 100).toFixed(1)) : 0,
    rating_distribution: ratingDistribution,
    average_rating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null
  };
}

/**
 * Formats and prints the EDA statistical report to the terminal.
 */
export function printEDASummary(eda: EDAReport): void {
  console.log("\n" + "=".repeat(80));
  console.log("           EXPLORATORY DATA ANALYSIS (EDA) & DATASET PROFILE");
  console.log("=".repeat(80));
  console.log(`  * Total Customer Reviews Analyzed : ${eda.total_reviews}`);
  console.log(`  * Unique Product Offerings        : ${eda.unique_products}`);
  console.log(`  * Distinct Product Categories     : ${eda.unique_categories}`);
  console.log(`  * Multi-Aspect Review Density     : ${eda.multi_aspect_reviews_est} reviews (${eda.multi_aspect_pct}%)`);

  if (eda.average_rating !== null && eda.average_rating !== undefined) {
    console.log(`  * Average Customer Star Rating    : ${eda.average_rating} / 5.0`);
  }

  console.log("\n  [Review Length Statistics]");
  const t = eda.text_stats;
  console.log(`    - Word Count : Avg: ${t.avg_words} words | Median: ${t.median_words} | Min: ${t.min_words} | Max: ${t.max_words}`);
  console.log(`    - Char Count : Avg: ${t.avg_chars} characters`);

  if (eda.rating_distribution && Object.keys(eda.rating_distribution).length > 0) {
    console.log("\n  [Star Rating Distribution]");
    const sortedRatings = Object.entries(eda.rating_distribution).sort((a, b) => Number(b[0]) - Number(a[0]));
    for (const [star, count] of sortedRatings) {
      const starNum = parseInt(star, 10);
      const bar = "*".repeat(starNum) + " ".repeat(Math.max(0, 5 - starNum));
      const pct = ((count / eda.total_reviews) * 100).toFixed(1);
      console.log(`    ${star} Star [${bar}] : ${String(count).padStart(4)} reviews (${pct.padStart(5)}%)`);
    }
  }

  console.log("\n  [Category Breakdown]");
  const sortedCategories = Object.entries(eda.categories_breakdown).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCategories.slice(0, 6)) {
    console.log(`    - ${cat.padEnd(24)} : ${count} reviews`);
  }

  console.log("=".repeat(80) + "\n");
}

// Standalone execution test
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("datasetLoader.ts")) {
  const samplePath = path.resolve(process.cwd(), "data", "kaggle_amazon_sample.csv");
  console.log(`Testing TypeScript datasetLoader on: ${samplePath}`);
  const reviews = loadDataset(samplePath);
  console.log(`Loaded ${reviews.length} reviews successfully.`);

  const eda = generateEDAReport(reviews);
  printEDASummary(eda);
}


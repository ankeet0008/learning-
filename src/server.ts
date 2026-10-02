/**
 * ============================================================================
 * HTTP & REST API SERVER (src/server.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Role in Pipeline (Phase 3 & 4):
 * 1. Serves REST API endpoints for real-time ABSA text inference, dataset
 *    queries, hierarchical matrices, and head-to-head product comparisons.
 * 2. Serves the interactive frontend web dashboard located in `public/`.
 * 3. Provides downloadable CSV endpoints for exported analytical datasets.
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { verifyToken } from "@clerk/backend";
import { Review, ReviewAnalysis } from "./types.js";
import { loadDataset, generateEDAReport } from "./datasetLoader.js";
import { extractAspectOpinionPairs } from "./aspectExtraction.js";
import { AspectSentimentClassifier } from "./sentiment.js";
import {
  categorizeAspectResults,
  buildHierarchicalMatrix,
  compareProducts
} from "./aspectClustering.js";
import {
  isEcommerceUrl,
  scrapeProductReviews,
  ScrapeResult
} from "./scraper.js";
import {
  startComparisonJob,
  getJob,
  checkRateLimit,
  AnalyzedProductData
} from "./compareService.js";

// ── Load .env file (lightweight, no external dependency) ─────────────────────
function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || "3000", 10);
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const OUTPUTS_DIR = path.resolve(process.cwd(), "outputs");
const DATASET_PATH = path.resolve(process.cwd(), "data", "kaggle_amazon_sample.csv");

// In-memory cache for precomputed dataset matrix and reviews
let cachedReviews: Review[] = [];
let cachedReviewsAnalysis: ReviewAnalysis[] = [];
let cachedHierarchicalMatrix: any = null;
let cachedEDA: any = null;
const classifier = new AspectSentimentClassifier();

/**
 * Initializes and caches dataset intelligence on server startup.
 */
function initDatasetCache(): void {
  try {
    console.log(`[INIT] Loading and analyzing dataset from: ${DATASET_PATH}`);
    cachedReviews = loadDataset(DATASET_PATH);
    cachedEDA = generateEDAReport(cachedReviews);

    cachedReviewsAnalysis = [];
    for (const rev of cachedReviews) {
      const pairs = extractAspectOpinionPairs(rev.review_text);
      const aspectResults = classifier.analyzePairs(pairs);
      const categorized = categorizeAspectResults(aspectResults);
      cachedReviewsAnalysis.push({
        review_id: rev.review_id,
        product: rev.product,
        category: rev.category,
        rating: rev.rating,
        review_text: rev.review_text,
        aspects: categorized
      });
    }

    cachedHierarchicalMatrix = buildHierarchicalMatrix(cachedReviewsAnalysis);
    console.log(`[INIT] Successfully loaded ${cachedReviews.length} reviews and ${Object.keys(cachedHierarchicalMatrix).length} products.`);
  } catch (err) {
    console.error("[INIT ERROR]: Failed to initialize dataset cache:", err);
  }
}

/**
 * Registers an analyzed scraped product into the in-memory cache so it is
 * immediately visible in the Product Matrix tab, comparator, and dataset queries.
 */
function registerProductIntoMatrixCache(analyzed: AnalyzedProductData): void {
  const prodName = analyzed.profile.productName;
  console.log(`[MATRIX SYNC] Dynamically updating Product Matrix cache with: "${prodName}"`);

  // Remove existing occurrences if any to avoid duplication
  cachedReviews = cachedReviews.filter((r) => r.product !== prodName);
  cachedReviewsAnalysis = cachedReviewsAnalysis.filter((r) => r.product !== prodName);

  for (const r of analyzed.reviewsAnalysis) {
    cachedReviewsAnalysis.push(r);
    cachedReviews.push({
      review_id: r.review_id,
      product: r.product,
      category: r.category,
      rating: r.rating,
      review_text: r.review_text
    });
  }

  if (!cachedHierarchicalMatrix) cachedHierarchicalMatrix = {};
  cachedHierarchicalMatrix[prodName] = analyzed.profile.categories;
}


// ── Clerk Authentication Keys ────────────────────────────────────────────────
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || "";

if (!CLERK_SECRET_KEY || CLERK_SECRET_KEY === "sk_test_REPLACE_ME") {
  console.warn("[AUTH] ⚠️  CLERK_SECRET_KEY not configured. Auth-protected endpoints will reject all requests.");
  console.warn("[AUTH]    Set CLERK_SECRET_KEY in .env — get keys from https://dashboard.clerk.com");
}

/**
 * Verifies the Clerk JWT from the Authorization header.
 * Returns the userId string if valid, or null if missing/invalid.
 */
async function verifyAuth(req: http.IncomingMessage): Promise<string | null> {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || !CLERK_SECRET_KEY || CLERK_SECRET_KEY === "sk_test_REPLACE_ME") return null;

    const verified = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });
    return verified.sub || null; // sub = Clerk userId
  } catch {
    return null;
  }
}

/**
 * Sends a JSON response with CORS headers.
 */
function sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Reads request body as JSON.
 */
function parseRequestBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * MIME type mapping for static frontend files.
 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

/**
 * Main HTTP Server Request Handler.
 */
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || "/", true);
  const pathname = parsedUrl.pathname || "/";
  const method = req.method || "GET";

  // Handle CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }

  // =========================================================================
  // AUTH ENDPOINTS
  // =========================================================================

  // GET /api/clerk-key - Returns the publishable key for frontend initialization
  if (method === "GET" && pathname === "/api/clerk-key") {
    return sendJson(res, 200, { publishableKey: CLERK_PUBLISHABLE_KEY });
  }

  // GET /api/me - Returns current authenticated user info
  if (method === "GET" && pathname === "/api/me") {
    const userId = await verifyAuth(req);
    if (!userId) {
      return sendJson(res, 401, { error: "Not authenticated" });
    }
    return sendJson(res, 200, { userId });
  }

  // ===========================================================================
  // REST API ENDPOINTS (Phase 3)
  // ===========================================================================

  // 1. POST /api/analyze - Live inference on custom review text [PROTECTED]
  if (method === "POST" && pathname === "/api/analyze") {
    const userId = await verifyAuth(req);
    if (!userId) return sendJson(res, 401, { error: "Authentication required. Please sign in." });

    try {
      const body = await parseRequestBody(req);
      const text = body.text || "";
      const product = body.product || "Custom Product";

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return sendJson(res, 400, { error: "Field 'text' is required and must be a non-empty string." });
      }

      const pairs = extractAspectOpinionPairs(text);
      const sentimentResults = classifier.analyzePairs(pairs);
      const categorized = categorizeAspectResults(sentimentResults);

      const reviewAnalysis: ReviewAnalysis = {
        review_id: "LIVE_001",
        product,
        category: body.category || "General",
        rating: body.rating || null,
        review_text: text,
        aspects: categorized
      };

      return sendJson(res, 200, {
        success: true,
        text,
        product,
        total_aspects: categorized.length,
        aspects: categorized
      });
    } catch (err: any) {
      return sendJson(res, 500, { error: err.message || "Failed to analyze review text." });
    }
  }

  // 2. GET /api/products - List all products in dataset
  if (method === "GET" && pathname === "/api/products") {
    const productsMap = new Map<string, { product: string; category: string; reviewCount: number; avgRating: number }>();

    for (const r of cachedReviews) {
      if (!productsMap.has(r.product)) {
        productsMap.set(r.product, {
          product: r.product,
          category: r.category,
          reviewCount: 0,
          avgRating: 0
        });
      }
      const item = productsMap.get(r.product)!;
      item.reviewCount++;
      if (r.rating) item.avgRating += r.rating;
    }

    const products = Array.from(productsMap.values()).map((p) => ({
      ...p,
      avgRating: p.reviewCount > 0 ? Number((p.avgRating / p.reviewCount).toFixed(1)) : 0
    }));

    return sendJson(res, 200, {
      total: products.length,
      products
    });
  }

  // 3. GET /api/matrix - Full Hierarchical Product Category Matrix
  if (method === "GET" && pathname === "/api/matrix") {
    const productQuery = parsedUrl.query.product as string | undefined;

    if (productQuery) {
      const matchKey = Object.keys(cachedHierarchicalMatrix).find(
        (p) => p.toLowerCase().includes(productQuery.toLowerCase())
      );
      if (!matchKey) {
        return sendJson(res, 404, { error: `Product '${productQuery}' not found in dataset.` });
      }
      return sendJson(res, 200, {
        product: matchKey,
        categories: cachedHierarchicalMatrix[matchKey]
      });
    }

    return sendJson(res, 200, {
      total_products: Object.keys(cachedHierarchicalMatrix).length,
      matrix: cachedHierarchicalMatrix
    });
  }

  // 4. POST /api/compare - Head-to-head comparison between two products [PROTECTED]
  if (method === "POST" && pathname === "/api/compare") {
    const userId = await verifyAuth(req);
    if (!userId) return sendJson(res, 401, { error: "Authentication required. Please sign in." });

    try {
      const body = await parseRequestBody(req);
      const productA = body.productA || "";
      const productB = body.productB || "";

      if (!productA || !productB) {
        return sendJson(res, 400, { error: "Both 'productA' and 'productB' are required fields." });
      }

      const report = compareProducts(cachedHierarchicalMatrix, productA, productB);
      return sendJson(res, 200, {
        success: true,
        report
      });
    } catch (err: any) {
      return sendJson(res, 500, { error: err.message || "Failed to compare products." });
    }
  }

  // 5. POST /api/scrape-reviews - Scrape real reviews from e-commerce URL & run ABSA [PROTECTED]
  if (method === "POST" && pathname === "/api/scrape-reviews") {
    const userId = await verifyAuth(req);
    if (!userId) return sendJson(res, 401, { error: "Authentication required. Please sign in." });

    try {
      const body = await parseRequestBody(req);
      const urlStr = body.url || "";

      if (!urlStr || typeof urlStr !== "string" || urlStr.trim().length === 0) {
        return sendJson(res, 400, { error: "Field 'url' is required and must be a non-empty string." });
      }

      if (!isEcommerceUrl(urlStr)) {
        return sendJson(res, 400, {
          error: "Invalid or unsupported URL. Please paste a product link from Amazon (amazon.com, amazon.in) or Flipkart."
        });
      }

      console.log(`[API] Scraping reviews from: ${urlStr}`);

      // Scrape reviews from the e-commerce URL
      const scrapeResult: ScrapeResult = await scrapeProductReviews(urlStr.trim(), 10);

      if (scrapeResult.reviews.length === 0) {
        return sendJson(res, 200, {
          success: true,
          product: scrapeResult.product,
          message: "No reviews could be extracted from this product page. The page may have changed structure or be blocking automated requests.",
          reviews: [],
          aggregated: null,
          scrapeTimestamp: scrapeResult.scrapeTimestamp
        });
      }

      // Run ABSA pipeline on each scraped review
      const analyzedReviews: ReviewAnalysis[] = [];

      for (const review of scrapeResult.reviews) {
        const pairs = extractAspectOpinionPairs(review.review_text);
        const sentimentResults = classifier.analyzePairs(pairs);
        const categorized = categorizeAspectResults(sentimentResults);

        analyzedReviews.push({
          review_id: review.review_id,
          product: scrapeResult.product.productName,
          category: "E-Commerce",
          rating: review.rating,
          review_text: review.review_text,
          aspects: categorized
        });
      }

      // Build aggregated category summary across all reviews
      const aggregatedMatrix = buildHierarchicalMatrix(analyzedReviews);
      const productMatrix = aggregatedMatrix[scrapeResult.product.productName] || null;

      // Count total aspects extracted
      const totalAspects = analyzedReviews.reduce((sum, r) => sum + r.aspects.length, 0);

      // Dynamically register scraped product into Matrix & dataset cache
      if (productMatrix) {
        if (!cachedHierarchicalMatrix) cachedHierarchicalMatrix = {};
        cachedHierarchicalMatrix[scrapeResult.product.productName] = productMatrix;
        for (const r of analyzedReviews) {
          cachedReviewsAnalysis.push(r);
          cachedReviews.push({
            review_id: r.review_id,
            product: r.product,
            category: r.category,
            rating: r.rating,
            review_text: r.review_text
          });
        }
      }

      return sendJson(res, 200, {
        success: true,
        product: scrapeResult.product,
        totalReviews: scrapeResult.reviewCount,
        totalAspects,
        reviews: analyzedReviews.map((r) => ({
          review_id: r.review_id,
          rating: r.rating,
          review_text: r.review_text,
          aspects: r.aspects
        })),
        aggregated: productMatrix,
        scrapeTimestamp: scrapeResult.scrapeTimestamp
      });
    } catch (err: any) {
      console.error("[API] Scrape error:", err);
      return sendJson(res, 500, {
        error: err.message || "Failed to scrape and analyze reviews. The site may be blocking the request."
      });
    }
  }

  // 6. POST /api/compare-urls - Start parallel scraping and comparison job [PROTECTED]
  if (method === "POST" && pathname === "/api/compare-urls") {
    const userId = await verifyAuth(req);
    if (!userId) return sendJson(res, 401, { error: "Authentication required. Please sign in." });

    try {
      const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
      const rateCheck = checkRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec || 60));
        return sendJson(res, 429, {
          error: "Rate limit exceeded. Maximum 5 comparison requests per minute per IP.",
          retryAfterSec: rateCheck.retryAfterSec
        });
      }

      const body = await parseRequestBody(req);
      const urlA = body.urlA || "";
      const urlB = body.urlB || "";
      const reviewsA = body.reviewsA || "";
      const reviewsB = body.reviewsB || "";

      if (!urlA && !reviewsA) {
        return sendJson(res, 400, { error: "Product A requires either a valid product URL or manual review text." });
      }
      if (!urlB && !reviewsB) {
        return sendJson(res, 400, { error: "Product B requires either a valid product URL or manual review text." });
      }

      const jobId = startComparisonJob({
        urlA,
        urlB,
        reviewsA,
        reviewsB,
        onProductScraped: registerProductIntoMatrixCache
      });

      return sendJson(res, 202, {
        success: true,
        jobId,
        message: "Comparison job initiated. Poll /api/compare-urls/" + jobId + " for progress."
      });
    } catch (err: any) {
      return sendJson(res, 500, { error: err.message || "Failed to start comparison job." });
    }
  }

  // 7. GET /api/compare-urls/:jobId - Poll comparison job status & results
  const compareJobMatch = pathname.match(/^\/api\/compare-urls\/([a-zA-Z0-9_-]+)$/);
  if (method === "GET" && compareJobMatch) {
    const jobId = compareJobMatch[1];
    const job = getJob(jobId);

    if (!job) {
      return sendJson(res, 404, { error: `Job '${jobId}' not found or expired.` });
    }

    if (job.status === "error") {
      return sendJson(res, 502, {
        success: false,
        status: "error",
        progress: job.progress,
        failedProduct: job.failedProduct,
        error: job.error || "Comparison job failed."
      });
    }

    return sendJson(res, 200, {
      success: true,
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      percent: job.percent,
      result: job.result || null
    });
  }

  // 8. GET /api/eda - Exploratory Data Analysis statistics
  if (method === "GET" && pathname === "/api/eda") {
    return sendJson(res, 200, {
      success: true,
      eda: cachedEDA
    });
  }

  // 6. GET /api/reviews - Get raw customer reviews with optional filtering
  if (method === "GET" && pathname === "/api/reviews") {
    const productFilter = parsedUrl.query.product as string | undefined;
    const categoryFilter = parsedUrl.query.category as string | undefined;
    const limit = parseInt(parsedUrl.query.limit as string || "50", 10);

    let filtered = cachedReviews;
    if (productFilter) {
      filtered = filtered.filter((r) => r.product.toLowerCase().includes(productFilter.toLowerCase()));
    }
    if (categoryFilter) {
      filtered = filtered.filter((r) => r.category.toLowerCase().includes(categoryFilter.toLowerCase()));
    }

    return sendJson(res, 200, {
      total: filtered.length,
      reviews: filtered.slice(0, limit)
    });
  }

  // 7. GET /api/exports/:filename - Download exported CSV files
  if (method === "GET" && pathname.startsWith("/api/exports/")) {
    const filename = pathname.replace("/api/exports/", "");
    const safeFile = path.basename(filename);
    const filePath = path.join(OUTPUTS_DIR, safeFile);

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Length": stat.size,
        "Content-Disposition": `attachment; filename="${safeFile}"`
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    return sendJson(res, 404, { error: "Exported CSV file not found. Run pipeline with '--export' first." });
  }

  // ===========================================================================
  // STATIC FILE SERVER FOR FRONTEND DASHBOARD (Phase 4)
  // ===========================================================================

  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

  // Security check: ensure path is within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  // Check if file exists, if not fallback to index.html for SPA
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const stat = fs.statSync(filePath);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size
    });

    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 Not Found");
});

/**
 * Starts the HTTP server.
 */
export function startServer(port: number = PORT): http.Server {
  initDatasetCache();

  server.listen(port, () => {
    console.log("\n" + "=".repeat(80));
    console.log(`  🚀 ABSA E-COMMERCE FEEDBACK SUMMARIZER WEB SERVER STARTED`);
    console.log(`  🌐 Dashboard URL : http://localhost:${port}`);
    console.log(`  📡 REST API Base : http://localhost:${port}/api`);
    console.log("=".repeat(80));
    console.log("  Available Endpoints:");
    console.log(`    - POST /api/analyze         (Live Review Text Inference)`);
    console.log(`    - POST /api/scrape-reviews   (Scrape Real Reviews from URL)`);
    console.log(`    - POST /api/compare-urls    (Head-to-Head 2-URL Live Comparison Job)`);
    console.log(`    - GET  /api/compare-urls/:id(Poll Comparison Job Status & Results)`);
    console.log(`    - GET  /api/products        (List all Products)`);
    console.log(`    - GET  /api/matrix          (Hierarchical Product Matrix)`);
    console.log(`    - POST /api/compare         (Head-to-Head Comparison)`);
    console.log(`    - GET  /api/eda             (Dataset Profiler Statistics)`);
    console.log("=".repeat(80) + "\n");
  });

  return server;
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].replace(/\\/g, "/").endsWith("server.ts") || process.argv[1].replace(/\\/g, "/").endsWith("server.js"))) {
  startServer(PORT);
}

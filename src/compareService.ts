/**
 * ============================================================================
 * SERVICE: Head-to-Head URL Comparison & Job Engine (src/compareService.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Responsibilities:
 * 1. SSRF-safe URL validation (protocol, allowlisted domains, IP blocklist).
 * 2. In-memory TTL cache for scraped product reviews (1-hour expiry).
 * 3. Rate limiting per client IP (5 req/min).
 * 4. Asynchronous job management with granular progress tracking:
 *    "Validating" -> "Scraping A" -> "Scraping B" -> "Analyzing" -> "Comparing" -> "Complete".
 * 5. Parallel scraping via Promise.allSettled with dedicated per-product failure reporting.
 * 6. Fallback mode: accepts manual pasted reviews (reviewsA / reviewsB).
 * 7. Aspect matching with strict thresholding:
 *    - Tie if NSS gap < 0.05 (5%)
 *    - Insufficient if either side has < 5 mentions
 * 8. Automatic synchronization with Product Matrix cache.
 */

import { randomUUID } from "crypto";
import { APP_CONFIG } from "./config.js";
import {
  Review,
  ReviewAnalysis,
  CanonicalCategory,
  CategorySummary,
  ProductComparisonMetric,
  ProductAspectProfile,
  AspectMetricSummary,
  AspectHeadToHeadMetric,
  UrlComparisonResult,
  JobState,
  JobProgressStage,
  WinnerType
} from "./types.js";
import { scrapeWithPlaywright, BlockedByBotProtectionError } from "./playwrightScraper.js";
import { extractAspectOpinionPairs } from "./aspectExtraction.js";
import { AspectSentimentClassifier } from "./sentiment.js";
import {
  categorizeAspectResults,
  buildHierarchicalMatrix,
  calculateNetSentimentScore
} from "./aspectClustering.js";

const classifier = new AspectSentimentClassifier();

// ─────────────────────────────────────────────────────────────────────────────
// 1. In-Memory Cache (URL -> { timestamp, data })
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  timestamp: number;
  data: {
    productName: string;
    platform: string;
    url: string;
    reviews: Review[];
    averageRating: number | null;
  };
}

const urlCache = new Map<string, CacheEntry>();

function normalizeUrlKey(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
  } catch {
    return urlStr.trim().toLowerCase();
  }
}

export function getCachedProduct(urlStr: string) {
  const key = normalizeUrlKey(urlStr);
  const entry = urlCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > APP_CONFIG.cache.ttlMs) {
    urlCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedProduct(
  urlStr: string,
  data: {
    productName: string;
    platform: string;
    url: string;
    reviews: Review[];
    averageRating: number | null;
  }
) {
  const key = normalizeUrlKey(urlStr);
  urlCache.set(key, { timestamp: Date.now(), data });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Rate Limiter (IP -> timestamps[])
// ─────────────────────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, number[]>();

export function checkRateLimit(clientIp: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const windowMs = APP_CONFIG.rateLimit.windowMs;
  const maxReq = APP_CONFIG.rateLimit.maxRequests;

  let timestamps = rateLimitMap.get(clientIp) || [];
  // Evict timestamps older than 60s
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= maxReq) {
    const oldest = timestamps[0];
    const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000);
    rateLimitMap.set(clientIp, timestamps);
    return { allowed: false, retryAfterSec };
  }

  timestamps.push(now);
  rateLimitMap.set(clientIp, timestamps);
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. URL Validation & SSRF Protection
// ─────────────────────────────────────────────────────────────────────────────

export function validateProductUrl(urlStr: string): { valid: boolean; error?: string; parsedUrl?: URL } {
  if (!urlStr || typeof urlStr !== "string" || !urlStr.trim()) {
    return { valid: false, error: "URL string is required." };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { valid: false, error: `Invalid URL format: "${urlStr}". Must be a valid HTTP/HTTPS URL.` };
  }

  // 1. Protocol check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Protocol "${parsed.protocol}" not allowed. Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject localhost / private IP hostnames
  const forbiddenHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "local"];
  if (forbiddenHosts.includes(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { valid: false, error: `SSRF Blocked: Host "${hostname}" points to a private or local address.` };
  }

  // Check IPv4 private ranges (10.x, 192.168.x, 172.16-31.x, 169.254.x)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);
  if (ipMatch) {
    const [_, o1, o2] = ipMatch.map(Number);
    if (
      o1 === 127 ||
      o1 === 10 ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168) ||
      (o1 === 169 && o2 === 254) ||
      o1 === 0
    ) {
      return { valid: false, error: `SSRF Blocked: IP "${hostname}" is within a restricted private range.` };
    }
  }

  // 3. Check hostname against allowed domains
  const isAllowed = APP_CONFIG.allowedHosts.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );

  if (!isAllowed) {
    return {
      valid: false,
      error: `Unsupported site: "${hostname}". Allowed domains: ${APP_CONFIG.allowedHosts.join(", ")}.`
    };
  }

  return { valid: true, parsedUrl: parsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Job Store & State Management
// ─────────────────────────────────────────────────────────────────────────────

const jobs = new Map<string, JobState>();

export function getJob(jobId: string): JobState | null {
  return jobs.get(jobId) || null;
}

export function updateJob(
  jobId: string,
  update: Partial<JobState>
): JobState | null {
  const job = jobs.get(jobId);
  if (!job) return null;

  Object.assign(job, update, { updatedAt: Date.now() });
  jobs.set(jobId, job);
  return job;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. NLP Analysis for Reviews
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyzedProductData {
  profile: ProductAspectProfile;
  reviewsAnalysis: ReviewAnalysis[];
}

export function analyzeReviewsForProduct(
  productName: string,
  platform: string,
  url: string | undefined,
  reviews: Review[]
): AnalyzedProductData {
  const reviewsAnalysis: ReviewAnalysis[] = [];
  const aspectCounts = new Map<
    string,
    { category: CanonicalCategory; pos: number; neg: number; neu: number }
  >();

  for (const rev of reviews) {
    const pairs = extractAspectOpinionPairs(rev.review_text);
    const sentimentResults = classifier.analyzePairs(pairs);
    const categorized = categorizeAspectResults(sentimentResults);

    reviewsAnalysis.push({
      review_id: rev.review_id,
      product: productName,
      category: "E-Commerce",
      rating: rev.rating,
      review_text: rev.review_text,
      aspects: categorized
    });

    for (const asp of categorized) {
      const key = asp.aspect.toLowerCase().trim();
      if (!aspectCounts.has(key)) {
        aspectCounts.set(key, { category: asp.category, pos: 0, neg: 0, neu: 0 });
      }
      const item = aspectCounts.get(key)!;
      if (asp.sentiment === "Positive") item.pos++;
      else if (asp.sentiment === "Negative") item.neg++;
      else item.neu++;
    }
  }

  // Build hierarchical categories
  const hierarchicalMatrix = buildHierarchicalMatrix(reviewsAnalysis);
  const categories = hierarchicalMatrix[productName] || ({} as Record<string, CategorySummary>);

  // Build AspectMetricSummary array
  const aspectSummaries: AspectMetricSummary[] = [];
  for (const [aspectName, data] of aspectCounts.entries()) {
    const total = data.pos + data.neg + data.neu;
    const { nss } = calculateNetSentimentScore(data.pos, data.neg, data.neu);
    aspectSummaries.push({
      aspect: aspectName,
      category: data.category,
      positive: data.pos,
      negative: data.neg,
      neutral: data.neu,
      mentionCount: total,
      nss
    });
  }

  // Sort aspects by mention count descending
  aspectSummaries.sort((a, b) => b.mentionCount - a.mentionCount);

  // Calculate average rating
  const ratings = reviews.map((r) => r.rating).filter((r): r is number => typeof r === "number" && r > 0);
  const avgRating = ratings.length > 0 ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : null;

  const profile: ProductAspectProfile = {
    productName,
    url,
    platform,
    reviewCount: reviews.length,
    averageRating: avgRating,
    aspects: aspectSummaries,
    categories
  };

  return { profile, reviewsAnalysis };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Detailed Head-to-Head Comparison Engine
// ─────────────────────────────────────────────────────────────────────────────

export function compareProductProfiles(
  prodA: ProductAspectProfile,
  prodB: ProductAspectProfile
): {
  categoryMetrics: ProductComparisonMetric[];
  aspectMetrics: AspectHeadToHeadMetric[];
  overallWinner: string;
  winnerProduct: "A" | "B" | "Tie" | "Inconclusive";
  verdictSummary: string;
} {
  // ── 1. Category Metrics ──
  const allCategories = new Set<CanonicalCategory>([
    ...(Object.keys(prodA.categories) as CanonicalCategory[]),
    ...(Object.keys(prodB.categories) as CanonicalCategory[])
  ]);

  const categoryMetrics: ProductComparisonMetric[] = [];
  let categoryWinsA = 0;
  let categoryWinsB = 0;

  for (const cat of allCategories) {
    if (cat === "General & Other") continue;

    const catA = prodA.categories[cat] || { total: 0, nss: 0, positive: 0 };
    const catB = prodB.categories[cat] || { total: 0, nss: 0, positive: 0 };

    const posRateA = catA.total > 0 ? Math.round((catA.positive / catA.total) * 100) : 0;
    const posRateB = catB.total > 0 ? Math.round((catB.positive / catB.total) * 100) : 0;

    let winner = "Tie / Inconclusive";
    let verdictNote = "Similar performance";

    if (catA.total >= 3 && catB.total < 3) {
      winner = prodA.productName;
      verdictNote = `${prodA.productName} evaluated with higher confidence (+${catA.nss}% NSS)`;
      categoryWinsA++;
    } else if (catB.total >= 3 && catA.total < 3) {
      winner = prodB.productName;
      verdictNote = `${prodB.productName} evaluated with higher confidence (+${catB.nss}% NSS)`;
      categoryWinsB++;
    } else if (catA.total > 0 && catB.total > 0) {
      const gap = catA.nss - catB.nss;
      if (Math.abs(gap) < 5) {
        winner = "Tie";
        verdictNote = `Close contest (NSS difference within 5%)`;
      } else if (gap > 0) {
        winner = prodA.productName;
        verdictNote = `${prodA.productName} leads by +${gap}% NSS`;
        categoryWinsA++;
      } else {
        winner = prodB.productName;
        verdictNote = `${prodB.productName} leads by +${Math.abs(gap)}% NSS`;
        categoryWinsB++;
      }
    }

    categoryMetrics.push({
      category: cat,
      productA: {
        name: prodA.productName,
        totalMentions: catA.total,
        nss: catA.nss,
        positiveRate: posRateA
      },
      productB: {
        name: prodB.productName,
        totalMentions: catB.total,
        nss: catB.nss,
        positiveRate: posRateB
      },
      winner,
      verdictNote
    });
  }

  // ── 2. Per-Aspect Metrics ──
  const mapA = new Map(prodA.aspects.map((a) => [a.aspect.toLowerCase(), a]));
  const mapB = new Map(prodB.aspects.map((b) => [b.aspect.toLowerCase(), b]));

  const allAspectKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const aspectMetrics: AspectHeadToHeadMetric[] = [];

  let aspectWinsA = 0;
  let aspectWinsB = 0;

  for (const key of allAspectKeys) {
    const aspA = mapA.get(key);
    const aspB = mapB.get(key);

    const category = (aspA?.category || aspB?.category || "General & Other") as CanonicalCategory;

    const nssA = aspA ? aspA.nss : 0;
    const mentionsA = aspA ? aspA.mentionCount : 0;
    const posA = aspA ? aspA.positive : 0;
    const negA = aspA ? aspA.negative : 0;

    const nssB = aspB ? aspB.nss : 0;
    const mentionsB = aspB ? aspB.mentionCount : 0;
    const posB = aspB ? aspB.positive : 0;
    const negB = aspB ? aspB.negative : 0;

    const scoreGap = Number((Math.abs(nssA - nssB) / 100).toFixed(2));

    let winner: WinnerType;
    let winnerName = "";
    let reason = "";

    // Requirement: "insufficient" if either side has fewer than 5 mentions
    if (mentionsA < APP_CONFIG.comparison.minMentionsForVerdict || mentionsB < APP_CONFIG.comparison.minMentionsForVerdict) {
      winner = "insufficient";
      winnerName = "Not Enough Data";
      reason = `Sample size too small (${mentionsA} vs ${mentionsB} mentions; requires ≥ 5)`;
    } else if (scoreGap < APP_CONFIG.comparison.tieScoreGapThreshold) {
      // Requirement: Tie if the score gap is under 0.05
      winner = "tie";
      winnerName = "Tie";
      reason = `Scores within 0.05 margin (${nssA}% vs ${nssB}%)`;
    } else if (nssA > nssB) {
      winner = "A";
      winnerName = prodA.productName;
      reason = `${prodA.productName} leads by +${nssA - nssB}% NSS`;
      aspectWinsA++;
    } else {
      winner = "B";
      winnerName = prodB.productName;
      reason = `${prodB.productName} leads by +${nssB - nssA}% NSS`;
      aspectWinsB++;
    }

    aspectMetrics.push({
      aspect: aspA?.aspect || aspB?.aspect || key,
      category,
      productA: { nss: nssA, mentionCount: mentionsA, positive: posA, negative: negA },
      productB: { nss: nssB, mentionCount: mentionsB, positive: posB, negative: negB },
      scoreGap,
      winner,
      winnerName,
      reason
    });
  }

  // Sort aspect metrics: valid winners first, then ties, then insufficient
  aspectMetrics.sort((a, b) => {
    const priority = { A: 1, B: 1, tie: 2, insufficient: 3 };
    const diff = priority[a.winner] - priority[b.winner];
    if (diff !== 0) return diff;
    return (b.productA.mentionCount + b.productB.mentionCount) - (a.productA.mentionCount + a.productB.mentionCount);
  });

  // ── 3. Overall Verdict ──
  const totalScoreA = categoryWinsA * 2 + aspectWinsA;
  const totalScoreB = categoryWinsB * 2 + aspectWinsB;

  let overallWinner = "Draw / Equal Competitors";
  let winnerProduct: "A" | "B" | "Tie" | "Inconclusive" = "Tie";
  let verdictSummary = "";

  if (totalScoreA > totalScoreB) {
    overallWinner = prodA.productName;
    winnerProduct = "A";
    verdictSummary = `${prodA.productName} outperforms across ${categoryWinsA} key categories and ${aspectWinsA} verified aspects.`;
  } else if (totalScoreB > totalScoreA) {
    overallWinner = prodB.productName;
    winnerProduct = "B";
    verdictSummary = `${prodB.productName} outperforms across ${categoryWinsB} key categories and ${aspectWinsB} verified aspects.`;
  } else {
    overallWinner = "Draw / Equal Competitors";
    winnerProduct = "Tie";
    verdictSummary = `Both products exhibit evenly balanced sentiment with close scores across core categories.`;
  }

  return {
    categoryMetrics,
    aspectMetrics,
    overallWinner,
    winnerProduct,
    verdictSummary
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Manual Reviews Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseManualReviews(text: string, productName: string): Review[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= APP_CONFIG.scraper.minReviewLength);

  return lines.map((line, idx) => ({
    review_id: `MANUAL_REV_${idx + 1}`,
    product: productName,
    category: "E-Commerce",
    rating: null,
    review_text: line,
    verified_purchase: "Manual"
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Main Job Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export interface StartComparisonOptions {
  urlA?: string;
  urlB?: string;
  reviewsA?: string;
  reviewsB?: string;
  onProductScraped?: (data: AnalyzedProductData) => void;
}

export function startComparisonJob(options: StartComparisonOptions): string {
  const jobId = randomUUID();

  const initialState: JobState = {
    jobId,
    status: "running",
    progress: "Validating",
    percent: 10,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  jobs.set(jobId, initialState);

  // Execute asynchronously
  executeComparisonJob(jobId, options).catch((err) => {
    console.error(`[JOB ERROR ${jobId}]:`, err);
    updateJob(jobId, {
      status: "error",
      progress: "Failed",
      percent: 100,
      error: err.message || "An unexpected error occurred during comparison."
    });
  });

  return jobId;
}

async function executeComparisonJob(jobId: string, options: StartComparisonOptions): Promise<void> {
  const { urlA, urlB, reviewsA, reviewsB, onProductScraped } = options;

  // ── Step 1: Validation ──
  updateJob(jobId, { progress: "Validating", percent: 15 });

  const hasManualA = Boolean(reviewsA && reviewsA.trim().length >= APP_CONFIG.scraper.minReviewLength);
  const hasManualB = Boolean(reviewsB && reviewsB.trim().length >= APP_CONFIG.scraper.minReviewLength);

  if (!hasManualA) {
    if (!urlA) throw new Error("Product A requires either a valid product URL or pasted review text.");
    const valA = validateProductUrl(urlA);
    if (!valA.valid) throw new Error(`Product A: ${valA.error}`);
  }

  if (!hasManualB) {
    if (!urlB) throw new Error("Product B requires either a valid product URL or pasted review text.");
    const valB = validateProductUrl(urlB);
    if (!valB.valid) throw new Error(`Product B: ${valB.error}`);
  }

  // ── Step 2: Fetch / Scrape in Parallel with Promise.allSettled ──
  updateJob(jobId, { progress: "Scraping A", percent: 30 });

  const fetchA = async (): Promise<{ productName: string; platform: string; url?: string; reviews: Review[] }> => {
    if (hasManualA) {
      const parsed = parseManualReviews(reviewsA!, urlA ? "Product A" : "Custom Product A");
      return { productName: "Product A (Pasted)", platform: "Manual", url: urlA, reviews: parsed };
    }
    // Check cache
    const cached = getCachedProduct(urlA!);
    if (cached) {
      console.log(`[CACHE HIT] Product A: ${urlA}`);
      return cached;
    }
    const res = await scrapeWithPlaywright(urlA!);
    if (res.reviews.length === 0) {
      throw new Error("No reviews could be extracted. The site may be blocking requests or review structure changed.");
    }
    setCachedProduct(urlA!, {
      productName: res.productName,
      platform: res.platform,
      url: res.url,
      reviews: res.reviews,
      averageRating: null
    });
    return res;
  };

  const fetchB = async (): Promise<{ productName: string; platform: string; url?: string; reviews: Review[] }> => {
    if (hasManualB) {
      const parsed = parseManualReviews(reviewsB!, urlB ? "Product B" : "Custom Product B");
      return { productName: "Product B (Pasted)", platform: "Manual", url: urlB, reviews: parsed };
    }
    // Check cache
    const cached = getCachedProduct(urlB!);
    if (cached) {
      console.log(`[CACHE HIT] Product B: ${urlB}`);
      return cached;
    }
    const res = await scrapeWithPlaywright(urlB!);
    if (res.reviews.length === 0) {
      throw new Error("No reviews could be extracted. The site may be blocking requests or review structure changed.");
    }
    setCachedProduct(urlB!, {
      productName: res.productName,
      platform: res.platform,
      url: res.url,
      reviews: res.reviews,
      averageRating: null
    });
    return res;
  };

  // Run in parallel
  const [resA, resB] = await Promise.allSettled([fetchA(), fetchB()]);

  // Check failures
  if (resA.status === "rejected" && resB.status === "rejected") {
    const errA = resA.reason?.message || "Unknown error";
    const errB = resB.reason?.message || "Unknown error";
    updateJob(jobId, {
      status: "error",
      progress: "Failed",
      percent: 100,
      failedProduct: "both",
      error: `Both products failed: \n• Product A: ${errA}\n• Product B: ${errB}\nTry using the 'Paste Reviews Manually' fallback.`
    });
    return;
  }

  if (resA.status === "rejected") {
    const reason = resA.reason?.message || "Scraping failed";
    updateJob(jobId, {
      status: "error",
      progress: "Failed",
      percent: 100,
      failedProduct: "A",
      error: `Product A failed: ${reason}. Please try pasting reviews manually.`
    });
    return;
  }

  if (resB.status === "rejected") {
    const reason = resB.reason?.message || "Scraping failed";
    updateJob(jobId, {
      status: "error",
      progress: "Failed",
      percent: 100,
      failedProduct: "B",
      error: `Product B failed: ${reason}. Please try pasting reviews manually.`
    });
    return;
  }

  const dataA = resA.value;
  const dataB = resB.value;

  // ── Step 3: Analyze with ABSA Pipeline ──
  updateJob(jobId, { progress: "Analyzing", percent: 70 });

  const analyzedA = analyzeReviewsForProduct(dataA.productName, dataA.platform, dataA.url, dataA.reviews);
  const analyzedB = analyzeReviewsForProduct(dataB.productName, dataB.platform, dataB.url, dataB.reviews);

  // Hook to add into matrix cache
  if (onProductScraped) {
    try {
      onProductScraped(analyzedA);
      onProductScraped(analyzedB);
    } catch (e) {
      console.error("[COMPARE SERVICE] Error notifying onProductScraped:", e);
    }
  }

  // ── Step 4: Compare Products ──
  updateJob(jobId, { progress: "Comparing", percent: 90 });

  const comparison = compareProductProfiles(analyzedA.profile, analyzedB.profile);

  const finalResult: UrlComparisonResult = {
    productA: analyzedA.profile,
    productB: analyzedB.profile,
    categoryMetrics: comparison.categoryMetrics,
    aspectMetrics: comparison.aspectMetrics,
    overallWinner: comparison.overallWinner,
    winnerProduct: comparison.winnerProduct,
    verdictSummary: comparison.verdictSummary,
    generatedAt: new Date().toISOString()
  };

  // ── Step 5: Mark Job Complete ──
  updateJob(jobId, {
    status: "done",
    progress: "Complete",
    percent: 100,
    result: finalResult
  });

  console.log(`[JOB ${jobId}] Head-to-Head Comparison Completed! Overall Winner: ${finalResult.overallWinner}`);
}

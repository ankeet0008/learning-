/**
 * ============================================================================
 * MODULE: E-Commerce Universal Review Scraper (src/scraper.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Role in Pipeline:
 * 1. Validates and normalizes e-commerce product URLs from ANY platform:
 *    - Amazon, Flipkart, Meesho, Myntra, Nykaa, Snapdeal, eBay, Walmart, Shopify, etc.
 * 2. Fetches product page HTML with realistic modern browser headers.
 * 3. Extracts real customer reviews using a multi-layer strategy:
 *    - Layer 1: Dedicated platform parsers (Amazon, Flipkart, Meesho)
 *    - Layer 2: Schema.org / JSON-LD Structured Review Data (`application/ld+json`)
 *    - Layer 3: Next.js / Nuxt embedded state (`__NEXT_DATA__`, `window.__INITIAL_STATE__`)
 *    - Layer 4: Universal Semantic DOM Review Fallbacks
 * 4. Returns standardized Review[] objects compatible with the ABSA pipeline.
 */

import * as cheerio from "cheerio";
import { Review } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// URL Detection & Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Known e-commerce platform domains */
const ECOMMERCE_PATTERNS: { domain: RegExp; platform: string }[] = [
  { domain: /amazon\.(com|in|co\.uk|de|fr|es|it|ca|com\.au|co\.jp|com\.br|com\.mx|sg)/i, platform: "amazon" },
  { domain: /flipkart\.com/i, platform: "flipkart" },
  { domain: /meesho\.com/i, platform: "meesho" },
  { domain: /myntra\.com/i, platform: "myntra" },
  { domain: /nykaa\.com/i, platform: "nykaa" },
  { domain: /snapdeal\.com/i, platform: "snapdeal" },
  { domain: /ajio\.com/i, platform: "ajio" },
  { domain: /tatacliq\.com/i, platform: "tatacliq" },
  { domain: /ebay\.(com|in|co\.uk|de|com\.au)/i, platform: "ebay" },
  { domain: /walmart\.com/i, platform: "walmart" },
  { domain: /aliexpress\.com/i, platform: "aliexpress" },
  { domain: /etsy\.com/i, platform: "etsy" },
  { domain: /bestbuy\.com/i, platform: "bestbuy" },
  { domain: /target\.com/i, platform: "target" },
];

/** Check if a given string is a valid web URL */
export function isEcommerceUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Detect which e-commerce platform a URL belongs to (or return 'ecommerce' for generic) */
export function detectPlatform(urlStr: string): string {
  try {
    const url = new URL(urlStr.trim());
    const match = ECOMMERCE_PATTERNS.find((p) => p.domain.test(url.hostname));
    return match ? match.platform : "e-commerce";
  } catch {
    return "e-commerce";
  }
}

/** Extract Amazon ASIN from URL */
export function extractAmazonASIN(urlStr: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /\/ASIN\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
  ];

  for (const regex of patterns) {
    const match = urlStr.match(regex);
    if (match) return match[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Fetcher with Realistic Modern Browser Headers
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "max-age=0",
  "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/**
 * Fetches HTML from a URL with timeout and standard headers.
 */
async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — Failed to fetch ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface ScrapedProductInfo {
  productName: string;
  platform: string;
  url: string;
  averageRating: number | null;
  totalRatings: string | null;
  imageUrl: string | null;
}

export interface ScrapeResult {
  product: ScrapedProductInfo;
  reviews: Review[];
  scrapeTimestamp: string;
  reviewCount: number;
}

/** Extracts domain name from URL */
function extractDomain(urlStr: string): string {
  try {
    return new URL(urlStr.trim()).hostname.replace(/^www\./, "");
  } catch {
    return "e-commerce";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy 1: JSON-LD (Schema.org) Universal Review Extractor
// ─────────────────────────────────────────────────────────────────────────────

function extractJsonLdReviews($: ReturnType<typeof cheerio.load>, productName: string): Review[] {
  const reviews: Review[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Look for Product schema with reviews
        const reviewList = item.review || item.reviews || (item["@type"] === "Product" ? item.review : null);

        if (Array.isArray(reviewList)) {
          reviewList.forEach((r: any, idx: number) => {
            const body = r.reviewBody || r.description || r.comment || "";
            const title = r.name || r.headline || "";
            const rating = r.reviewRating?.ratingValue ? parseFloat(r.reviewRating.ratingValue) : null;
            const fullText = title ? (body ? `${title}. ${body}` : title) : body;

            if (fullText && fullText.length >= 8) {
              reviews.push({
                review_id: `JSONLD_REV_${reviews.length + 1}`,
                product: productName,
                category: "E-Commerce",
                rating,
                review_text: fullText,
                verified_purchase: "Yes"
              });
            }
          });
        }
      }
    } catch {
      // JSON parse error on non-standard script tag, ignore
    }
  });

  return reviews;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy 2: Next.js / React Embedded State Extractor (Meesho, etc.)
// ─────────────────────────────────────────────────────────────────────────────

function extractNextDataReviews($: ReturnType<typeof cheerio.load>, productName: string): Review[] {
  const reviews: Review[] = [];

  const nextDataScript = $("#__NEXT_DATA__").html();
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript);
      const pageProps = data?.props?.pageProps;

      // Check common review paths in Next.js state
      const reviewCandidates =
        pageProps?.reviews ||
        pageProps?.productReviews ||
        pageProps?.initialState?.reviews ||
        pageProps?.initialState?.product?.reviews ||
        pageProps?.data?.reviews ||
        [];

      if (Array.isArray(reviewCandidates)) {
        reviewCandidates.forEach((r: any, idx: number) => {
          const body = r.comment || r.review || r.description || r.reviewText || r.review_text || "";
          const title = r.title || r.headline || "";
          const rating = typeof r.rating === "number" ? r.rating : (parseFloat(r.rating) || null);
          const fullText = title ? (body ? `${title}. ${body}` : title) : body;

          if (fullText && fullText.length >= 8) {
            reviews.push({
              review_id: `NEXT_REV_${reviews.length + 1}`,
              product: productName,
              category: "E-Commerce",
              rating,
              review_text: fullText,
              verified_purchase: "Yes"
            });
          }
        });
      }
    } catch {
      // Ignore JSON error
    }
  }

  return reviews;
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy 3: Universal DOM Review Extractor (Works on Any E-Commerce Site)
// ─────────────────────────────────────────────────────────────────────────────

function extractUniversalDomReviews($: ReturnType<typeof cheerio.load>, productName: string, maxReviews: number = 10): Review[] {
  const reviews: Review[] = [];

  // Universal container selectors used across e-commerce websites
  const reviewSelectors = [
    // Amazon
    "[data-hook='review']",
    "div[id^='customer_review-']",
    // Flipkart
    "div.RcXBOT",
    "div.t-ZTKy",
    "div.col.EPCmJX",
    "div._27M-vq",
    // Meesho / Myntra / Nykaa / General
    "[itemprop='review']",
    ".review-card",
    ".review-item",
    ".customer-review",
    ".user-review",
    ".product-review",
    ".feedback-card",
    ".feedback-item",
    "[data-testid='review-item']",
    "[data-testid='review-card']",
    "[data-review-id]",
    ".comment-item",
    ".review"
  ];

  let matchedElements: ReturnType<typeof $> | null = null;
  for (const sel of reviewSelectors) {
    const found = $(sel);
    if (found.length > 0) {
      matchedElements = found;
      break;
    }
  }

  if (matchedElements && matchedElements.length > 0) {
    matchedElements.each((idx, el) => {
      if (reviews.length >= maxReviews) return false;

      const $rev = $(el);

      // Extract Title
      const title =
        $rev.find("[data-hook='reviewTitle'], [data-hook='review-title'], h5, h4, .review-title, .title, [itemprop='name']").first().text().trim() ||
        "";

      // Extract Body
      let body =
        $rev.find("[data-hook='reviewRichContentContainer'], [data-hook='review-body'], [data-hook='reviewText'], [itemprop='reviewBody'], .review-text, .review-body, .comment, .description, p").first().text().trim() ||
        $rev.text().trim() ||
        "";

      // Clean up common boilerplate
      body = body
        .replace(/Brief content visible, double tap to read full content\./gi, "")
        .replace(/Full content visible, double tap to read brief content\./gi, "")
        .replace(/Read more/gi, "")
        .replace(/Read less/gi, "")
        .replace(/Verified Purchase/gi, "")
        .trim();

      // Extract Rating
      let rating: number | null = null;
      const ratingText =
        $rev.find("[data-hook='review-star-rating'], [itemprop='ratingValue'], .rating, .stars, .a-icon-alt").first().text().trim() ||
        $rev.find("[class*='rating']").first().text().trim() ||
        "";
      const ratingMatch = ratingText.match(/([\d.]+)/);
      if (ratingMatch) {
        const parsed = parseFloat(ratingMatch[1]);
        if (parsed >= 1 && parsed <= 5) rating = parsed;
      }

      // Combine Title + Body
      let fullText = "";
      if (title && body) {
        fullText = body.startsWith(title) ? body : `${title}. ${body}`;
      } else {
        fullText = title || body;
      }

      if (fullText.length >= 8 && fullText.length <= 2500) {
        reviews.push({
          review_id: `UNIV_REV_${reviews.length + 1}`,
          product: productName,
          category: "E-Commerce",
          rating,
          review_text: fullText,
          verified_purchase: "Yes"
        });
      }
    });
  }

  return reviews;
}

// ─────────────────────────────────────────────────────────────────────────────
// Universal Product Metadata Extractor
// ─────────────────────────────────────────────────────────────────────────────

function extractUniversalProductInfo($: ReturnType<typeof cheerio.load>, urlStr: string, platform: string): ScrapedProductInfo {
  const info: ScrapedProductInfo = {
    productName: "E-Commerce Product",
    platform,
    url: urlStr,
    averageRating: null,
    totalRatings: null,
    imageUrl: null,
  };

  // 1. Title extraction
  const title =
    $("#productTitle").text().trim() ||
    $("h1[itemprop='name']").text().trim() ||
    $("span.VU-ZEz, span.B_NuCI").text().trim() ||
    $("h1.product-title").text().trim() ||
    $("h1").first().text().trim() ||
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("title").text().replace(/:\s*(Amazon|Flipkart|Meesho|Myntra|Nykaa).*$/i, "").trim() ||
    "E-Commerce Product";

  if (title) info.productName = title;

  // 2. Rating extraction
  const ratingText =
    $("#acrPopover .a-icon-alt").text().trim() ||
    $("[itemprop='ratingValue']").text().trim() ||
    $("[itemprop='ratingValue']").attr("content") ||
    $("div.XQDdHH, div._3LWZlK").first().text().trim() ||
    $("span.a-icon-alt").first().text().trim() ||
    "";
  const ratingMatch = ratingText.match(/([\d.]+)/);
  if (ratingMatch) {
    const val = parseFloat(ratingMatch[1]);
    if (val >= 1 && val <= 5) info.averageRating = val;
  }

  // 3. Total Ratings count
  const countText =
    $("#acrCustomerReviewText").first().text().trim() ||
    $("[itemprop='reviewCount']").text().trim() ||
    $("span.WJeKcQ, span._2_R_DZ").first().text().trim() ||
    $("span[data-hook='total-review-count']").text().trim() ||
    "";
  if (countText) info.totalRatings = countText;

  // 4. Image
  const imgSrc =
    $("#landingImage").attr("src") ||
    $("meta[property='og:image']").attr("content") ||
    $("img[itemprop='image']").attr("src") ||
    $("img.product-image").first().attr("src") ||
    null;
  if (imgSrc) info.imageUrl = imgSrc;

  return info;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedicated Meesho Scraper
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeMeeshoProduct(urlStr: string, maxReviews: number = 10): Promise<{ product: ScrapedProductInfo; reviews: Review[] }> {
  console.log(`[SCRAPER] Fetching Meesho product page: ${urlStr}`);
  const html = await fetchPageHtml(urlStr);
  const $ = cheerio.load(html);

  const info = extractUniversalProductInfo($, urlStr, "meesho");

  // Strategy 1: Next data
  let reviews = extractNextDataReviews($, info.productName);

  // Strategy 2: JSON-LD
  if (reviews.length === 0) {
    reviews = extractJsonLdReviews($, info.productName);
  }

  // Strategy 3: Universal DOM
  if (reviews.length === 0) {
    reviews = extractUniversalDomReviews($, info.productName, maxReviews);
  }

  return { product: info, reviews: reviews.slice(0, maxReviews) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedicated Amazon Scraper
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeAmazonProduct(urlStr: string, asin: string, maxReviews: number = 10): Promise<{ product: ScrapedProductInfo; reviews: Review[] }> {
  const domain = extractDomain(urlStr);
  const productUrl = `https://www.${domain}/dp/${asin}`;

  console.log(`[SCRAPER] Fetching Amazon product page: ${productUrl}`);
  const html = await fetchPageHtml(productUrl);
  const $ = cheerio.load(html);

  const info = extractUniversalProductInfo($, urlStr, "amazon");

  // Extract from DOM
  let reviews = extractUniversalDomReviews($, info.productName, maxReviews);

  // Fallback: JSON-LD
  if (reviews.length === 0) {
    reviews = extractJsonLdReviews($, info.productName);
  }

  return { product: info, reviews: reviews.slice(0, maxReviews) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedicated Flipkart Scraper
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeFlipkartProduct(urlStr: string, maxReviews: number = 10): Promise<{ product: ScrapedProductInfo; reviews: Review[] }> {
  console.log(`[SCRAPER] Fetching Flipkart product page: ${urlStr}`);
  const html = await fetchPageHtml(urlStr);
  const $ = cheerio.load(html);

  const info = extractUniversalProductInfo($, urlStr, "flipkart");
  let reviews = extractUniversalDomReviews($, info.productName, maxReviews);

  if (reviews.length === 0) {
    reviews = extractJsonLdReviews($, info.productName);
  }

  return { product: info, reviews: reviews.slice(0, maxReviews) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic Universal Product Scraper (Handles Any Website)
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeGenericProduct(urlStr: string, maxReviews: number = 10): Promise<{ product: ScrapedProductInfo; reviews: Review[] }> {
  const platform = detectPlatform(urlStr);
  console.log(`[SCRAPER] Running Universal E-Commerce scraper on (${platform}): ${urlStr}`);

  const html = await fetchPageHtml(urlStr);
  const $ = cheerio.load(html);

  const info = extractUniversalProductInfo($, urlStr, platform);

  // Multi-layer extraction
  let reviews = extractJsonLdReviews($, info.productName);

  if (reviews.length === 0) {
    reviews = extractNextDataReviews($, info.productName);
  }

  if (reviews.length === 0) {
    reviews = extractUniversalDomReviews($, info.productName, maxReviews);
  }

  return { product: info, reviews: reviews.slice(0, maxReviews) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Scraper Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point for scraping reviews from any e-commerce URL.
 * Automatically selects the best parser or uses the Universal Scraper.
 *
 * @param urlStr - Any e-commerce product URL
 * @param maxReviews - Maximum reviews to extract (default: 10)
 */
export async function scrapeProductReviews(urlStr: string, maxReviews: number = 10): Promise<ScrapeResult> {
  if (!isEcommerceUrl(urlStr)) {
    throw new Error("Invalid URL format. Please paste a valid product link (http:// or https://).");
  }

  const platform = detectPlatform(urlStr);
  console.log(`[SCRAPER] Detected platform '${platform}' for URL: ${urlStr}`);

  let product: ScrapedProductInfo;
  let reviews: Review[];

  switch (platform) {
    case "amazon": {
      const asin = extractAmazonASIN(urlStr);
      if (asin) {
        const result = await scrapeAmazonProduct(urlStr, asin, maxReviews);
        product = result.product;
        reviews = result.reviews;
      } else {
        const result = await scrapeGenericProduct(urlStr, maxReviews);
        product = result.product;
        reviews = result.reviews;
      }
      break;
    }

    case "flipkart": {
      const result = await scrapeFlipkartProduct(urlStr, maxReviews);
      product = result.product;
      reviews = result.reviews;
      break;
    }

    case "meesho": {
      const result = await scrapeMeeshoProduct(urlStr, maxReviews);
      product = result.product;
      reviews = result.reviews;
      break;
    }

    default: {
      // Handles Myntra, Nykaa, Snapdeal, eBay, Walmart, Shopify, and ANY store!
      const result = await scrapeGenericProduct(urlStr, maxReviews);
      product = result.product;
      reviews = result.reviews;
      break;
    }
  }

  console.log(`[SCRAPER] Successfully extracted ${reviews.length} reviews for "${product.productName}"`);

  return {
    product,
    reviews,
    scrapeTimestamp: new Date().toISOString(),
    reviewCount: reviews.length,
  };
}

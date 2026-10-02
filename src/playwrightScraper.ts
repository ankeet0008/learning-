/**
 * ============================================================================
 * PLAYWRIGHT HEADLESS E-COMMERCE REVIEW SCRAPER (src/playwrightScraper.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 *
 * Features:
 * 1. Playwright-powered headless Chromium browsing with realistic user agents & anti-detection.
 * 2. Site-specific adapters (Amazon, Flipkart) with isolated selectors.
 * 3. Pagination support (up to 5 pages per product).
 * 4. Jitter delay (1.5s - 2.5s) between pagination steps to avoid trigger rate limits.
 * 5. Strict 30s timeout and guaranteed browser resource cleanup in `finally`.
 * 6. Review deduplication and min length filtering (>= 20 characters).
 * 7. Active bot / CAPTCHA detection throwing explicit BlockedByBotProtectionError.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { Review } from "./types.js";
import { APP_CONFIG } from "./config.js";

export class BlockedByBotProtectionError extends Error {
  public platform: string;
  public url: string;

  constructor(message: string, platform: string, url: string) {
    super(message);
    this.name = "BlockedByBotProtectionError";
    this.platform = platform;
    this.url = url;
  }
}

export interface SiteAdapter {
  platform: string;
  match: (hostname: string) => boolean;
  titleSelectors: string[];
  reviewSelectors: string[];
  bodySelectors: string[];
  ratingSelectors: string[];
  nextPageSelectors: string[];
  allReviewsPageSelectors?: string[];
  captchaKeywords: string[];
  captchaSelectors: string[];
}

export const SITE_ADAPTERS: SiteAdapter[] = [
  // ─── 1. AMAZON ADAPTER (amazon.in, amazon.com) ───────────────────────────
  {
    platform: "amazon",
    match: (host: string) => /amazon\.(in|com|co\.uk|de|ca)/i.test(host),
    titleSelectors: [
      "#productTitle",
      "span#productTitle",
      "h1#title",
      "[data-automation-id='product-title']",
      "h1"
    ],
    reviewSelectors: [
      "div[data-hook='review']",
      "div.review",
      "div[id^='customer_review-']"
    ],
    bodySelectors: [
      "span[data-hook='review-body'] span",
      "span[data-hook='review-body']",
      "div[data-hook='review-collapsed']",
      ".review-text-content",
      ".review-text"
    ],
    ratingSelectors: [
      "i[data-hook='review-star-rating'] span",
      "i[data-hook='review-star-rating']",
      ".a-icon-alt"
    ],
    nextPageSelectors: [
      "li.a-last a",
      "ul.a-pagination li.a-last a",
      "a:has-text('Next page')",
      "a[href*='pageNumber=']"
    ],
    allReviewsPageSelectors: [
      "a[data-hook='see-all-reviews-link-foot']",
      "a[data-hook='see-all-reviews-link_button']",
      "a:has-text('See all reviews')"
    ],
    captchaKeywords: [
      "Type the characters you see in this image",
      "Enter the characters shown below",
      "Robot Check",
      "To discuss automated access to Amazon data please contact"
    ],
    captchaSelectors: [
      "form[action*='validateCaptcha']",
      "#captchacharacters",
      "input#captchacharacters"
    ]
  },

  // ─── 2. FLIPKART ADAPTER (flipkart.com) ──────────────────────────────────
  {
    platform: "flipkart",
    match: (host: string) => /flipkart\.com/i.test(host),
    titleSelectors: [
      "span.VU-ZEz",
      "span.B_NuCI",
      "h1.yhB1nd",
      "h1.product-title",
      "h1"
    ],
    reviewSelectors: [
      "div.RcXBOT",
      "div.col.EPCmJX",
      "div._27M-vq",
      "div.t-ZTKy",
      "div._1AtVbE div.t-ZTKy"
    ],
    bodySelectors: [
      "div.t-ZTKy div div",
      "div.t-ZTKy div",
      "div.t-ZTKy",
      "div._2-N8zT",
      "div.row div"
    ],
    ratingSelectors: [
      "div.XQDdHH",
      "div._3LWZlK",
      "div.hGSR34"
    ],
    nextPageSelectors: [
      "nav a span:has-text('Next')",
      "nav._1G5liZ a:has-text('Next')",
      "a._1LKTO3:has-text('Next')",
      "a:has-text('NEXT')",
      "a[href*='page=']"
    ],
    allReviewsPageSelectors: [
      "div._3UAT2v a",
      "div.col.JOpJaq a",
      "a[href*='/product-reviews/']",
      "a:has-text('All reviews')",
      "a:has-text('All 100+ reviews')"
    ],
    captchaKeywords: [
      "Please verify you are a human",
      "Access Denied",
      "Something went wrong, please try again"
    ],
    captchaSelectors: [
      ".captcha",
      "div[data-cy='captcha']"
    ]
  }
];

/**
 * Resolves adapter based on hostname.
 */
export function getAdapterForUrl(urlStr: string): SiteAdapter | null {
  try {
    const url = new URL(urlStr);
    const host = url.hostname;
    for (const adapter of SITE_ADAPTERS) {
      if (adapter.match(host)) return adapter;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Returns random delay between min and max ms.
 */
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Checks page DOM and content for bot blocking / CAPTCHA screens.
 */
async function checkForBotBlock(page: Page, adapter: SiteAdapter, url: string): Promise<void> {
  // 1. Selector check
  for (const sel of adapter.captchaSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        throw new BlockedByBotProtectionError(
          `Automated request blocked by ${adapter.platform.toUpperCase()} bot protection (CAPTCHA challenge detected).`,
          adapter.platform,
          url
        );
      }
    } catch (e) {
      if (e instanceof BlockedByBotProtectionError) throw e;
    }
  }

  // 2. Text keyword check
  try {
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText : "");
    for (const kw of adapter.captchaKeywords) {
      if (bodyText.includes(kw)) {
        throw new BlockedByBotProtectionError(
          `Automated request blocked by ${adapter.platform.toUpperCase()} (${kw}).`,
          adapter.platform,
          url
        );
      }
    }
  } catch (e) {
    if (e instanceof BlockedByBotProtectionError) throw e;
  }
}

/**
 * Extracts product name using adapter selectors.
 */
async function extractProductTitle(page: Page, adapter: SiteAdapter): Promise<string> {
  for (const sel of adapter.titleSelectors) {
    try {
      const text = await page.$eval(sel, (el) => el.textContent?.trim() || "");
      if (text && text.length > 2) {
        return text.replace(/\s+/g, " ");
      }
    } catch {
      // Selector not found, continue to next
    }
  }

  // Fallback to document.title
  try {
    const title = await page.title();
    return title.replace(/:\s*(Amazon|Flipkart).*$/i, "").trim() || "E-Commerce Product";
  } catch {
    return "E-Commerce Product";
  }
}

export interface PlaywrightScrapeResult {
  productName: string;
  platform: string;
  url: string;
  reviews: Review[];
  totalScraped: number;
  pagesScraped: number;
}

/**
 * Scrapes reviews from an e-commerce product URL using Playwright.
 */
export async function scrapeWithPlaywright(
  urlStr: string,
  maxPages: number = APP_CONFIG.scraper.maxPagesPerProduct
): Promise<PlaywrightScrapeResult> {
  const adapter = getAdapterForUrl(urlStr);
  if (!adapter) {
    throw new Error(`No scraper adapter available for URL: ${urlStr}. Only Amazon and Flipkart are supported.`);
  }

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    // Launch headless Chromium with anti-detection options
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1280,800"
      ]
    });

    context = await browser.newContext({
      userAgent: APP_CONFIG.scraper.userAgent,
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Chromium";v="123", "Not:A-Brand";v="8"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"'
      }
    });

    // Hide navigator.webdriver flag
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(APP_CONFIG.scraper.navigationTimeoutMs);
    page.setDefaultTimeout(APP_CONFIG.scraper.actionTimeoutMs);

    console.log(`[PLAYWRIGHT] Navigating to: ${urlStr}`);
    await page.goto(urlStr, { waitUntil: "domcontentloaded", timeout: APP_CONFIG.scraper.navigationTimeoutMs });

    // Check for CAPTCHA / bot block immediately
    await checkForBotBlock(page, adapter, urlStr);

    const productName = await extractProductTitle(page, adapter);
    console.log(`[PLAYWRIGHT] Extracted Product Title: "${productName}" (${adapter.platform})`);

    // If available and on product page, try navigating to the dedicated "All reviews" page
    if (adapter.allReviewsPageSelectors && adapter.allReviewsPageSelectors.length > 0) {
      for (const allRevSel of adapter.allReviewsPageSelectors) {
        try {
          const allRevLink = await page.$(allRevSel);
          if (allRevLink) {
            const href = await allRevLink.getAttribute("href");
            if (href) {
              const fullHref = new URL(href, urlStr).toString();
              console.log(`[PLAYWRIGHT] Navigating to Dedicated Reviews Page: ${fullHref}`);
              await page.goto(fullHref, { waitUntil: "domcontentloaded", timeout: APP_CONFIG.scraper.navigationTimeoutMs });
              await checkForBotBlock(page, adapter, fullHref);
              break;
            }
          }
        } catch {
          // Continue if navigation to all reviews fails
        }
      }
    }

    const uniqueReviews = new Map<string, Review>();
    let currentPageNum = 1;

    while (currentPageNum <= maxPages) {
      console.log(`[PLAYWRIGHT] Scraping page ${currentPageNum}/${maxPages} for "${productName}"...`);
      await checkForBotBlock(page, adapter, page.url());

      // Evaluate review elements on the page
      const pageReviews = await page.evaluate(
        ({ adapterConfig, prodTitle, minLen }) => {
          const extracted: { text: string; rating: number | null }[] = [];

          // Find container elements
          let containerEls: Element[] = [];
          for (const sel of adapterConfig.reviewSelectors) {
            const matches = document.querySelectorAll(sel);
            if (matches.length > 0) {
              containerEls = Array.from(matches);
              break;
            }
          }

          for (const container of containerEls) {
            // Find body text
            let bodyText = "";
            for (const bSel of adapterConfig.bodySelectors) {
              const el = container.querySelector(bSel);
              if (el && el.textContent) {
                bodyText = el.textContent.trim();
                break;
              }
            }

            if (!bodyText) {
              bodyText = container.textContent?.trim() || "";
            }

            // Cleanup boilerplate
            bodyText = bodyText
              .replace(/Brief content visible, double tap to read full content\./gi, "")
              .replace(/Full content visible, double tap to read brief content\./gi, "")
              .replace(/Read more/gi, "")
              .replace(/Verified Purchase/gi, "")
              .replace(/\s+/g, " ")
              .trim();

            if (bodyText.length < minLen) continue;

            // Extract rating
            let ratingVal: number | null = null;
            for (const rSel of adapterConfig.ratingSelectors) {
              const rEl = container.querySelector(rSel);
              if (rEl && rEl.textContent) {
                const match = rEl.textContent.match(/([\d.]+)/);
                if (match) {
                  const parsed = parseFloat(match[1]);
                  if (parsed >= 1 && parsed <= 5) {
                    ratingVal = parsed;
                    break;
                  }
                }
              }
            }

            extracted.push({ text: bodyText, rating: ratingVal });
          }

          return extracted;
        },
        {
          adapterConfig: {
            reviewSelectors: adapter.reviewSelectors,
            bodySelectors: adapter.bodySelectors,
            ratingSelectors: adapter.ratingSelectors
          },
          prodTitle: productName,
          minLen: APP_CONFIG.scraper.minReviewLength
        }
      );

      // Add to unique reviews map (deduplicate by normalized text)
      for (const rev of pageReviews) {
        const key = rev.text.toLowerCase().slice(0, 100);
        if (!uniqueReviews.has(key)) {
          uniqueReviews.set(key, {
            review_id: `PLAYWRIGHT_REV_${uniqueReviews.size + 1}`,
            product: productName,
            category: "E-Commerce",
            rating: rev.rating,
            review_text: rev.text,
            verified_purchase: "Yes"
          });
        }
      }

      console.log(`[PLAYWRIGHT] Total accumulated unique reviews: ${uniqueReviews.size}`);

      if (currentPageNum >= maxPages) break;

      // Look for Next Page button
      let nextClicked = false;
      for (const nextSel of adapter.nextPageSelectors) {
        try {
          const nextBtn = await page.$(nextSel);
          if (nextBtn) {
            const isVisible = await nextBtn.isVisible();
            if (isVisible) {
              // Add random human jitter delay (1.5s - 2.5s)
              const jitter = getRandomDelay(
                APP_CONFIG.scraper.delayRangeMs[0],
                APP_CONFIG.scraper.delayRangeMs[1]
              );
              console.log(`[PLAYWRIGHT] Waiting ${jitter}ms before clicking next page...`);
              await page.waitForTimeout(jitter);

              await Promise.all([
                page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null),
                nextBtn.click()
              ]);
              nextClicked = true;
              break;
            }
          }
        } catch {
          // Selector failed, try next
        }
      }

      if (!nextClicked) {
        console.log(`[PLAYWRIGHT] No next page link found; ending pagination at page ${currentPageNum}.`);
        break;
      }

      currentPageNum++;
    }

    const reviewList = Array.from(uniqueReviews.values());

    return {
      productName,
      platform: adapter.platform,
      url: urlStr,
      reviews: reviewList,
      totalScraped: reviewList.length,
      pagesScraped: currentPageNum
    };
  } finally {
    // ALWAYS close context & browser cleanly
    try {
      if (context) await context.close();
      if (browser) await browser.close();
    } catch (err) {
      console.error("[PLAYWRIGHT] Error during browser cleanup:", err);
    }
  }
}

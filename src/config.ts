/**
 * ============================================================================
 * CONFIGURATION & CONSTANTS (src/config.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 */

export const APP_CONFIG = {
  // Allowed hostnames for live scraping (SSRF prevention)
  allowedHosts: [
    "amazon.in",
    "amazon.com",
    "flipkart.com"
  ],

  // Private and reserved IP blocks to reject (IPv4 and IPv6 SSRF protection)
  blockedIpRanges: [
    "127.0.0.0/8",      // Loopback
    "10.0.0.0/8",       // Private Class A
    "172.16.0.0/12",    // Private Class B
    "192.168.0.0/16",   // Private Class C
    "169.254.0.0/16",   // Link-local
    "0.0.0.0/8",        // Current network
    "::1/128",          // IPv6 Loopback
    "fc00::/7",         // IPv6 Unique Local
    "fe80::/10"         // IPv6 Link-Local
  ],

  // Scraper settings
  scraper: {
    maxPagesPerProduct: 5,
    minReviewLength: 20,
    navigationTimeoutMs: 30000,
    actionTimeoutMs: 15000,
    delayRangeMs: [1500, 2500] as [number, number],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  },

  // Comparison rules
  comparison: {
    minMentionsForVerdict: 5,
    tieScoreGapThreshold: 0.05 // 5% NSS gap or 0.05 normalized
  },

  // Cache settings
  cache: {
    ttlMs: 60 * 60 * 1000 // 1 hour TTL
  },

  // Rate limiting settings (5 requests per minute per IP)
  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 5
  }
};

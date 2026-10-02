/**
 * ============================================================================
 * UNIT TESTS: Comparison Logic & URL Validation (test/compareLogic.test.ts)
 * PROJECT: Aspect-Based E-Commerce Product Feedback Summarizer
 * ============================================================================
 */

import { validateProductUrl, compareProductProfiles } from "../src/compareService.js";
import { ProductAspectProfile } from "../src/types.js";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ ${msg}`);
  }
}

console.log("\n=======================================================");
console.log("RUNNING UNIT TESTS: URL Validation & Comparison Logic");
console.log("=======================================================\n");

// ── Test Suite 1: URL Validation & SSRF Prevention ─────────────────────────
console.log("--- 1. URL Validation & SSRF Guard ---");

// Valid URLs
const amazonValid = validateProductUrl("https://www.amazon.in/dp/B0CX234P7R");
assert(amazonValid.valid === true, "Validates Amazon.in product URL");

const flipkartValid = validateProductUrl("https://www.flipkart.com/apple-iphone-15/p/itm12345");
assert(flipkartValid.valid === true, "Validates Flipkart.com product URL");

const amazonUsValid = validateProductUrl("https://amazon.com/dp/B0CX234P7R?tag=abc");
assert(amazonUsValid.valid === true, "Validates Amazon.com product URL");

// Invalid domain
const disallowedHost = validateProductUrl("https://evil-attacker.com/malicious");
assert(disallowedHost.valid === false, "Rejects untrusted/disallowed domain");

// SSRF: localhost & IP attacks
const ssrfLocalhost = validateProductUrl("http://localhost:3000/admin");
assert(ssrfLocalhost.valid === false, "Blocks SSRF to localhost");

const ssrfLoopback = validateProductUrl("http://127.0.0.1:8080/secret");
assert(ssrfLoopback.valid === false, "Blocks SSRF to 127.0.0.1 loopback");

const ssrfPrivateClassA = validateProductUrl("http://10.0.0.5/api");
assert(ssrfPrivateClassA.valid === false, "Blocks SSRF to 10.x.x.x private network");

const ssrfPrivateClassC = validateProductUrl("http://192.168.1.1/router");
assert(ssrfPrivateClassC.valid === false, "Blocks SSRF to 192.168.x.x private network");

// Invalid protocol
const ftpProtocol = validateProductUrl("ftp://www.amazon.in/test");
assert(ftpProtocol.valid === false, "Rejects non-HTTP(S) protocols");

// ── Test Suite 2: Comparison Logic & Thresholds ───────────────────────────
console.log("\n--- 2. Aspect Matching & Comparison Engine ---");

const dummyProfileA: ProductAspectProfile = {
  productName: "Product Alpha",
  platform: "Amazon",
  reviewCount: 25,
  averageRating: 4.4,
  aspects: [
    // 1. High mentions, decisive winner
    { aspect: "battery life", category: "Battery & Power", positive: 12, negative: 2, neutral: 1, mentionCount: 15, nss: 67 },
    // 2. Score gap under 0.05 (5%) -> should be tie
    { aspect: "screen display", category: "Display & Visuals", positive: 8, negative: 2, neutral: 0, mentionCount: 10, nss: 60 },
    // 3. Mentions < 5 -> should be insufficient
    { aspect: "zipper quality", category: "Build Quality & Design", positive: 3, negative: 0, neutral: 0, mentionCount: 3, nss: 100 },
    // 4. Product B leads
    { aspect: "audio bass", category: "Audio & Sound", positive: 2, negative: 8, neutral: 0, mentionCount: 10, nss: -60 }
  ],
  categories: {
    "Battery & Power": { category: "Battery & Power", positive: 12, negative: 2, neutral: 1, total: 15, nss: 67, status: "Good", aspects: {} },
    "Display & Visuals": { category: "Display & Visuals", positive: 8, negative: 2, neutral: 0, total: 10, nss: 60, status: "Good", aspects: {} },
    "Audio & Sound": { category: "Audio & Sound", positive: 2, negative: 8, neutral: 0, total: 10, nss: -60, status: "Alert", aspects: {} }
  } as any
};

const dummyProfileB: ProductAspectProfile = {
  productName: "Product Beta",
  platform: "Flipkart",
  reviewCount: 25,
  averageRating: 4.1,
  aspects: [
    // 1. Battery life: Alpha should win (67% vs 20%)
    { aspect: "battery life", category: "Battery & Power", positive: 6, negative: 4, neutral: 0, mentionCount: 10, nss: 20 },
    // 2. Screen display: 60% vs 58% -> gap 0.02 (< 0.05) -> Tie
    { aspect: "screen display", category: "Display & Visuals", positive: 7, negative: 2, neutral: 3, mentionCount: 12, nss: 58 },
    // 3. Zipper: Beta has 6 mentions but Alpha has 3 (< 5) -> Insufficient
    { aspect: "zipper quality", category: "Build Quality & Design", positive: 5, negative: 1, neutral: 0, mentionCount: 6, nss: 67 },
    // 4. Audio bass: Beta should win (50% vs -60%)
    { aspect: "audio bass", category: "Audio & Sound", positive: 9, negative: 3, neutral: 0, mentionCount: 12, nss: 50 }
  ],
  categories: {
    "Battery & Power": { category: "Battery & Power", positive: 6, negative: 4, neutral: 0, total: 10, nss: 20, status: "Good", aspects: {} },
    "Display & Visuals": { category: "Display & Visuals", positive: 7, negative: 2, neutral: 3, total: 12, nss: 58, status: "Good", aspects: {} },
    "Audio & Sound": { category: "Audio & Sound", positive: 9, negative: 3, neutral: 0, total: 12, nss: 50, status: "Good", aspects: {} }
  } as any
};

const result = compareProductProfiles(dummyProfileA, dummyProfileB);

// Check Battery Life winner
const batteryMetric = result.aspectMetrics.find((m) => m.aspect === "battery life");
assert(batteryMetric?.winner === "A", "Product A declared winner for 'battery life' (+47% NSS gap)");

// Check Screen Display tie (gap 0.02 < 0.05)
const screenMetric = result.aspectMetrics.find((m) => m.aspect === "screen display");
assert(screenMetric?.winner === "tie", "Screen display declared 'tie' when score gap < 0.05");

// Check Zipper Insufficient (< 5 mentions on Product A)
const zipperMetric = result.aspectMetrics.find((m) => m.aspect === "zipper quality");
assert(zipperMetric?.winner === "insufficient", "Aspect with < 5 mentions marked as 'insufficient'");

// Check Audio Bass winner
const audioMetric = result.aspectMetrics.find((m) => m.aspect === "audio bass");
assert(audioMetric?.winner === "B", "Product B declared winner for 'audio bass'");

// Check Overall winner calculation
assert(typeof result.overallWinner === "string" && result.overallWinner.length > 0, "Overall winner properly calculated");

console.log("\n=======================================================");
console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
console.log("=======================================================\n");

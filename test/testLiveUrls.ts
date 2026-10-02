/**
 * Verification test for live scraping with real product URLs
 */

async function testLiveUrls() {
  console.log("\n=======================================================");
  console.log("TESTING LIVE PLAYWRIGHT SCRAPING WITH TWO REAL PRODUCT URLS");
  console.log("=======================================================\n");

  // Real Amazon.in product (e.g. popular headphones) and Flipkart product
  const urlA = "https://www.amazon.in/dp/B09XS7JWHH"; // Sony WH-1000XM5
  const urlB = "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4"; // iPhone 15

  console.log(`Product A URL: ${urlA}`);
  console.log(`Product B URL: ${urlB}`);

  const postRes = await fetch("http://localhost:3000/api/compare-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urlA, urlB })
  });

  const postData = await postRes.json();
  console.log("POST /api/compare-urls Response:", postRes.status, postData);

  if (!postData.jobId) {
    console.error("Failed to receive jobId");
    return;
  }

  const jobId = postData.jobId;
  console.log(`\nPolling Job ${jobId}...`);

  let done = false;
  let attempts = 0;
  while (!done && attempts < 45) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    try {
      const pollRes = await fetch(`http://localhost:3000/api/compare-urls/${jobId}`);
      const pollData = await pollRes.json();
      console.log(`[${attempts * 2}s] Status: ${pollData.status} | Progress: ${pollData.progress} (${pollData.percent}%)`);

      if (pollData.status === "done") {
        done = true;
        console.log("\n🎉 LIVE SCRAPING & COMPARISON SUCCEEDED!");
        console.log("Product A Name:", pollData.result.productA.productName);
        console.log("Product A Reviews Scraped:", pollData.result.productA.reviewCount);
        console.log("Product B Name:", pollData.result.productB.productName);
        console.log("Product B Reviews Scraped:", pollData.result.productB.reviewCount);
        console.log("Overall Winner:", pollData.result.overallWinner);
        console.log("Verdict Summary:", pollData.result.verdictSummary);
        break;
      } else if (pollData.status === "error") {
        done = true;
        console.log("\n⚠️ LIVE SCRAPING REPORTED ERROR (EXPECTED UNDER BOT PROTECTION/ANTI-SCRAPING):");
        console.log("Failed Product:", pollData.failedProduct);
        console.log("Error Detail:", pollData.error);
        break;
      }
    } catch (err) {
      console.error("Poll request error:", err);
    }
  }
}

testLiveUrls().catch(console.error);

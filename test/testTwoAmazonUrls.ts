/**
 * Verification test with two live Amazon URLs where both succeed
 */

async function testTwoAmazonUrls() {
  console.log("\n=======================================================");
  console.log("TESTING TWO LIVE AMAZON URLS (SONY VS BOSE HEADPHONES)");
  console.log("=======================================================\n");

  const urlA = "https://www.amazon.in/dp/B09XS7JWHH"; // Sony WH-1000XM5 (cached from previous run!)
  const urlB = "https://www.amazon.in/dp/B098FKXT8L"; // Bose QC 45

  const postRes = await fetch("http://localhost:3000/api/compare-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urlA, urlB })
  });

  const postData = await postRes.json();
  console.log("POST /api/compare-urls Response:", postRes.status, postData);

  if (!postData.jobId) return;

  const jobId = postData.jobId;
  console.log(`Polling Job ${jobId}...`);

  let done = false;
  let attempts = 0;
  while (!done && attempts < 40) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    const pollRes = await fetch(`http://localhost:3000/api/compare-urls/${jobId}`);
    const pollData = await pollRes.json();
    console.log(`[${attempts * 2}s] Status: ${pollData.status} | Progress: ${pollData.progress} (${pollData.percent}%)`);

    if (pollData.status === "done") {
      done = true;
      console.log("\n🎉 FULL DUAL LIVE SCRAPING & COMPARISON SUCCEEDED!");
      console.log("Product A:", pollData.result.productA.productName, `(${pollData.result.productA.reviewCount} reviews)`);
      console.log("Product B:", pollData.result.productB.productName, `(${pollData.result.productB.reviewCount} reviews)`);
      console.log("Overall Winner:", pollData.result.overallWinner);
      console.log("Verdict Summary:", pollData.result.verdictSummary);
      console.log("Total Category Metrics:", pollData.result.categoryMetrics.length);
      console.log("Total Matched Aspects:", pollData.result.aspectMetrics.length);
      break;
    } else if (pollData.status === "error") {
      done = true;
      console.log("Job Error:", pollData.error);
      break;
    }
  }
}

testTwoAmazonUrls().catch(console.error);

/**
 * Verification test for /api/compare-urls with fallback pasted reviews
 */

async function run() {
  console.log("Testing POST /api/compare-urls with fallback reviews...");
  const reviewsA = [
    "The battery life is phenomenal lasting easily 16 hours of screen time.",
    "Camera performance in daylight is crystal clear with vibrant colors.",
    "Display brightness is sharp and buttery smooth even in direct sunlight.",
    "Titanium design is lightweight and comfortable to hold with great ergonomics.",
    "Stereo speaker audio quality has deep bass and clear vocal transparency.",
    "Price is noticeably steep for 128GB base storage with no charger in the box.",
    "Charging speed is slightly slow compared to other modern flagship smartphones."
  ].join("\n");

  const reviewsB = [
    "The screen display and anti-reflective glass has silky smooth refresh rate.",
    "Battery backup easily lasts over 24 hours of heavy usage and gaming.",
    "Camera zoom up to 100x produces astonishingly clear daylight photos and portraits.",
    "S-Pen stylus and build quality feel exceptionally sturdy and premium.",
    "Software updates and Galaxy AI features work seamlessly without any stutter.",
    "Device weight feels noticeably heavy and bulky in one-handed pocket use.",
    "Internal speakers audio volume is loud and rich during gaming and movies."
  ].join("\n");

  const postRes = await fetch("http://localhost:3000/api/compare-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urlA: "https://www.amazon.in/dp/B0CHX1W1XY",
      urlB: "https://www.flipkart.com/samsung-galaxy-s24-ultra/p/itm123456",
      reviewsA,
      reviewsB
    })
  });

  const postData = await postRes.json();
  console.log("POST Response status:", postRes.status, postData);

  if (!postData.jobId) {
    throw new Error("No jobId returned!");
  }

  const jobId = postData.jobId;
  console.log(`Polling job ${jobId}...`);

  let done = false;
  let attempts = 0;
  while (!done && attempts < 30) {
    await new Promise((r) => setTimeout(r, 1000));
    const pollRes = await fetch(`http://localhost:3000/api/compare-urls/${jobId}`);
    const pollData = await pollRes.json();
    console.log(`[Attempt ${++attempts}] Status: ${pollData.status} | Progress: ${pollData.progress} (${pollData.percent}%)`);

    if (pollData.status === "done") {
      done = true;
      console.log("\n--- Comparison Result ---");
      console.log("Overall Winner:", pollData.result.overallWinner);
      console.log("Verdict Summary:", pollData.result.verdictSummary);
      console.log("Categories compared:", pollData.result.categoryMetrics.length);
      console.log("Aspects matched:", pollData.result.aspectMetrics.length);
      console.log("\nAspect sample:");
      for (const m of pollData.result.aspectMetrics.slice(0, 5)) {
        console.log(` - ${m.aspect} (${m.category}): Winner = ${m.winner} (${m.winnerName}) [${m.reason}]`);
      }
    } else if (pollData.status === "error") {
      throw new Error(`Job failed: ${pollData.error}`);
    }
  }

  console.log("\n✅ Fallback API test completed successfully!");
}

run().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});

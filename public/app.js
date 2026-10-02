/**
 * ============================================================================
 * ASPECTLENS DASHBOARD — GSAP-Powered Premium Controller
 * Cinematic Animations, Tab Transitions & Micro-Interactions
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // ═══════════════════════════════════════════════════════════════════════
  // GSAP REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════
  gsap.registerPlugin(ScrollTrigger);

  // Chart instances
  let compareChartInstance = null;
  let urlCompareChartInstance = null;
  let ratingChartInstance = null;
  let categoryChartInstance = null;

  // Cached product list
  let allProductsList = [];

  // Chart.js global dark theme
  Chart.defaults.color = "#94a3b8";
  Chart.defaults.borderColor = "rgba(255,255,255,0.04)";
  Chart.defaults.font.family = "'Inter', sans-serif";

  // ═══════════════════════════════════════════════════════════════════════
  // 0. SPLASH SCREEN & PAGE LOAD ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════════════
  function playSplashSequence() {
    const splashScreen = document.getElementById("splash-screen");
    const appShell = document.getElementById("app-shell");

    // Hide the app shell initially (GSAP controls visibility, not CSS)
    gsap.set(appShell, { opacity: 0, visibility: "hidden" });
    gsap.set("#brand", { opacity: 0, x: -20 });
    gsap.set("#nav-tabs", { opacity: 0, y: -10 });

    const splashTL = gsap.timeline();

    // Splash entrance
    splashTL
      .to(".splash-logo", {
        opacity: 1,
        scale: 1,
        duration: 0.6,
        ease: "back.out(1.7)"
      })
      .to(".splash-bar", {
        opacity: 1,
        duration: 0.3
      }, "-=0.2")
      .to("#splash-bar-fill", {
        width: "100%",
        duration: 1.0,
        ease: "power2.inOut"
      })
      .to(".splash-tagline", {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: "power2.out"
      }, "-=0.6")
      // Splash exit
      .to(splashScreen, {
        opacity: 0,
        scale: 1.04,
        filter: "blur(8px)",
        duration: 0.5,
        ease: "power2.in",
        delay: 0.15,
        onComplete: () => {
          splashScreen.style.display = "none";
        }
      })
      // Reveal app shell
      .set(appShell, {
        visibility: "visible",
        opacity: 1
      })
      .call(() => {
        playAppEntrance();
      });

    return splashTL;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // APP ENTRANCE ANIMATION
  // ═══════════════════════════════════════════════════════════════════════
  function playAppEntrance() {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // Ambient orbs fade in and start floating
    tl.to(".ambient-orb", {
      opacity: 1,
      duration: 2,
      stagger: 0.3,
      ease: "power1.out"
    }, 0);

    // Start orb drift animations
    startOrbAnimations();

    // Brand slide in
    tl.to("#brand", {
      opacity: 1,
      x: 0,
      duration: 0.7
    }, 0.1);

    // Nav tabs drop in
    tl.to("#nav-tabs", {
      opacity: 1,
      y: 0,
      duration: 0.6
    }, 0.25);

    // Position nav indicator
    tl.call(() => positionNavIndicator(false), null, 0.4);

    // Animate initial tab content
    tl.call(() => animateTabContent("tab-sandbox"), null, 0.35);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AMBIENT ORB DRIFT ANIMATIONS
  // ═══════════════════════════════════════════════════════════════════════
  function startOrbAnimations() {
    gsap.to(".orb-1", {
      x: 60,
      y: 40,
      duration: 12,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });

    gsap.to(".orb-2", {
      x: -50,
      y: -30,
      duration: 15,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });

    gsap.to(".orb-3", {
      x: 40,
      y: -50,
      duration: 10,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. NAV INDICATOR PILL
  // ═══════════════════════════════════════════════════════════════════════
  function positionNavIndicator(animate = true) {
    const activeTab = document.querySelector(".nav-tab.active");
    const indicator = document.getElementById("nav-indicator");
    if (!activeTab || !indicator) return;

    const navTabs = document.getElementById("nav-tabs");
    const navRect = navTabs.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();

    const left = tabRect.left - navRect.left;
    const width = tabRect.width;

    if (animate) {
      gsap.to(indicator, {
        left: left,
        width: width,
        duration: 0.45,
        ease: "power3.out"
      });
    } else {
      gsap.set(indicator, { left: left, width: width });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. TAB NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════
  const navTabs = document.querySelectorAll(".nav-tab");
  const tabPanes = document.querySelectorAll(".tab-pane");

  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-tab");
      const currentActive = document.querySelector(".tab-pane.active");
      const targetPane = document.getElementById(targetId);

      if (currentActive === targetPane) return;

      // Update nav state
      navTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Slide indicator
      positionNavIndicator(true);

      // Exit current pane
      if (currentActive) {
        gsap.to(currentActive, {
          opacity: 0,
          y: 10,
          duration: 0.25,
          ease: "power2.in",
          onComplete: () => {
            currentActive.classList.remove("active");
            gsap.set(currentActive, { clearProps: "opacity,y" });

            // Enter new pane
            if (targetPane) {
              targetPane.classList.add("active");
              animateTabContent(targetId);
            }
          }
        });
      } else if (targetPane) {
        targetPane.classList.add("active");
        animateTabContent(targetId);
      }

      // Auto-trigger tab specific loads
      if (targetId === "tab-matrix" && allProductsList.length > 0) {
        const select = document.getElementById("product-select");
        if (select && select.value) loadProductMatrix(select.value);
      } else if (targetId === "tab-analytics") {
        loadEDAAnalytics();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TAB CONTENT ENTRANCE ANIMATION
  // ═══════════════════════════════════════════════════════════════════════
  function animateTabContent(tabId) {
    const pane = document.getElementById(tabId);
    if (!pane) return;

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // Gather all animatable elements and set them hidden first
    const header = pane.querySelector(".pane-header");
    const presetsBar = pane.querySelector(".presets-bar");
    const cards = pane.querySelectorAll(".card:not(.hidden)");
    const kpiCards = pane.querySelectorAll(".kpi-card");

    // Set initial hidden states
    if (header) gsap.set(header, { opacity: 0, y: 20 });
    if (presetsBar) gsap.set(presetsBar, { opacity: 0, y: 14 });
    cards.forEach((card) => gsap.set(card, { opacity: 0, y: 18 }));
    kpiCards.forEach((card) => gsap.set(card, { opacity: 0, y: 16, scale: 0.96 }));

    // Animate in: header
    if (header) {
      tl.to(header, { opacity: 1, y: 0, duration: 0.5 }, 0);
    }

    // Animate in: presets bar
    if (presetsBar) {
      tl.to(presetsBar, { opacity: 1, y: 0, duration: 0.5 }, 0.08);
    }

    // Animate in: cards stagger
    cards.forEach((card, i) => {
      tl.to(card, { opacity: 1, y: 0, duration: 0.55 }, 0.12 + i * 0.07);
    });

    // Animate in: KPI cards stagger (analytics tab)
    kpiCards.forEach((card, i) => {
      tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.5 }, 0.08 + i * 0.07);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. TAB 1: LIVE REVIEW SANDBOX (TEXT + URL MODES)
  // ═══════════════════════════════════════════════════════════════════════
  const reviewInput = document.getElementById("review-input-text");
  const charCounter = document.getElementById("char-counter");
  const btnAnalyze = document.getElementById("btn-analyze");
  const btnClear = document.getElementById("btn-clear");
  const presetBtns = document.querySelectorAll(".preset-btn");
  const sandboxResults = document.getElementById("sandbox-results");
  const aspectGrid = document.getElementById("aspect-cards-grid");
  const aspectBadge = document.getElementById("aspect-count-badge");
  const jsonRawOutput = document.getElementById("json-raw-output");

  // URL mode elements
  const modeBtnText = document.getElementById("mode-btn-text");
  const modeBtnUrl = document.getElementById("mode-btn-url");
  const textInputCard = document.getElementById("text-input-card");
  const urlInputCard = document.getElementById("url-input-card");
  const urlInput = document.getElementById("url-input");
  const urlPlatformBadge = document.getElementById("url-platform-badge");
  const btnScrape = document.getElementById("btn-scrape");
  const btnClearUrl = document.getElementById("btn-clear-url");
  const presetsBar = document.getElementById("presets-bar");
  const scrapeResults = document.getElementById("scrape-results");

  let currentMode = "text"; // "text" or "url"

  // ── Mode Toggle Handler ──
  function switchMode(mode) {
    currentMode = mode;
    const modeBtns = document.querySelectorAll(".mode-btn");
    modeBtns.forEach((btn) => btn.classList.remove("active"));

    if (mode === "text") {
      modeBtnText.classList.add("active");
      textInputCard.classList.remove("hidden");
      urlInputCard.classList.add("hidden");
      if (presetsBar) presetsBar.classList.remove("hidden");
      // Hide scrape results, show text results if they exist
      if (scrapeResults) scrapeResults.classList.add("hidden");
      gsap.fromTo(textInputCard, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" });
    } else {
      modeBtnUrl.classList.add("active");
      textInputCard.classList.add("hidden");
      urlInputCard.classList.remove("hidden");
      if (presetsBar) presetsBar.classList.add("hidden");
      // Hide text results, show scrape results if they exist
      if (sandboxResults) sandboxResults.classList.add("hidden");
      gsap.fromTo(urlInputCard, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" });
    }
  }

  if (modeBtnText) {
    modeBtnText.addEventListener("click", () => switchMode("text"));
  }
  if (modeBtnUrl) {
    modeBtnUrl.addEventListener("click", () => switchMode("url"));
  }

  // ── URL Platform Auto-Detection ──
  const URL_PLATFORM_PATTERNS = [
    { pattern: /amazon\.(com|in|co\.uk|de|fr|es|it|ca|com\.au|co\.jp|com\.br|com\.mx)/i, name: "Amazon", cls: "amazon" },
    { pattern: /flipkart\.com/i, name: "Flipkart", cls: "flipkart" },
    { pattern: /meesho\.com/i, name: "Meesho", cls: "meesho" },
    { pattern: /myntra\.com/i, name: "Myntra", cls: "myntra" },
    { pattern: /nykaa\.com/i, name: "Nykaa", cls: "nykaa" },
    { pattern: /snapdeal\.com/i, name: "Snapdeal", cls: "snapdeal" },
    { pattern: /ebay\./i, name: "eBay", cls: "ebay" },
    { pattern: /walmart\.com/i, name: "Walmart", cls: "walmart" },
  ];

  if (urlInput) {
    urlInput.addEventListener("input", () => {
      const val = urlInput.value.trim();
      let detected = null;

      if (val.length > 8) {
        for (const p of URL_PLATFORM_PATTERNS) {
          if (p.pattern.test(val)) {
            detected = p;
            break;
          }
        }
        // Fallback for any other valid URL
        if (!detected && (val.startsWith("http://") || val.startsWith("https://"))) {
          try {
            const domain = new URL(val).hostname.replace(/^www\./, "");
            detected = { name: domain, cls: "generic" };
          } catch {}
        }
      }

      if (detected && urlPlatformBadge) {
        urlPlatformBadge.textContent = `✓ ${detected.name}`;
        urlPlatformBadge.className = `url-platform-badge visible ${detected.cls || "generic"}`;
      } else if (urlPlatformBadge) {
        urlPlatformBadge.className = "url-platform-badge";
        urlPlatformBadge.textContent = "";
      }
    });
  }

  if (reviewInput) {
    reviewInput.addEventListener("input", () => {
      charCounter.textContent = `${reviewInput.value.length} chars`;

      // Auto-detect if user pasted a URL in text mode
      const val = reviewInput.value.trim();
      if (val.startsWith("http") && (val.includes("amazon.") || val.includes("flipkart."))) {
        // Auto-switch to URL mode
        if (urlInput) urlInput.value = val;
        reviewInput.value = "";
        charCounter.textContent = "0 chars";
        switchMode("url");
        // Trigger platform detection
        urlInput.dispatchEvent(new Event("input"));
      }
    });
  }

  // Preset Buttons
  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const sampleText = btn.getAttribute("data-text");
      if (reviewInput && sampleText) {
        reviewInput.value = sampleText;
        charCounter.textContent = `${sampleText.length} chars`;

        // Micro-animation: flash the textarea
        gsap.fromTo(reviewInput,
          { borderColor: "rgba(129,140,248,0.5)" },
          { borderColor: "rgba(255,255,255,0.06)", duration: 0.8, ease: "power2.out" }
        );

        analyzeReview(sampleText);
      }
    });
  });

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      if (reviewInput) reviewInput.value = "";
      charCounter.textContent = "0 chars";
      if (sandboxResults) {
        gsap.to(sandboxResults, {
          opacity: 0,
          y: 10,
          duration: 0.3,
          ease: "power2.in",
          onComplete: () => {
            sandboxResults.classList.add("hidden");
            gsap.set(sandboxResults, { clearProps: "opacity,y" });
          }
        });
      }
    });
  }

  if (btnClearUrl) {
    btnClearUrl.addEventListener("click", () => {
      if (urlInput) urlInput.value = "";
      if (urlPlatformBadge) {
        urlPlatformBadge.className = "url-platform-badge";
        urlPlatformBadge.textContent = "";
      }
      if (scrapeResults) {
        gsap.to(scrapeResults, {
          opacity: 0,
          y: 10,
          duration: 0.3,
          ease: "power2.in",
          onComplete: () => {
            scrapeResults.classList.add("hidden");
            gsap.set(scrapeResults, { clearProps: "opacity,y" });
          }
        });
      }
    });
  }

  if (btnAnalyze) {
    btnAnalyze.addEventListener("click", () => {
      const text = reviewInput ? reviewInput.value.trim() : "";
      if (!text) {
        // Shake animation on empty input
        gsap.to(reviewInput, {
          x: [-8, 8, -6, 6, -3, 3, 0],
          duration: 0.5,
          ease: "power2.out"
        });
        return;
      }
      analyzeReview(text);
    });
  }

  // ── Scrape Button Handler ──
  if (btnScrape) {
    btnScrape.addEventListener("click", () => {
      const url = urlInput ? urlInput.value.trim() : "";
      if (!url) {
        gsap.to(urlInput ? urlInput.closest(".url-input-wrapper") : null, {
          x: [-8, 8, -6, 6, -3, 3, 0],
          duration: 0.5,
          ease: "power2.out"
        });
        return;
      }
      scrapeAndAnalyze(url);
    });
  }

  // ── Text Analyze Function (existing) ──
  async function analyzeReview(text) {
    try {
      btnAnalyze.disabled = true;
      btnAnalyze.innerHTML = `<span>⏳</span> Analyzing...`;

      // Pulse animation on button while loading
      const loadingPulse = gsap.to(btnAnalyze, {
        boxShadow: "0 0 30px rgba(129,140,248,0.4)",
        repeat: -1,
        yoyo: true,
        duration: 0.6
      });

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const data = await response.json();
      loadingPulse.kill();
      btnAnalyze.disabled = false;
      btnAnalyze.innerHTML = `<span class="btn-icon">⚡</span> Run Analysis`;
      gsap.set(btnAnalyze, { clearProps: "boxShadow" });

      if (!response.ok || data.error) {
        alert(data.error || "Failed to analyze review.");
        return;
      }

      renderSandboxResults(data);
    } catch (err) {
      btnAnalyze.disabled = false;
      btnAnalyze.innerHTML = `<span class="btn-icon">⚡</span> Run Analysis`;
      gsap.set(btnAnalyze, { clearProps: "boxShadow" });
      console.error("Analysis Error:", err);
      alert("Failed to connect to ABSA server.");
    }
  }

  // ── URL Scrape & Analyze Function (NEW) ──
  async function scrapeAndAnalyze(url) {
    try {
      btnScrape.disabled = true;
      btnScrape.innerHTML = `<span>⏳</span> Scraping Reviews...`;

      // Pulse animation
      const loadingPulse = gsap.to(btnScrape, {
        boxShadow: "0 0 30px rgba(245,158,11,0.4)",
        repeat: -1,
        yoyo: true,
        duration: 0.6
      });

      // Show loading state in results area
      scrapeResults.classList.remove("hidden");
      scrapeResults.innerHTML = `
        <div class="card">
          <div class="scrape-loading-overlay">
            <div class="scrape-loading-spinner"></div>
            <div class="scrape-loading-text">Scraping customer reviews...</div>
            <div class="scrape-loading-subtext">Fetching real reviews from the product page. This may take 5-10 seconds.</div>
          </div>
        </div>
      `;
      gsap.fromTo(scrapeResults, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4 });

      const response = await fetch("/api/scrape-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      loadingPulse.kill();
      btnScrape.disabled = false;
      btnScrape.innerHTML = `<span class="btn-icon">🔍</span> Scrape & Analyze Reviews`;
      gsap.set(btnScrape, { clearProps: "boxShadow" });

      if (!response.ok || data.error) {
        scrapeResults.innerHTML = `
          <div class="card" style="border-color: var(--neg-border);">
            <div class="scrape-loading-overlay">
              <div style="font-size: 48px;">⚠️</div>
              <div class="scrape-loading-text" style="color: var(--neg);">Scraping Failed</div>
              <div class="scrape-loading-subtext">${escapeHtml(data.error || "Unknown error occurred.")}</div>
            </div>
          </div>
        `;
        return;
      }

      renderScrapeResults(data);
    } catch (err) {
      btnScrape.disabled = false;
      btnScrape.innerHTML = `<span class="btn-icon">🔍</span> Scrape & Analyze Reviews`;
      gsap.set(btnScrape, { clearProps: "boxShadow" });
      console.error("Scrape Error:", err);

      if (scrapeResults) {
        scrapeResults.innerHTML = `
          <div class="card" style="border-color: var(--neg-border);">
            <div class="scrape-loading-overlay">
              <div style="font-size: 48px;">❌</div>
              <div class="scrape-loading-text" style="color: var(--neg);">Connection Failed</div>
              <div class="scrape-loading-subtext">Could not connect to the ABSA server. Make sure it's running.</div>
            </div>
          </div>
        `;
      }
    }
  }

  // ── Render Scraped Results (NEW) ──
  function renderScrapeResults(data) {
    if (!scrapeResults) return;

    const product = data.product || {};
    const reviews = data.reviews || [];
    const aggregated = data.aggregated || {};

    // Build the full results HTML
    let html = "";

    // 1. Product Header Card
    const platformName = (product.platform || "e-commerce").charAt(0).toUpperCase() + (product.platform || "e-commerce").slice(1);
    const avgRating = product.averageRating ? product.averageRating.toFixed(1) : "—";

    html += `
      <div class="card scrape-product-card">
        <div class="scrape-product-info">
          <div class="scrape-product-meta">
            <span class="scrape-platform-pill">${escapeHtml(platformName)}</span>
            <h3>${escapeHtml(product.productName || "Unknown Product")}</h3>
            <div class="scrape-stats-row">
              <span class="scrape-stat">
                <span class="stat-icon">📝</span> <strong>${data.totalReviews || 0}</strong> Reviews Scraped
              </span>
              <span class="scrape-stat">
                <span class="stat-icon">🔬</span> <strong>${data.totalAspects || 0}</strong> Aspects Extracted
              </span>
              <span class="scrape-stat">
                <span class="stat-icon">⭐</span> <strong>${avgRating}</strong> Avg Rating
              </span>
            </div>
          </div>
        </div>
      </div>
    `;

    // 2. Aggregated Sentiment Summary
    if (aggregated && Object.keys(aggregated).length > 0) {
      html += `
        <div class="card">
          <h3 class="section-title">📊 Aggregated Sentiment Summary</h3>
          <div class="category-grid">
      `;

      for (const [catName, summary] of Object.entries(aggregated)) {
        const nssClass = summary.nss >= 20 ? "pos" : summary.nss <= -20 ? "neg" : "neu";
        const icon = summary.nss >= 20 ? "👍" : summary.nss <= -20 ? "⚠️" : "⚖️";
        const posPct = summary.total > 0 ? (summary.positive / summary.total) * 100 : 0;
        const negPct = summary.total > 0 ? (summary.negative / summary.total) * 100 : 0;
        const neuPct = summary.total > 0 ? (summary.neutral / summary.total) * 100 : 0;

        let subAspectsHtml = "";
        if (summary.aspects) {
          for (const [subAsp, counts] of Object.entries(summary.aspects)) {
            subAspectsHtml += `
              <li class="sub-aspect-item">
                <span class="sub-aspect-name">${escapeHtml(subAsp)}</span>
                <span>
                  <strong style="color: var(--pos);">+${counts.Positive}</strong> /
                  <strong style="color: var(--neg);">-${counts.Negative}</strong> /
                  <span style="color: var(--neu);">*${counts.Neutral}</span>
                </span>
              </li>
            `;
          }
        }

        html += `
          <div class="category-card">
            <div class="cat-header">
              <div class="cat-title">${icon} ${escapeHtml(catName)}</div>
              <div class="cat-nss ${nssClass}">${summary.nss >= 0 ? "+" : ""}${summary.nss}% NSS</div>
            </div>
            <div class="cat-progress-bar">
              <div style="width: ${posPct}%; background: var(--pos);"></div>
              <div style="width: ${neuPct}%; background: var(--neu); opacity: 0.4;"></div>
              <div style="width: ${negPct}%; background: var(--neg);"></div>
            </div>
            <div style="font-size: 11px; color: var(--text-4); margin-bottom: 8px;">
              ${escapeHtml(summary.status || "")} • ${summary.total} mentions (${summary.positive} pos, ${summary.negative} neg)
            </div>
            <ul class="cat-sub-aspects-list">${subAspectsHtml}</ul>
          </div>
        `;
      }

      html += `</div></div>`;
    }

    // 3. Individual Review Cards
    if (reviews.length > 0) {
      html += `
        <div class="card" id="scrape-reviews-container">
          <div class="reviews-section-header">
            <div>
              <h3 class="section-title" style="margin-bottom: 4px;">💬 Extracted Customer Reviews (${reviews.length} Total)</h3>
              <p style="font-size: 12.5px; color: var(--text-3);">Full real reviews scraped from product page with extracted aspect-opinion triplets.</p>
            </div>
            <div class="reviews-controls">
              <button class="btn btn-secondary btn-sm" id="btn-toggle-all-reviews" onclick="
                const items = document.querySelectorAll('.scrape-review-item');
                const isAllExpanded = Array.from(items).every(i => i.classList.contains('expanded'));
                items.forEach(i => isAllExpanded ? i.classList.remove('expanded') : i.classList.add('expanded'));
                this.textContent = isAllExpanded ? '📂 Expand All' : '📁 Collapse All';
              ">
                📂 Expand All
              </button>
            </div>
          </div>
          <div class="scrape-reviews-list">
      `;

      reviews.forEach((rev, idx) => {
        const rating = rev.rating;
        const stars = rating ? "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating)) : "";
        const aspectCount = rev.aspects ? rev.aspects.length : 0;
        const previewText = rev.review_text.length > 90 ? rev.review_text.substring(0, 90) + "..." : rev.review_text;

        let aspectsHtml = "";
        if (rev.aspects && rev.aspects.length > 0) {
          rev.aspects.forEach((asp) => {
            const miniClass = asp.sentiment === "Positive" ? "mini-pos" : asp.sentiment === "Negative" ? "mini-neg" : "mini-neu";
            const sentimentIcon = asp.sentiment === "Positive" ? "👍" : asp.sentiment === "Negative" ? "👎" : "⚖️";
            aspectsHtml += `
              <div class="review-aspect-mini ${miniClass}">
                <div class="mini-aspect-header">
                  <span class="mini-aspect-name">${escapeHtml(asp.aspect)}</span>
                  <span class="mini-sentiment-pill">${sentimentIcon} ${asp.sentiment}</span>
                </div>
                <div class="mini-aspect-opinion">"${escapeHtml(asp.opinion)}"</div>
                <div class="mini-aspect-cat">📂 ${escapeHtml(asp.category)}</div>
              </div>
            `;
          });
        } else {
          aspectsHtml = `<p style="color: var(--text-4); font-size: 12px; padding: 6px;">No aspect-opinion pairs detected in this specific review.</p>`;
        }

        html += `
          <div class="scrape-review-item expanded" data-review-idx="${idx}">
            <div class="scrape-review-item-header" onclick="this.parentElement.classList.toggle('expanded')">
              <div class="review-header-left">
                <span class="review-number">#${idx + 1}</span>
                <div class="review-header-titles">
                  ${stars ? `<span class="review-rating-stars">${stars} (${rating}★)</span>` : ""}
                  <span class="review-preview-text">${escapeHtml(previewText)}</span>
                </div>
              </div>
              <div class="review-header-right">
                <span class="review-aspect-count">${aspectCount} aspect${aspectCount !== 1 ? "s" : ""}</span>
                <span class="review-expand-icon">▼</span>
              </div>
            </div>
            <div class="scrape-review-body">
              <div class="review-full-text-box">
                <div class="review-quote-label">Full Customer Review:</div>
                <p class="review-quote-content">"${escapeHtml(rev.review_text)}"</p>
              </div>
              <div class="review-aspects-section">
                <div class="review-aspects-title">Detected Aspects & Sentiment:</div>
                <div class="review-aspects-mini-grid">${aspectsHtml}</div>
              </div>
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
    }

    // 4. JSON Viewer
    html += `
      <details class="json-viewer">
        <summary>View Raw JSON API Response</summary>
        <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
      </details>
    `;

    // Inject and animate
    scrapeResults.innerHTML = html;
    scrapeResults.classList.remove("hidden");

    // Stagger animate all cards
    const allCards = scrapeResults.querySelectorAll(".card, .json-viewer");
    gsap.fromTo(allCards,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.55, stagger: 0.1, ease: "power3.out" }
    );

    // Animate category cards inside aggregated
    const catCards = scrapeResults.querySelectorAll(".category-card");
    if (catCards.length > 0) {
      gsap.fromTo(catCards,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power3.out", delay: 0.3 }
      );
    }

    // Animate review items
    const reviewItems = scrapeResults.querySelectorAll(".scrape-review-item");
    if (reviewItems.length > 0) {
      gsap.fromTo(reviewItems,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.35, stagger: 0.05, ease: "power2.out", delay: 0.4 }
      );
    }

    // Auto-expand the first review
    if (reviewItems.length > 0) {
      setTimeout(() => reviewItems[0].classList.add("expanded"), 600);
    }
  }

  // ── Render Text Mode Results (existing) ──
  function renderSandboxResults(data) {
    if (!sandboxResults || !aspectGrid) return;

    aspectGrid.innerHTML = "";
    sandboxResults.classList.remove("hidden");

    aspectBadge.textContent = `${data.total_aspects} Aspect${data.total_aspects === 1 ? "" : "s"}`;
    jsonRawOutput.textContent = JSON.stringify(data, null, 2);

    if (!data.aspects || data.aspects.length === 0) {
      aspectGrid.innerHTML = `
        <div class="aspect-card card-neu" style="grid-column: 1 / -1; text-align: center; padding: 24px; opacity: 1; transform: none;">
          <p style="color: var(--text-3);">No aspect-opinion pairs detected with high confidence.</p>
        </div>
      `;
      gsap.fromTo(sandboxResults, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
      return;
    }

    data.aspects.forEach((asp) => {
      const sentimentClass = asp.sentiment === "Positive" ? "card-pos" : asp.sentiment === "Negative" ? "card-neg" : "card-neu";
      const badgeClass = asp.sentiment === "Positive" ? "badge-pos" : asp.sentiment === "Negative" ? "badge-neg" : "badge-neu";
      const fillClass = asp.sentiment === "Positive" ? "fill-pos" : "fill-neg";
      const fillWidth = Math.abs(asp.score) * 100;
      const scoreSign = asp.score >= 0 ? "+" : "";

      const card = document.createElement("div");
      card.className = `aspect-card ${sentimentClass}`;
      card.setAttribute("data-fill-width", Math.max(10, fillWidth));
      card.innerHTML = `
        <div class="aspect-card-header">
          <div class="aspect-name">${escapeHtml(asp.aspect)}</div>
          <span class="badge ${badgeClass}">${asp.sentiment}</span>
        </div>
        <div class="aspect-category-tag">📂 ${escapeHtml(asp.category)} (${Math.round(asp.confidence * 100)}% match)</div>
        <div class="opinion-badge">
          <span>Opinion:</span>
          <span class="opinion-quote">"${escapeHtml(asp.opinion)}"</span>
        </div>
        <div class="score-meter" title="Score: ${scoreSign}${asp.score}">
          <div class="score-fill ${fillClass}"></div>
        </div>
      `;
      aspectGrid.appendChild(card);
    });

    // Animate results card in
    gsap.fromTo(sandboxResults, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });

    // Stagger animate aspect cards
    const cards = aspectGrid.querySelectorAll(".aspect-card");
    gsap.fromTo(cards,
      { opacity: 0, y: 16, scale: 0.97 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        stagger: 0.08,
        ease: "power3.out",
        onComplete: () => {
          // Animate score meter fills
          cards.forEach((card) => {
            const fill = card.querySelector(".score-fill");
            const targetWidth = card.getAttribute("data-fill-width");
            if (fill && targetWidth) {
              gsap.to(fill, {
                width: targetWidth + "%",
                duration: 0.8,
                ease: "power3.out",
                delay: 0.1
              });
            }
          });
        }
      }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. TAB 2: PRODUCT ASPECT MATRIX
  // ═══════════════════════════════════════════════════════════════════════
  const productSelect = document.getElementById("product-select");
  const matrixView = document.getElementById("product-matrix-view");
  const prodTitle = document.getElementById("prod-title");
  const prodCategoryBadge = document.getElementById("prod-category-badge");
  const prodAvgNss = document.getElementById("prod-avg-nss");
  const categoryCardsContainer = document.getElementById("category-cards-container");

  async function loadProductsDropdown() {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (!data.products) return;

      allProductsList = data.products;

      if (productSelect) {
        productSelect.innerHTML = "";
        data.products.forEach((p, idx) => {
          const opt = document.createElement("option");
          opt.value = p.product;
          opt.textContent = `${p.product} (${p.category} — ${p.reviewCount} reviews)`;
          if (idx === 0) opt.selected = true;
          productSelect.appendChild(opt);
        });

        productSelect.addEventListener("change", () => {
          loadProductMatrix(productSelect.value);
        });

        if (data.products.length > 0) {
          loadProductMatrix(data.products[0].product);
        }
      }

      populateComparisonDropdowns(data.products);
    } catch (err) {
      console.error("Failed to load products:", err);
    }
  }

  async function loadProductMatrix(productName) {
    try {
      const res = await fetch(`/api/matrix?product=${encodeURIComponent(productName)}`);
      const data = await res.json();

      if (!data.categories) return;

      matrixView.classList.remove("hidden");
      prodTitle.textContent = data.product;

      const prodMeta = allProductsList.find((p) => p.product === data.product);
      if (prodMeta && prodCategoryBadge) {
        prodCategoryBadge.textContent = prodMeta.category;
      }

      // Calculate Average NSS
      let totalNss = 0;
      let catCount = 0;
      for (const [catName, summary] of Object.entries(data.categories)) {
        if (catName !== "General & Other" && summary.total > 0) {
          totalNss += summary.nss;
          catCount++;
        }
      }
      const avgNss = catCount > 0 ? Math.round(totalNss / catCount) : 0;
      prodAvgNss.textContent = `${avgNss >= 0 ? "+" : ""}${avgNss}%`;
      prodAvgNss.style.color = avgNss >= 20 ? "var(--pos)" : avgNss <= -20 ? "var(--neg)" : "var(--cyan)";

      // Animate NSS value
      gsap.fromTo(prodAvgNss,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.7)" }
      );

      // Render Categories
      categoryCardsContainer.innerHTML = "";
      for (const [catName, summary] of Object.entries(data.categories)) {
        const nssClass = summary.nss >= 20 ? "pos" : summary.nss <= -20 ? "neg" : "neu";
        const icon = summary.nss >= 20 ? "👍" : summary.nss <= -20 ? "⚠️" : "⚖️";

        const posPct = summary.total > 0 ? (summary.positive / summary.total) * 100 : 0;
        const negPct = summary.total > 0 ? (summary.negative / summary.total) * 100 : 0;
        const neuPct = summary.total > 0 ? (summary.neutral / summary.total) * 100 : 0;

        let subAspectsHtml = "";
        for (const [subAsp, counts] of Object.entries(summary.aspects)) {
          subAspectsHtml += `
            <li class="sub-aspect-item">
              <span class="sub-aspect-name">${escapeHtml(subAsp)}</span>
              <span>
                <strong style="color: var(--pos);">+${counts.Positive}</strong> /
                <strong style="color: var(--neg);">-${counts.Negative}</strong> /
                <span style="color: var(--neu);">*${counts.Neutral}</span>
              </span>
            </li>
          `;
        }

        const catCard = document.createElement("div");
        catCard.className = "category-card";
        catCard.innerHTML = `
          <div class="cat-header">
            <div class="cat-title">${icon} ${escapeHtml(catName)}</div>
            <div class="cat-nss ${nssClass}">${summary.nss >= 0 ? "+" : ""}${summary.nss}% NSS</div>
          </div>
          <div class="cat-progress-bar">
            <div style="width: ${posPct}%; background: var(--pos);"></div>
            <div style="width: ${neuPct}%; background: var(--neu); opacity: 0.4;"></div>
            <div style="width: ${negPct}%; background: var(--neg);"></div>
          </div>
          <div style="font-size: 11px; color: var(--text-4); margin-bottom: 8px;">
            ${summary.status} • ${summary.total} mentions (${summary.positive} pos, ${summary.negative} neg)
          </div>
          <ul class="cat-sub-aspects-list">
            ${subAspectsHtml}
          </ul>
        `;
        categoryCardsContainer.appendChild(catCard);
      }

      // Stagger animate category cards
      const catCards = categoryCardsContainer.querySelectorAll(".category-card");
      gsap.fromTo(catCards,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power3.out" }
      );

      // Animate summary card
      const summaryCard = matrixView.querySelector(".product-summary-card");
      if (summaryCard) {
        gsap.fromTo(summaryCard,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }
        );
      }
    } catch (err) {
      console.error("Failed to load product matrix:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. TAB 3: PRODUCT COMPARATOR
  // ═══════════════════════════════════════════════════════════════════════
  const compareProdA = document.getElementById("compare-prod-a");
  const compareProdB = document.getElementById("compare-prod-b");
  const btnRunCompare = document.getElementById("btn-run-compare");
  const comparisonResults = document.getElementById("comparison-results");
  const winnerTitle = document.getElementById("winner-title");
  const compareTableBody = document.getElementById("compare-table-body");
  const thProdA = document.getElementById("th-prod-a");
  const thProdB = document.getElementById("th-prod-b");

  function populateComparisonDropdowns(products) {
    if (!compareProdA || !compareProdB) return;

    compareProdA.innerHTML = "";
    compareProdB.innerHTML = "";

    products.forEach((p) => {
      const optA = document.createElement("option");
      optA.value = p.product;
      optA.textContent = p.product;

      const optB = document.createElement("option");
      optB.value = p.product;
      optB.textContent = p.product;

      if (p.product.includes("iPhone 15")) optA.selected = true;
      if (p.product.includes("Galaxy S24")) optB.selected = true;

      compareProdA.appendChild(optA);
      compareProdB.appendChild(optB);
    });

    if (btnRunCompare) {
      btnRunCompare.addEventListener("click", () => {
        runHeadToHeadComparison(compareProdA.value, compareProdB.value);
      });
    }
  }

  async function runHeadToHeadComparison(productA, productB) {
    if (!productA || !productB) return;

    try {
      btnRunCompare.disabled = true;
      btnRunCompare.innerHTML = `<span>⏳</span> Benchmarking...`;

      const loadingPulse = gsap.to(btnRunCompare, {
        boxShadow: "0 0 30px rgba(129,140,248,0.4)",
        repeat: -1,
        yoyo: true,
        duration: 0.6
      });

      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productA, productB })
      });

      const data = await res.json();
      loadingPulse.kill();
      btnRunCompare.disabled = false;
      btnRunCompare.innerHTML = `<span>⚔️</span> Run Benchmark`;
      gsap.set(btnRunCompare, { clearProps: "boxShadow" });

      if (!data.report) return;

      renderComparisonResults(data.report);
    } catch (err) {
      btnRunCompare.disabled = false;
      btnRunCompare.innerHTML = `<span>⚔️</span> Run Benchmark`;
      gsap.set(btnRunCompare, { clearProps: "boxShadow" });
      console.error("Comparison error:", err);
    }
  }

  function renderComparisonResults(report) {
    comparisonResults.classList.remove("hidden");
    winnerTitle.textContent = report.overallWinner;

    thProdA.textContent = `${report.productA} (NSS)`;
    thProdB.textContent = `${report.productB} (NSS)`;

    compareTableBody.innerHTML = "";

    const labels = [];
    const scoresA = [];
    const scoresB = [];

    report.metrics.forEach((m) => {
      labels.push(m.category);
      scoresA.push(m.productA.nss);
      scoresB.push(m.productB.nss);

      const aDisplay = m.productA.totalMentions > 0 ? `${m.productA.nss >= 0 ? "+" : ""}${m.productA.nss}% (${m.productA.totalMentions} rev)` : "N/A";
      const bDisplay = m.productB.totalMentions > 0 ? `${m.productB.nss >= 0 ? "+" : ""}${m.productB.nss}% (${m.productB.totalMentions} rev)` : "N/A";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(m.category)}</strong></td>
        <td>${aDisplay}</td>
        <td>${bDisplay}</td>
        <td><strong style="color: var(--cyan);">${escapeHtml(m.winner)}</strong></td>
        <td style="color: var(--text-3); font-size: 12px;">${escapeHtml(m.verdictNote)}</td>
      `;
      compareTableBody.appendChild(tr);
    });

    // ── Winner Banner Animation ──
    const winnerBanner = document.getElementById("winner-banner");
    const winnerTrophy = document.getElementById("winner-trophy");

    const winnerTL = gsap.timeline();
    winnerTL
      .fromTo(winnerBanner,
        { opacity: 0, y: 16, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" }
      )
      .fromTo(winnerTrophy,
        { opacity: 0, scale: 0.3, rotation: -20 },
        { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" },
        "-=0.3"
      );

    // ── Chart Animation ──
    const chartCard = comparisonResults.querySelectorAll(".card");
    gsap.fromTo(chartCard,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.55, stagger: 0.1, ease: "power3.out", delay: 0.3 }
    );

    // ── Table Rows Stagger ──
    const rows = compareTableBody.querySelectorAll("tr");
    gsap.fromTo(rows,
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, ease: "power2.out", delay: 0.5 }
    );

    // Chart.js Horizontal Bar
    const ctx = document.getElementById("compare-bar-chart");
    if (ctx) {
      if (compareChartInstance) compareChartInstance.destroy();

      compareChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: report.productA,
              data: scoresA,
              backgroundColor: "rgba(129, 140, 248, 0.75)",
              borderColor: "#818cf8",
              borderWidth: 1,
              borderRadius: 6
            },
            {
              label: report.productB,
              data: scoresB,
              backgroundColor: "rgba(34, 211, 238, 0.75)",
              borderColor: "#22d3ee",
              borderWidth: 1,
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          scales: {
            x: {
              min: -100,
              max: 100,
              grid: { color: "rgba(255, 255, 255, 0.03)" },
              ticks: { color: "#64748b", callback: (v) => `${v}%`, font: { size: 11 } }
            },
            y: {
              grid: { display: false },
              ticks: { color: "#f1f5f9", font: { weight: "600", size: 11 } }
            }
          },
          plugins: {
            legend: { labels: { color: "#94a3b8", font: { size: 12 } } }
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. TAB 4: DATASET & EDA ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════
  let edaLoaded = false;

  async function loadEDAAnalytics() {
    try {
      const res = await fetch("/api/eda");
      const data = await res.json();
      if (!data.eda) return;

      const eda = data.eda;

      // Animate KPI numbers counting up
      animateKPICounter("eda-total-reviews", eda.total_reviews);
      animateKPICounter("eda-unique-products", eda.unique_products);
      animateKPICounter("eda-unique-categories", eda.unique_categories);
      animateKPICounterPct("eda-multi-aspect-pct", eda.multi_aspect_pct);

      // Stagger KPI cards in (only first time)
      if (!edaLoaded) {
        const kpiCards = document.querySelectorAll("#kpi-grid .kpi-card");
        gsap.fromTo(kpiCards,
          { opacity: 0, y: 16, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08, ease: "power3.out" }
        );
        edaLoaded = true;
      }

      // Rating Chart
      const ratingCtx = document.getElementById("eda-rating-chart");
      if (ratingCtx && eda.rating_distribution) {
        if (ratingChartInstance) ratingChartInstance.destroy();

        const ratingLabels = Object.keys(eda.rating_distribution).map((k) => `${k} ★`);
        const ratingCounts = Object.values(eda.rating_distribution);

        ratingChartInstance = new Chart(ratingCtx, {
          type: "bar",
          data: {
            labels: ratingLabels,
            datasets: [
              {
                label: "Reviews",
                data: ratingCounts,
                backgroundColor: [
                  "rgba(251, 113, 133, 0.75)",
                  "rgba(249, 115, 22, 0.75)",
                  "rgba(245, 158, 11, 0.75)",
                  "rgba(52, 211, 153, 0.75)",
                  "rgba(129, 140, 248, 0.75)"
                ],
                borderRadius: 6,
                borderWidth: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                grid: { color: "rgba(255,255,255,0.03)" },
                ticks: { color: "#64748b", font: { size: 11 } }
              },
              x: {
                grid: { display: false },
                ticks: { color: "#f1f5f9", font: { size: 12 } }
              }
            },
            plugins: { legend: { display: false } }
          }
        });
      }

      // Category Chart
      const catCtx = document.getElementById("eda-category-chart");
      if (catCtx && eda.categories_breakdown) {
        if (categoryChartInstance) categoryChartInstance.destroy();

        const catLabels = Object.keys(eda.categories_breakdown);
        const catCounts = Object.values(eda.categories_breakdown);

        categoryChartInstance = new Chart(catCtx, {
          type: "doughnut",
          data: {
            labels: catLabels,
            datasets: [
              {
                data: catCounts,
                backgroundColor: [
                  "#818cf8", "#22d3ee", "#34d399", "#fbbf24",
                  "#f472b6", "#a78bfa", "#2dd4bf", "#fb7185"
                ],
                borderWidth: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: {
              legend: {
                position: "right",
                labels: {
                  color: "#94a3b8",
                  font: { size: 11 },
                  padding: 12,
                  usePointStyle: true,
                  pointStyleWidth: 8
                }
              }
            }
          }
        });
      }
    } catch (err) {
      console.error("Failed to load EDA analytics:", err);
    }
  }

  // ── KPI Counter Animation ──
  function animateKPICounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const obj = { val: 0 };
    gsap.to(obj, {
      val: targetValue,
      duration: 1.2,
      ease: "power2.out",
      snap: { val: 1 },
      onUpdate: () => {
        el.textContent = Math.round(obj.val).toLocaleString();
      }
    });
  }

  function animateKPICounterPct(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const obj = { val: 0 };
    gsap.to(obj, {
      val: targetValue,
      duration: 1.2,
      ease: "power2.out",
      snap: { val: 1 },
      onUpdate: () => {
        el.textContent = `${Math.round(obj.val)}%`;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7. CARD HOVER MICRO-INTERACTIONS
  // ═══════════════════════════════════════════════════════════════════════
  document.addEventListener("mouseenter", (e) => {
    const card = e.target.closest && e.target.closest(".aspect-card, .category-card, .kpi-card");
    if (card) {
      gsap.to(card, {
        scale: 1.015,
        boxShadow: "0 8px 32px rgba(129,140,248,0.10)",
        duration: 0.3,
        ease: "power2.out"
      });
    }
  }, true);

  document.addEventListener("mouseleave", (e) => {
    const card = e.target.closest && e.target.closest(".aspect-card, .category-card, .kpi-card");
    if (card) {
      gsap.to(card, {
        scale: 1,
        boxShadow: "none",
        duration: 0.3,
        ease: "power2.out"
      });
    }
  }, true);

  // ═══════════════════════════════════════════════════════════════════════
  // 8. WINDOW RESIZE — Recalculate nav indicator
  // ═══════════════════════════════════════════════════════════════════════
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => positionNavIndicator(false), 100);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 9. TAB 3.5: LIVE URL COMPARATOR ENGINE
  // ═══════════════════════════════════════════════════════════════════════
  function initLiveUrlCompareModule() {
    const urlA = document.getElementById("url-compare-a");
    const urlB = document.getElementById("url-compare-b");
    const fallbackA = document.getElementById("fallback-reviews-a");
    const fallbackB = document.getElementById("fallback-reviews-b");
    const fallbackDetailsA = document.getElementById("fallback-details-a");
    const fallbackDetailsB = document.getElementById("fallback-details-b");
    const btnRun = document.getElementById("btn-run-url-compare");
    const btnClear = document.getElementById("btn-clear-url-compare");

    const badgeA = document.getElementById("url-badge-a");
    const badgeB = document.getElementById("url-badge-b");

    const progressCard = document.getElementById("url-compare-progress-card");
    const progressTitle = document.getElementById("url-progress-stage-title");
    const progressPct = document.getElementById("url-progress-pct");
    const progressBarFill = document.getElementById("url-progress-bar-fill");
    const progressSubtext = document.getElementById("url-progress-subtext");
    const stepperSteps = document.querySelectorAll("#tab-url-compare .stepper-step");
    const stepperLines = document.querySelectorAll("#tab-url-compare .stepper-line");

    const errorCard = document.getElementById("url-compare-error-card");
    const errorTitle = document.getElementById("url-error-title");
    const errorMessage = document.getElementById("url-error-message");
    const btnOpenFallbackA = document.getElementById("btn-open-fallback-a");
    const btnOpenFallbackB = document.getElementById("btn-open-fallback-b");

    const resultsView = document.getElementById("url-comparison-results");
    const winnerBanner = document.getElementById("url-winner-banner");
    const winnerTrophy = document.getElementById("url-winner-trophy");
    const winnerTitle = document.getElementById("url-winner-title");
    const verdictSummary = document.getElementById("url-verdict-summary");

    const tableBody = document.getElementById("url-compare-table-body");
    const rawJson = document.getElementById("url-compare-raw-json");

    let pollingTimer = null;
    let currentJobId = null;

    // Platform detection pill helper
    function updateBadge(inputEl, badgeEl) {
      if (!inputEl || !badgeEl) return;
      const val = inputEl.value.trim();
      if (/amazon\.(in|com|co\.uk)/i.test(val)) {
        badgeEl.textContent = "Amazon";
        badgeEl.className = "url-platform-badge amazon";
      } else if (/flipkart\.com/i.test(val)) {
        badgeEl.textContent = "Flipkart";
        badgeEl.className = "url-platform-badge flipkart";
      } else if (val.length > 0) {
        badgeEl.textContent = "Unsupported (Only Amazon/Flipkart)";
        badgeEl.className = "url-platform-badge";
      } else {
        badgeEl.textContent = "";
        badgeEl.className = "url-platform-badge";
      }
    }

    if (urlA) urlA.addEventListener("input", () => updateBadge(urlA, badgeA));
    if (urlB) urlB.addEventListener("input", () => updateBadge(urlB, badgeB));

    // Fallback error button expanders
    if (btnOpenFallbackA && fallbackDetailsA) {
      btnOpenFallbackA.addEventListener("click", () => {
        fallbackDetailsA.open = true;
        fallbackA?.focus();
      });
    }
    if (btnOpenFallbackB && fallbackDetailsB) {
      btnOpenFallbackB.addEventListener("click", () => {
        fallbackDetailsB.open = true;
        fallbackB?.focus();
      });
    }

    // Presets Handlers
    const demoPhones = document.getElementById("demo-preset-phones");
    if (demoPhones) {
      demoPhones.addEventListener("click", () => {
        if (urlA) urlA.value = "https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY";
        if (urlB) urlB.value = "https://www.flipkart.com/samsung-galaxy-s24-ultra-5g-titanium-gray-256-gb/p/itm123456";
        updateBadge(urlA, badgeA);
        updateBadge(urlB, badgeB);

        if (fallbackA) {
          fallbackA.value = [
            "The battery life is phenomenal lasting easily 16 hours of screen time.",
            "Camera performance in daylight is crystal clear with vibrant colors and rich detail.",
            "Display brightness is sharp and buttery smooth even in direct sunlight.",
            "Titanium design is lightweight and comfortable to hold with great ergonomics.",
            "Stereo speaker audio quality has deep bass and clear vocal transparency.",
            "Price is noticeably steep for 128GB base storage with no charger in the box.",
            "Charging speed is slightly slow compared to other modern flagship smartphones."
          ].join("\n");
        }
        if (fallbackB) {
          fallbackB.value = [
            "The screen display and anti-reflective glass has silky smooth refresh rate and stunning sharpness.",
            "Battery backup easily lasts over 24 hours of heavy usage and gaming.",
            "Camera zoom up to 100x produces astonishingly clear daylight photos and portraits.",
            "S-Pen stylus and build quality feel exceptionally sturdy and premium.",
            "Software updates and Galaxy AI features work seamlessly without any stutter or lag.",
            "Device weight feels noticeably heavy and bulky in one-handed pocket use.",
            "Internal speakers audio volume is loud and rich during gaming and movies."
          ].join("\n");
        }
        if (fallbackDetailsA) fallbackDetailsA.open = true;
        if (fallbackDetailsB) fallbackDetailsB.open = true;
      });
    }

    const demoAudio = document.getElementById("demo-preset-audio");
    if (demoAudio) {
      demoAudio.addEventListener("click", () => {
        if (urlA) urlA.value = "https://www.amazon.in/Sony-WH-1000XM5-Wireless-Cancelling-Headphones/dp/B09XS7JWHH";
        if (urlB) urlB.value = "https://www.flipkart.com/bose-quietcomfort-45-bluetooth-headset/p/itm87654321";
        updateBadge(urlA, badgeA);
        updateBadge(urlB, badgeB);
      });
    }

    // Clear Button
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        if (urlA) urlA.value = "";
        if (urlB) urlB.value = "";
        if (fallbackA) fallbackA.value = "";
        if (fallbackB) fallbackB.value = "";
        if (badgeA) { badgeA.textContent = ""; badgeA.className = "url-platform-badge"; }
        if (badgeB) { badgeB.textContent = ""; badgeB.className = "url-platform-badge"; }
        if (fallbackDetailsA) fallbackDetailsA.open = false;
        if (fallbackDetailsB) fallbackDetailsB.open = false;
        if (progressCard) progressCard.classList.add("hidden");
        if (errorCard) errorCard.classList.add("hidden");
        if (resultsView) resultsView.classList.add("hidden");
        if (pollingTimer) clearInterval(pollingTimer);
      });
    }

    // Stepper update helper
    const stagesOrder = ["Validating", "Scraping A", "Scraping B", "Analyzing", "Comparing"];

    function updateStepperUI(currentStage) {
      const activeIdx = stagesOrder.indexOf(currentStage);

      stepperSteps.forEach((stepEl, idx) => {
        const stepName = stepEl.getAttribute("data-step");
        stepEl.classList.remove("active", "completed");

        if (idx < activeIdx || currentStage === "Complete") {
          stepEl.classList.add("completed");
        } else if (idx === activeIdx) {
          stepEl.classList.add("active");
        }
      });

      stepperLines.forEach((lineEl, idx) => {
        lineEl.classList.remove("completed");
        if (idx < activeIdx || currentStage === "Complete") {
          lineEl.classList.add("completed");
        }
      });
    }

    // Run Comparison Click Handler
    if (btnRun) {
      btnRun.addEventListener("click", async () => {
        const inputUrlA = urlA?.value.trim() || "";
        const inputUrlB = urlB?.value.trim() || "";
        const manualA = fallbackA?.value.trim() || "";
        const manualB = fallbackB?.value.trim() || "";

        if (!inputUrlA && !manualA) {
          alert("Please enter a URL or paste manual reviews for Product A.");
          urlA?.focus();
          return;
        }
        if (!inputUrlB && !manualB) {
          alert("Please enter a URL or paste manual reviews for Product B.");
          urlB?.focus();
          return;
        }

        // Reset UI states
        if (errorCard) errorCard.classList.add("hidden");
        if (resultsView) resultsView.classList.add("hidden");
        if (progressCard) {
          progressCard.classList.remove("hidden");
          gsap.fromTo(progressCard, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4 });
        }

        btnRun.disabled = true;
        btnRun.innerHTML = `<span>⏳</span> Scraping & Comparing...`;

        // Reset progress displays
        if (progressTitle) progressTitle.textContent = "Validating Inputs & URLs...";
        if (progressPct) progressPct.textContent = "10%";
        if (progressBarFill) progressBarFill.style.width = "10%";
        if (progressSubtext) progressSubtext.textContent = "Verifying safety protocols and preparing Playwright scraper...";
        updateStepperUI("Validating");

        try {
          const res = await fetch("/api/compare-urls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              urlA: inputUrlA,
              urlB: inputUrlB,
              reviewsA: manualA,
              reviewsB: manualB
            })
          });

          const data = await res.json();

          if (!res.ok || data.error) {
            handleJobError(data.error || "Failed to start comparison job.", data.failedProduct);
            return;
          }

          currentJobId = data.jobId;
          console.log(`[LIVE COMPARE] Job started: ${currentJobId}. Polling every 2s...`);

          // Start polling every 2s
          if (pollingTimer) clearInterval(pollingTimer);
          pollingTimer = setInterval(() => pollJobStatus(currentJobId), 2000);
        } catch (err) {
          handleJobError(err.message || "Network error communicating with server.");
        }
      });
    }

    // Polling function
    async function pollJobStatus(jobId) {
      try {
        const res = await fetch(`/api/compare-urls/${jobId}`);
        const data = await res.json();

        if (res.status === 502 || data.status === "error") {
          clearInterval(pollingTimer);
          handleJobError(data.error || "Scraping failed.", data.failedProduct);
          return;
        }

        if (data.status === "running") {
          const stage = data.progress || "Processing";
          const pct = data.percent || 20;

          if (progressTitle) progressTitle.textContent = `${stage}...`;
          if (progressPct) progressPct.textContent = `${pct}%`;
          if (progressBarFill) progressBarFill.style.width = `${pct}%`;

          let subtext = "Processing request...";
          if (stage === "Scraping A") subtext = "Scraping reviews for Product A with Playwright (up to 5 pages)...";
          else if (stage === "Scraping B") subtext = "Scraping reviews for Product B with Playwright (up to 5 pages)...";
          else if (stage === "Analyzing") subtext = "Running ABSA NLP pipeline (syntactic parsing, VADER, aspect clustering)...";
          else if (stage === "Comparing") subtext = "Computing Net Sentiment Scores and matching aspects head-to-head...";

          if (progressSubtext) progressSubtext.textContent = subtext;
          updateStepperUI(stage);
        } else if (data.status === "done" && data.result) {
          clearInterval(pollingTimer);
          updateStepperUI("Complete");
          if (progressBarFill) progressBarFill.style.width = "100%";
          if (progressPct) progressPct.textContent = "100%";

          setTimeout(() => {
            if (progressCard) progressCard.classList.add("hidden");
            btnRun.disabled = false;
            btnRun.innerHTML = `<span>⚔️</span> Compare Live Products`;
            renderUrlComparisonResults(data.result);
            loadProductsDropdown(); // Sync newly scraped products to Matrix and Comparator!
          }, 600);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }

    function handleJobError(errorMsg, failedProduct) {
      if (pollingTimer) clearInterval(pollingTimer);
      if (progressCard) progressCard.classList.add("hidden");

      if (btnRun) {
        btnRun.disabled = false;
        btnRun.innerHTML = `<span>⚔️</span> Compare Live Products`;
      }

      if (errorCard) {
        errorCard.classList.remove("hidden");
        if (errorMessage) errorMessage.textContent = errorMsg;
        gsap.fromTo(errorCard, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4 });
      }

      if (failedProduct === "A" || failedProduct === "both") {
        if (fallbackDetailsA) fallbackDetailsA.open = true;
      }
      if (failedProduct === "B" || failedProduct === "both") {
        if (fallbackDetailsB) fallbackDetailsB.open = true;
      }
    }

    // Render Final Results
    function renderUrlComparisonResults(report) {
      if (!resultsView) return;
      resultsView.classList.remove("hidden");

      const prodA = report.productA;
      const prodB = report.productB;

      // 1. Winner Banner
      if (winnerTitle) winnerTitle.textContent = report.overallWinner;
      if (verdictSummary) verdictSummary.textContent = report.verdictSummary;

      // 2. Product Meta Cards
      const metaTitleA = document.getElementById("url-meta-title-a");
      const metaTitleB = document.getElementById("url-meta-title-b");
      const metaPlatformA = document.getElementById("url-meta-platform-a");
      const metaPlatformB = document.getElementById("url-meta-platform-b");
      const metaRevsA = document.getElementById("url-meta-revs-a");
      const metaRevsB = document.getElementById("url-meta-revs-b");
      const metaAspectsA = document.getElementById("url-meta-aspects-a");
      const metaAspectsB = document.getElementById("url-meta-aspects-b");
      const metaRatingA = document.getElementById("url-meta-rating-a");
      const metaRatingB = document.getElementById("url-meta-rating-b");

      if (metaTitleA) metaTitleA.textContent = prodA.productName;
      if (metaTitleB) metaTitleB.textContent = prodB.productName;
      if (metaPlatformA) metaPlatformA.textContent = prodA.platform;
      if (metaPlatformB) metaPlatformB.textContent = prodB.platform;
      if (metaRevsA) metaRevsA.textContent = prodA.reviewCount;
      if (metaRevsB) metaRevsB.textContent = prodB.reviewCount;
      if (metaAspectsA) metaAspectsA.textContent = prodA.aspects.length;
      if (metaAspectsB) metaAspectsB.textContent = prodB.aspects.length;
      if (metaRatingA) metaRatingA.textContent = prodA.averageRating ? `${prodA.averageRating}★` : "—";
      if (metaRatingB) metaRatingB.textContent = prodB.averageRating ? `${prodB.averageRating}★` : "—";

      // Jump-to-Matrix Buttons
      const btnViewMatrixA = document.getElementById("btn-view-matrix-a");
      const btnViewMatrixB = document.getElementById("btn-view-matrix-b");

      if (btnViewMatrixA) {
        btnViewMatrixA.onclick = () => {
          switchToMatrixTabWithProduct(prodA.productName);
        };
      }
      if (btnViewMatrixB) {
        btnViewMatrixB.onclick = () => {
          switchToMatrixTabWithProduct(prodB.productName);
        };
      }

      // 3. Side-by-side Chart.js Bar Chart
      const catLabels = [];
      const catScoresA = [];
      const catScoresB = [];

      report.categoryMetrics.forEach((m) => {
        catLabels.push(m.category);
        catScoresA.push(m.productA.nss);
        catScoresB.push(m.productB.nss);
      });

      const chartCanvas = document.getElementById("url-compare-bar-chart");
      if (chartCanvas) {
        if (urlCompareChartInstance) urlCompareChartInstance.destroy();

        urlCompareChartInstance = new Chart(chartCanvas, {
          type: "bar",
          data: {
            labels: catLabels,
            datasets: [
              {
                label: prodA.productName,
                data: catScoresA,
                backgroundColor: "rgba(129, 140, 248, 0.78)",
                borderColor: "#818cf8",
                borderWidth: 1.5,
                borderRadius: 6
              },
              {
                label: prodB.productName,
                data: catScoresB,
                backgroundColor: "rgba(34, 211, 238, 0.78)",
                borderColor: "#22d3ee",
                borderWidth: 1.5,
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            scales: {
              x: {
                min: -100,
                max: 100,
                grid: { color: "rgba(255, 255, 255, 0.04)" },
                ticks: { color: "#64748b", callback: (v) => `${v}%`, font: { size: 11 } }
              },
              y: {
                grid: { display: false },
                ticks: { color: "#f1f5f9", font: { weight: "600", size: 11 } }
              }
            },
            plugins: {
              legend: { labels: { color: "#94a3b8", font: { size: 12 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${ctx.raw >= 0 ? "+" : ""}${ctx.raw}% NSS`
                }
              }
            }
          }
        });
      }

      // 4. Head-to-Head Aspect Table
      if (tableBody) {
        tableBody.innerHTML = "";

        const thA = document.getElementById("url-th-prod-a");
        const thB = document.getElementById("url-th-prod-b");
        if (thA) thA.textContent = `${prodA.productName} (NSS / Mentions)`;
        if (thB) thB.textContent = `${prodB.productName} (NSS / Mentions)`;

        report.aspectMetrics.forEach((m) => {
          const aNss = m.productA.mentionCount > 0 ? `${m.productA.nss >= 0 ? "+" : ""}${m.productA.nss}% (${m.productA.mentionCount} mentions)` : "—";
          const bNss = m.productB.mentionCount > 0 ? `${m.productB.nss >= 0 ? "+" : ""}${m.productB.nss}% (${m.productB.mentionCount} mentions)` : "—";

          let winnerBadge = "";
          let rowClass = "";

          if (m.winner === "A") {
            winnerBadge = `<span class="badge-winner-a">🏆 ${escapeHtml(prodA.productName)}</span>`;
          } else if (m.winner === "B") {
            winnerBadge = `<span class="badge-winner-b">🏆 ${escapeHtml(prodB.productName)}</span>`;
          } else if (m.winner === "tie") {
            winnerBadge = `<span class="badge-winner-tie">⚖️ Tie (±5%)</span>`;
          } else {
            winnerBadge = `<span class="badge-insufficient">⚠️ Not enough data</span>`;
            rowClass = "row-insufficient";
          }

          const tr = document.createElement("tr");
          if (rowClass) tr.className = rowClass;

          tr.innerHTML = `
            <td><span class="badge badge-category" style="font-size: 11px;">${escapeHtml(m.category)}</span></td>
            <td><strong style="color: #fff;">${escapeHtml(m.aspect)}</strong></td>
            <td>${aNss}</td>
            <td>${bNss}</td>
            <td>${winnerBadge}</td>
            <td style="color: var(--text-3); font-size: 12px;">${escapeHtml(m.reason)}</td>
          `;

          tableBody.appendChild(tr);
        });
      }

      // Raw JSON Viewer
      if (rawJson) {
        rawJson.textContent = JSON.stringify(report, null, 2);
      }

      // GSAP Animations
      gsap.fromTo(winnerBanner,
        { opacity: 0, y: 20, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" }
      );
      gsap.fromTo(winnerTrophy,
        { opacity: 0, scale: 0.2, rotation: -25 },
        { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" }
      );
      gsap.fromTo(resultsView.querySelectorAll(".card"),
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" }
      );
    }

    // Helper: switch to Matrix Tab and select product
    function switchToMatrixTabWithProduct(productName) {
      const tabBtn = document.getElementById("tab-btn-matrix");
      if (tabBtn) tabBtn.click();

      setTimeout(() => {
        const prodSelect = document.getElementById("product-select");
        if (prodSelect) {
          for (let i = 0; i < prodSelect.options.length; i++) {
            if (prodSelect.options[i].value.toLowerCase().includes(productName.toLowerCase())) {
              prodSelect.selectedIndex = i;
              prodSelect.dispatchEvent(new Event("change"));
              break;
            }
          }
        }
      }, 300);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 10. PRODUCT MATRIX LIVE URL SCRAPER DRAWER
  // ═══════════════════════════════════════════════════════════════════════
  function initMatrixScraperModule() {
    const matrixUrlInput = document.getElementById("matrix-url-input");
    const btnMatrixScrape = document.getElementById("btn-matrix-scrape");
    const feedback = document.getElementById("matrix-scrape-feedback");
    const productSelect = document.getElementById("product-select");

    if (!btnMatrixScrape || !matrixUrlInput) return;

    btnMatrixScrape.addEventListener("click", async () => {
      const url = matrixUrlInput.value.trim();
      if (!url) {
        if (feedback) feedback.textContent = "Please enter an Amazon or Flipkart product URL.";
        return;
      }

      btnMatrixScrape.disabled = true;
      btnMatrixScrape.innerHTML = `<span>⏳</span> Scraping...`;
      if (feedback) feedback.textContent = "Scraping product reviews live with Playwright... (5-10s)";

      try {
        const res = await fetch("/api/scrape-reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });

        const data = await res.json();
        btnMatrixScrape.disabled = false;
        btnMatrixScrape.innerHTML = `<span>📥</span> Scrape & Add to Matrix`;

        if (!res.ok || data.error) {
          if (feedback) feedback.textContent = `❌ ${data.error || "Scraping failed."}`;
          return;
        }

        const prodName = data.product?.productName || "Scraped Product";
        if (feedback) feedback.textContent = `✅ Successfully added "${prodName}" to Matrix!`;

        // Refresh dropdowns and auto-select
        await loadProductsDropdown();

        if (productSelect) {
          for (let i = 0; i < productSelect.options.length; i++) {
            if (productSelect.options[i].value.includes(prodName)) {
              productSelect.selectedIndex = i;
              productSelect.dispatchEvent(new Event("change"));
              break;
            }
          }
        }
      } catch (err) {
        btnMatrixScrape.disabled = false;
        btnMatrixScrape.innerHTML = `<span>📥</span> Scrape & Add to Matrix`;
        if (feedback) feedback.textContent = `❌ Error: ${err.message}`;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════
  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BOOT SEQUENCE
  // ═══════════════════════════════════════════════════════════════════════
  playSplashSequence();
  loadProductsDropdown();
  initLiveUrlCompareModule();
  initMatrixScraperModule();
});


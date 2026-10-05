// Run against a production preview. Install Playwright or set PLAYWRIGHT_MODULE.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const url = process.argv[2] || "http://localhost:4173/#/zh/demo";
const output = process.argv[3] || "/tmp/plantbox-loading.json";
const runs = Number(process.env.PERF_RUNS || 3);

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const reports = [];
  try {
    for (const profile of ["local", "6mbps-80ms"]) {
      for (let run = 0; run < runs; run++) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        if (profile !== "local")
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: 80,
            downloadThroughput: 750000,
            uploadThroughput: 250000,
          });
        await page.addInitScript(() => {
          const p = (window.loadingProfile = {
            ui: null,
            firstDraw: null,
            cargoFrame: null,
            labels: [],
            longTasks: [],
          });
          new MutationObserver(() => {
            if (!p.ui && document.querySelector(".topbar"))
              p.ui = performance.now();
          }).observe(document, { childList: true, subtree: true });
          new PerformanceObserver((list) => {
            p.longTasks.push(
              ...list
                .getEntries()
                .map((e) => ({ start: e.startTime, duration: e.duration })),
            );
          }).observe({ type: "longtask", buffered: true });
          const text = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function (...args) {
            if (/^P[123]-\d+-\d+$/.test(args[0]) && !p.labels.includes(args[0]))
              p.labels.push(args[0]);
            return text.apply(this, args);
          };
          for (const name of [
            "WebGLRenderingContext",
            "WebGL2RenderingContext",
          ]) {
            for (const method of [
              "drawElements",
              "drawArrays",
              "drawElementsInstanced",
              "drawArraysInstanced",
            ]) {
              const proto = window[name]?.prototype,
                draw = proto?.[method];
              if (!draw) continue;
              proto[method] = function (...args) {
                p.firstDraw ??= performance.now();
                if (p.labels.length >= 42) p.cargoFrame ??= performance.now();
                return draw.apply(this, args);
              };
            }
          }
        });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => window.loadingProfile.cargoFrame !== null,
          null,
          { timeout: 60000 },
        );
        await page.waitForTimeout(2200);
        const report = await page.evaluate(() => {
          const resources = performance
            .getEntriesByType("resource")
            .map((r) => ({
              url: r.name.replace(location.origin, ""),
              start: r.startTime,
              end: r.responseEnd,
              bytes: r.encodedBodySize,
              decoded: r.decodedBodySize,
            }));
          return {
            ...window.loadingProfile,
            resources,
            totalBytes: resources.reduce((n, r) => n + r.bytes, 0),
            fontBytes: resources
              .filter((r) => r.url.includes("/fonts/"))
              .reduce((n, r) => n + r.bytes, 0),
            marks: performance
              .getEntriesByType("mark")
              .map((m) => ({ name: m.name, time: m.startTime })),
          };
        });
        reports.push({ profile, run, ...report, errors });
        console.log(
          JSON.stringify({
            profile,
            run,
            ui: Math.round(report.ui),
            firstDraw: Math.round(report.firstDraw),
            cargoFrame: Math.round(report.cargoFrame),
            totalBytes: report.totalBytes,
            fontBytes: report.fontBytes,
            errors,
          }),
        );
        await context.close();
      }
    }
  } finally {
    fs.writeFileSync(output, JSON.stringify({ url, reports }, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

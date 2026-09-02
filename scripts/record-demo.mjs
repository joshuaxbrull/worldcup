import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const require = createRequire("/tmp/package.json");
const { chromium } = require("playwright");
const { renameSync } = require("node:fs");

const base = process.env.DEMO_URL || "http://127.0.0.1:8765/";
const outDir = "/mnt/c/Users/nix/worldcup/demo";
await mkdir(outDir, { recursive: true });

async function recordCut(cut) {
  const phone = cut === "phone";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: phone
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: outDir,
      size: phone
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 },
    },
    geolocation: { latitude: 39.473, longitude: -76.31 },
    permissions: ["geolocation"],
  });
  await context.addInitScript((theme) => {
    localStorage.setItem("hd-eyewear-theme", theme);
    window.open = () => null;
  }, phone ? "light" : "dark");

  const page = await context.newPage();
  await page.goto(`${base}demo/spot.html?cut=${cut}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.done === "1", { timeout: 45000 });
  await page.waitForTimeout(400);

  const video = page.video();
  await page.close();
  const src = await video.path();
  await context.close();
  await browser.close();
  return src;
}

const phone = await recordCut("phone");
const app = await recordCut("app");
renameSync(phone, join(outDir, "ad-phone.webm"));
renameSync(app, join(outDir, "ad-app.webm"));
console.log("phone", join(outDir, "ad-phone.webm"));
console.log("app", join(outDir, "ad-app.webm"));

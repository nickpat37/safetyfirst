#!/usr/bin/env node
/**
 * Quick health check for News API and Anthropic API.
 * Reads keys from .env. Run from project root: node scripts/check-apis.js
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");

function loadEnv() {
  try {
    const raw = readFileSync(envPath, "utf8");
    return Object.fromEntries(
      raw
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const idx = l.indexOf("=");
          const k = l.slice(0, idx).trim();
          const v = (l.slice(idx + 1) || "").trim();
          return [k, v];
        })
    );
  } catch (_) {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const GDELT_KEY = env.VITE_GDELT_API_KEY ?? env.GDELT_API_KEY ?? "";
const NEWS_KEY = env.VITE_NEWS_API_KEY ?? "";
const ANTHROPIC_KEY = env.VITE_ANTHROPIC_API_KEY ?? "";

async function testGdeltCloud() {
  if (!GDELT_KEY) return { ok: false, msg: "No VITE_GDELT_API_KEY in .env" };
  try {
    const res = await fetch(
      "https://gdeltcloud.com/api/v1/media-events?days=1&limit=3&category=conflict_security",
      { headers: { Authorization: `Bearer ${GDELT_KEY}` } }
    );
    const data = await res.json();
    if (res.ok && data.success !== false) {
      const n = data.articles?.length ?? 0;
      return { ok: true, msg: `GDELT Cloud OK (${n} articles)` };
    }
    return { ok: false, msg: data.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function testNewsAPI() {
  if (!NEWS_KEY) return { ok: false, msg: "No VITE_NEWS_API_KEY in .env" };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const q = encodeURIComponent('Iran OR "Middle East"');
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=2&from=${today}&to=${today}&apiKey=${NEWS_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "ok")
      return { ok: true, msg: `News API OK (${data.articles?.length ?? 0} articles)` };
    return { ok: false, msg: data.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function testAnthropic() {
  if (!ANTHROPIC_KEY) return { ok: false, msg: "No VITE_ANTHROPIC_API_KEY in .env" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": ANTHROPIC_KEY,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 50,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      }),
    });
    const data = await res.json();
    if (res.ok && data.content) return { ok: true, msg: "Anthropic API OK" };
    return { ok: false, msg: data.error?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function main() {
  console.log("Checking APIs...\n");
  const [gdelt, news, anthropic] = await Promise.all([
    testGdeltCloud(),
    testNewsAPI(),
    testAnthropic(),
  ]);
  console.log("GDELT Cloud:  ", gdelt.ok ? "✓" : "✗", gdelt.msg);
  console.log("News API:     ", news.ok ? "✓" : "✗", news.msg);
  console.log("Anthropic API:", anthropic.ok ? "✓" : "✗", anthropic.msg);
  process.exit(gdelt.ok && news.ok && anthropic.ok ? 0 : 1);
}

main();

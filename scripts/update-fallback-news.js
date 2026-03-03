#!/usr/bin/env node
/**
 * Fetches real Middle East news from GDELT (no API key) and writes to public/fallback-news.json.
 * Run periodically to keep fallback content fresh when NewsAPI/GDELT fail at runtime.
 * Usage: node scripts/update-fallback-news.js
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "public", "fallback-news.json");

const QUERY = encodeURIComponent(
  "Middle East Gulf UAE Dubai Iraq Kuwait Saudi Iran Yemen Syria Israel Gaza diplomacy sanction political military missile strike"
);
const URL = "https://api.gdeltproject.org/api/v2/doc/doc?query=" + QUERY + "&mode=artlist&maxrecords=15&format=json&timespan=3day&sourcelang=eng";

function formatTimeAgo(dateStr) {
  if (!dateStr) return "Recent";
  let d;
  if (typeof dateStr === "string" && dateStr.length === 14) {
    d = new Date(dateStr.slice(0,4) + "-" + dateStr.slice(4,6) + "-" + dateStr.slice(6,8) + "T" + dateStr.slice(8,10) + ":" + dateStr.slice(10,12) + ":" + dateStr.slice(12,14) + "Z");
  } else {
    d = new Date(dateStr);
  }
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 1440) return Math.floor(mins / 60) + "h ago";
  return Math.floor(mins / 1440) + "d ago";
}

function classifySeverity(text) {
  const t = (text || "").toLowerCase();
  if (/missile|explosion|strike|attack|ballistic|blast|killed|casualt/.test(t)) return "high";
  if (/alert|warning|evacuat|emergency|threat|military|armed|conflict/.test(t)) return "medium";
  return "low";
}

function extractRegion(text) {
  const map = [["Israel","Israel"],["Gaza","Gaza"],["Iran","Iran"],["Iraq","Iraq"],["UAE","UAE"],["Dubai","Dubai"],["Saudi","Saudi Arabia"],["Kuwait","Kuwait"],["Yemen","Yemen"],["Syria","Syria"],["Lebanon","Lebanon"]];
  for (const pair of map) {
    if ((text || "").includes(pair[0])) return pair[1];
  }
  return "Middle East";
}

async function main() {
  try {
    const res = await fetch(URL);
    const data = await res.json();
    const raw = data.articles || [];
    const articles = raw
      .filter(function(a) { return a.title && a.title !== "[Removed]"; })
      .slice(0, 12)
      .map(function(a, i) {
        return {
          id: i,
          source: (a.domain || "GDELT").replace(/^www\./, ""),
          time: formatTimeAgo(a.seendate),
          publishedAt: a.seendate || new Date().toISOString(),
          title: a.title,
          summary: a.socialimage ? "" : (a.title + " ").slice(0, 120),
          url: a.url || "#",
          severity: classifySeverity(a.title),
          region: extractRegion(a.title),
        };
      });

    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(outPath, JSON.stringify(articles, null, 2), "utf8");
    console.log("Wrote", articles.length, "fallback articles to public/fallback-news.json");
  } catch (e) {
    console.error("Failed to fetch fallback news:", e.message);
    process.exit(1);
  }
}

main();

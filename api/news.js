/**
 * Vercel serverless proxy for NewsAPI.
 * NewsAPI blocks browser requests on the free tier; this server-side proxy bypasses that.
 * Set VITE_NEWS_API_KEY (or NEWS_API_KEY) in Vercel Environment Variables.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key = process.env.VITE_NEWS_API_KEY || process.env.NEWS_API_KEY;
  if (!key) {
    return res.status(500).json({ status: "error", message: "No NewsAPI key configured" });
  }

  const { q, from, to, pageSize = 25 } = req.query;
  if (!q) {
    return res.status(400).json({ status: "error", message: "Missing query param q" });
  }

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=${pageSize}&from=${from || ""}&to=${to || ""}&apiKey=${key}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ status: "error", message: e.message });
  }
}

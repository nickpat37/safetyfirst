/**
 * Vercel serverless proxy for GDELT Cloud API.
 * Fetches live news from GDELT Cloud (conflict/security clusters).
 * Set VITE_GDELT_API_KEY or GDELT_API_KEY in Vercel Environment Variables.
 * Get key: https://gdeltcloud.com/auth/sign-up — requires Analyst or Professional plan.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key = process.env.VITE_GDELT_API_KEY || process.env.GDELT_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "No GDELT API key configured" });
  }

  const { days = 1, limit = 15, category = "conflict_security" } = req.query;
  const url = `https://gdeltcloud.com/api/v1/media-events?days=${days}&limit=${limit}&category=${category}`;

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json(data);
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

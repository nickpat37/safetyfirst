# SafeDXB — Production Setup

## API Keys Required

| Key | Required | Purpose | Where to Get |
|-----|----------|---------|--------------|
| **VITE_NEWS_API_KEY** | Yes (for news) | Fetches Latest News articles | [newsapi.org/register](https://newsapi.org/register) — Free: 100 req/day |
| **VITE_ANTHROPIC_API_KEY** | Yes (for AI summaries) | Generates bullet-point briefings | [console.anthropic.com](https://console.anthropic.com) — Paid, usage-based |

**No key needed:** GDELT (strike map), ipapi.co (location), OpenStreetMap (geocoding).

---

## Setup

### 1. Create `.env`

```bash
cp .env.example .env
```

### 2. Add your keys to `.env`

```env
VITE_NEWS_API_KEY=your_newsapi_key_here
VITE_ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
```

### 3. Deploy

For **Vercel / Netlify / similar:**

- Add the env vars in the project dashboard (Settings → Environment Variables).
- Keys must be prefixed with `VITE_` to be exposed to the client.

```bash
npm run build
```

Output: `dist/` — deploy as static site.

---

## Important

- **Never commit `.env`** — it's in `.gitignore`.
- **NewsAPI**: Free tier = 100 requests/day. App polls every 5 min → ~288/day if always open. Consider developer tier (~$449/mo) for production.
- **Anthropic**: Billed per token. Briefing uses ~2–4k input + ~500 output tokens per refresh.
- **Client-side keys**: Vite embeds `VITE_*` vars in the build. Anyone can inspect them. For higher security, run a backend proxy.

---

## Fallback News

When NewsAPI and GDELT fail to load, the app shows real Middle East headlines from a fallback. To refresh the fallback with fresh GDELT data (run weekly or after deploys):

```bash
npm run update-fallback-news
```

This writes to `public/fallback-news.json`. The app loads this file first when APIs fail; if missing, it uses built-in static headlines.

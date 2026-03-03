# SafeDXB — Production Setup

## API Keys Required

| Key | Required | Purpose | Where to Get |
|-----|----------|---------|--------------|
| **VITE_GDELT_API_KEY** / **GDELT_API_KEY** | Yes (for live news) | Primary live news source (conflict/security) | [gdeltcloud.com/auth/sign-up](https://gdeltcloud.com/auth/sign-up) — Analyst or Professional plan |
| **VITE_NEWS_API_KEY** | Fallback | NewsAPI articles when GDELT fails | [newsapi.org/register](https://newsapi.org/register) — Free: 100 req/day |
| **VITE_ANTHROPIC_API_KEY** | Yes (for AI summaries) | Generates bullet-point briefings | [console.anthropic.com](https://console.anthropic.com) — Paid, usage-based |

**No key needed:** GDELT Project (strike map), ipapi.co (location), OpenStreetMap (geocoding).

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

For **Vercel** (recommended):

- Add `GDELT_API_KEY` (primary), `VITE_NEWS_API_KEY` (fallback), and `VITE_ANTHROPIC_API_KEY` in Vercel → Settings → Environment Variables.
- `api/gdelt.js` proxies GDELT Cloud (keeps key server-side). `api/news.js` proxies NewsAPI when needed.
- Deploy with `vercel` or connect your Git repo. Build outputs to `dist/`.

For **Netlify / static hosts:**

- Add env vars. NewsAPI free tier blocks browser requests — you’ll get GDELT + fallback only (no live NewsAPI).

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

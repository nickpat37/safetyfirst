import { useState, useEffect, useRef } from "react";
import { geoPath, geoMercator } from "d3-geo";
import { feature } from "topojson-client";

// ─────────────────────────────────────────────────────────────
//  ⚙️  API CONFIGURATION  — set via .env (see .env.example)
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  NEWS_API_KEY: import.meta.env?.VITE_NEWS_API_KEY ?? "",
  ANTHROPIC_API_KEY: import.meta.env?.VITE_ANTHROPIC_API_KEY ?? "",
};

// ─────────────────────────────────────────────────────────────
//  shadcn/ui primitives
// ─────────────────────────────────────────────────────────────
const cn = (...c) => c.filter(Boolean).join(" ");

const Badge = ({ children, variant = "default", className = "" }) => {
  const v = {
    default:     "bg-slate-900 text-white",
    destructive: "bg-red-100 text-red-700 border border-red-200",
    warning:     "bg-amber-100 text-amber-700 border border-amber-200",
    success:     "bg-green-100 text-green-700 border border-green-200",
    outline:     "border border-slate-200 text-slate-700 bg-white",
    secondary:   "bg-slate-100 text-slate-700",
    blue:        "bg-blue-100 text-blue-700 border border-blue-200",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 h-[16px] text-[10px] font-medium", v[variant], className)}>{children}</span>;
};
const Card = ({ children, className = "" }) => <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
const CardHeader = ({ children, className = "" }) => <div className={cn("flex flex-col space-y-1 p-5 pb-3", className)}>{children}</div>;
const CardTitle = ({ children, className = "" }) => <h3 className={cn("font-heading text-sm font-semibold text-slate-900 tracking-wide uppercase", className)}>{children}</h3>;
const CardContent = ({ children, className = "" }) => <div className={cn("p-5 pt-0", className)}>{children}</div>;
const Alert = ({ children, variant = "default", className = "" }) => {
  const v = { default: "bg-slate-50 border-slate-200", destructive: "bg-red-50 border-red-200", warning: "bg-amber-50 border-amber-200" };
  return <div className={cn("relative rounded-lg border p-4", v[variant], className)}>{children}</div>;
};
const AlertTitle = ({ children }) => <h5 className="font-heading mb-1 font-semibold text-sm">{children}</h5>;
const AlertDescription = ({ children }) => <div className="text-sm">{children}</div>;
const Separator = ({ className = "" }) => <div className={cn("h-px bg-slate-100 w-full my-1", className)} />;

// ─────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────
const formatTimeAgo = (dateStr) => {
  if (!dateStr) return "Unknown";
  let d;
  if (typeof dateStr === "string" && dateStr.length === 14) {
    d = new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}T${dateStr.slice(8,10)}:${dateStr.slice(10,12)}:${dateStr.slice(12,14)}Z`);
  } else {
    d = new Date(dateStr);
  }
  const mins = Math.floor((Date.now() - d) / 60000);
  if (isNaN(mins) || mins < 0) return "Recent";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

const classifySeverity = (text = "") => {
  const t = text.toLowerCase();
  if (/missile|explosion|strike|attack|ballistic|intercept|blast|killed|casualt|rocket|bomb/.test(t)) return "high";
  if (/alert|warning|evacuat|emergency|threat|tension|military|armed|conflict/.test(t)) return "medium";
  return "low";
};

const extractRegion = (text = "") => {
  const map = [
    ["Dubai","Dubai"],["Abu Dhabi","UAE"],["UAE","UAE"],["Emirates","UAE"],
    ["Iran","Iran"],["Tehran","Iran"],["Iraq","Iraq"],["Baghdad","Iraq"],["Basra","Iraq"],
    ["Kuwait","Kuwait"],["Saudi","Saudi Arabia"],["Riyadh","Saudi Arabia"],
    ["Hormuz","Hormuz Strait"],["Yemen","Yemen"],["Bahrain","Bahrain"],
    ["Qatar","Qatar"],["Oman","Oman"],["Jordan","Jordan"],["Syria","Syria"],["Lebanon","Lebanon"],
  ];
  for (const [kw, region] of map) {
    if (text.includes(kw)) return region;
  }
  return "Middle East";
};

// Mercator projection matching StrikeMap — center Middle East, scale to fit
const mapProjection = geoMercator().center([54, 26]).scale(720).translate([400, 260]);
const projectPoint = (lon, lat) => {
  const p = mapProjection([lon, lat]);
  return p ? [Math.round(p[0]), Math.round(p[1])] : [400, 280];
};

const isCityOrCountry = (loc) => {
  const s = (loc || "").toLowerCase();
  if (/strait|gulf|sea\b|ocean|channel|passage|basin|waters?\b/.test(s)) return false;
  return true;
};

// ─────────────────────────────────────────────────────────────
//  Static data
// ─────────────────────────────────────────────────────────────
const DEMO_NEWS = [
  { id: 0, source: "Setup Required", time: "Now", publishedAt: new Date().toISOString(), title: "Add your NewsAPI key in CONFIG.NEWS_API_KEY to see live Middle East news", summary: "Register free at newsapi.org/register — 100 requests/day on the free tier.", url: "https://newsapi.org/register", severity: "low", region: "UAE" },
  { id: 1, source: "GDELT (Map)", time: "Now", publishedAt: new Date().toISOString(), title: "The Strike Map is already pulling live data from GDELT — no key required", summary: "GDELT monitors global news in real-time and geo-tags conflict events automatically.", url: "https://gdeltproject.org", severity: "low", region: "Middle East" },
];

const DEMO_MAP_EVENTS = [
  { id: 0, lon: 47.79, lat: 30.52, type: "strike",  label: "BASRA",  loc: "Basra, Iraq",    detail: "Demo — GDELT loading",  color: "#ef4444", url: "#" },
  { id: 1, lon: 56.25, lat: 26.54, type: "strike",  label: "HORMUZ", loc: "Hormuz Strait",  detail: "Demo — GDELT loading",  color: "#ef4444", url: "#" },
  { id: 2, lon: 47.98, lat: 29.38, type: "warning", label: "KUWAIT", loc: "Kuwait",         detail: "Demo — GDELT loading",  color: "#f59e0b", url: "#" },
  { id: 3, lon: 55.27, lat: 25.20, type: "safe",    label: "DUBAI",  loc: "Dubai, UAE",     detail: "No incidents reported", color: "#22c55e", url: "#" },
];

const GUIDELINES = [
  {
    phase: "01", color: "amber", title: "Prepare Now", subtitle: "Before any incident — build your emergency kit",
    kit: ["💧 Water (4L/person)","🥫 72h food supply","🩹 First Aid Kit","🔦 Flashlight","📻 Battery Radio","💊 7-day medications","📄 Document copies","💴 AED 500+ cash","🔋 Power bank"],
    steps: [
      { icon: "🏠", title: "Identify your safe room", desc: "Choose the most interior room — ideally a bathroom or hallway with no external windows." },
      { icon: "💧", title: "Stock emergency supplies", desc: "4L water/person/day for 3 days, non-perishable food, first aid kit, flashlight, battery radio, 7-day medications." },
      { icon: "📱", title: "Register for UAE NCEMA alerts", desc: "Download UAE Pass app and subscribe to Civil Defense alerts. Save emergency numbers under 'ICE'." },
      { icon: "👨‍👩‍👧", title: "Establish a family meeting point", desc: "Agree on two rally points: one near your home, one elsewhere in the city." },
    ],
  },
  {
    phase: "02", color: "red", title: "Alert Issued", subtitle: "Act immediately — within 90 seconds",
    steps: [
      { icon: "🚨", title: "Seek shelter immediately", desc: "Move to your safe room. Do NOT drive or flee on foot. Safest place is inside a solid building." },
      { icon: "🪟", title: "Stay away from all windows", desc: "Blast waves from nearby explosions can shatter glass at considerable distance." },
      { icon: "📡", title: "Monitor official channels only", desc: "Follow @UAEGov, @NCEMA, @modgovae. Do not spread unverified information." },
      { icon: "🐾", title: "Secure pets and children first", desc: "Do not send children to school or leave home until official all-clear is given." },
    ],
  },
  {
    phase: "03", color: "red", title: "Strike Nearby", subtitle: "Critical first minutes after impact",
    steps: [
      { icon: "🫁", title: "Cover mouth and nose", desc: "Use a damp cloth to filter dust, debris, and potential contaminants from burning materials." },
      { icon: "⬇️", title: "Drop, Cover, Hold On", desc: "Drop to the ground, cover behind any solid object, protect your head. Do not run." },
      { icon: "🏃", title: "Evacuate only when safe", desc: "Only evacuate if building is on fire. Wait for secondary explosions. Use stairs only." },
      { icon: "🚑", title: "Administer first aid", desc: "Control bleeding with direct pressure. Call 998 and stay on the line with the operator." },
    ],
  },
  {
    phase: "04", color: "green", title: "All-Clear", subtitle: "Recovery — resume safely",
    steps: [
      { icon: "📡", title: "Wait for official all-clear", desc: "Do not leave shelter until UAE Civil Defense confirms it is safe to do so." },
      { icon: "🔍", title: "Inspect before re-entering", desc: "Check for structural damage, gas leaks, and electrical hazards before entering." },
      { icon: "📸", title: "Document damage for insurance", desc: "Photograph all damage before touching anything. Contact your insurer." },
    ],
  },
];

const HOTLINES = [
  { name: "Fire & Civil Defense", number: "997", tel: "997", emoji: "🚒", desc: "Fires · Rescue · Structural damage", color: "red" },
  { name: "Ambulance", number: "998", tel: "998", emoji: "🚑", desc: "Injuries · Medical emergency · Trauma", color: "green" },
  { name: "Dubai Police", number: "999", tel: "999", emoji: "🚔", desc: "Police · Security · All emergencies", color: "blue" },
  { name: "NCEMA Crisis Line", number: "800 2040", tel: "8002040", emoji: "🏛", desc: "National crisis management authority", color: "amber" },
  { name: "US Embassy Abu Dhabi", number: "+971 2 414 2200", tel: "+97124142200", emoji: "🇺🇸", desc: "American nationals in UAE", color: "slate" },
  { name: "UK Embassy", number: "+971 4 309 4444", tel: "+97143094444", emoji: "🇬🇧", desc: "British nationals in UAE", color: "slate" },
];

// ─────────────────────────────────────────────────────────────
//  4-LEVEL STATUS ENGINE
// ─────────────────────────────────────────────────────────────
const DIRECT_ATTACK_KEYWORDS = /direct attack|under attack|hit by missile|struck by|bombed|explosion in dubai|explosion in uae|attack on uae|missile hit/i;
const NEIGHBOR_ATTACK_KEYWORDS = /missile strike|ballistic missile|missile attack|rocket attack|air strike|airstrike|struck|bombed|blast|intercept|fired missile|launched missile/i;
const FLUID_KEYWORDS = /military movement|troops deployed|military buildup|naval exercise|military tension|armed forces|escalat|mobiliz|provocation|standoff|drills near|threat issued|warning issued|heightened|military drill|warships|combat alert|red alert|standby/i;

const NEIGHBOR_REGIONS = ["Iraq","Iran","Kuwait","Yemen","Syria","Lebanon","Israel","Gaza","Saudi Arabia","Bahrain","Qatar","Oman"];
const UAE_TERMS = /\b(UAE|Dubai|Abu Dhabi|Emirates|Emirati|Sharjah|Fujairah|Ras Al Khaimah)\b/i;

const computeStatus = (news, userCity, userCountry) => {
  const isUAE = /united arab emirates|uae|dubai|abu dhabi|sharjah|fujairah/i.test(`${userCountry} ${userCity}`);
  const neighborInNews = (text) => NEIGHBOR_REGIONS.some(r => text.toLowerCase().includes(r.toLowerCase()));

  const directHitArticle = news.find(n => {
    const t = `${n.title} ${n.summary}`;
    return DIRECT_ATTACK_KEYWORDS.test(t) && (isUAE ? UAE_TERMS.test(t) : t.toLowerCase().includes((userCity || "").toLowerCase()));
  });
  if (directHitArticle) return {
    level: 4, key: "danger",
    label: "DANGER",
    sub: "Direct attack reported in your area",
    desc: "Seek shelter immediately. Move to an interior room away from windows. Call emergency services (999). Do not leave unless your building is on fire.",
    reason: directHitArticle.title,
    action: "Take shelter NOW",
    actionLink: "hotlines",
    color: "text-red-700",
    gradientFrom: "#fef2f2", gradientTo: "#fee2e2",
    borderColor: "#f87171",
    pulseColor: "#ef4444",
    barColors: ["#22c55e","#f59e0b","#f97316","#ef4444"],
    icon: "🚨",
  };

  const neighborAttackedArticle = news.find(n => {
    const t = `${n.title} ${n.summary}`;
    return NEIGHBOR_ATTACK_KEYWORDS.test(t) && neighborInNews(t) && n.severity === "high";
  });
  if (neighborAttackedArticle) return {
    level: 3, key: "alerted",
    label: "ALERTED",
    sub: "Attack confirmed in a nearby region",
    desc: "A neighboring area has come under attack. Prepare your safe room, charge your devices, and keep emergency contacts ready. Avoid crowded outdoor areas.",
    reason: neighborAttackedArticle.title,
    action: "Review safety guidelines",
    actionLink: "guidelines",
    color: "text-orange-700",
    gradientFrom: "#fff7ed", gradientTo: "#ffedd5",
    borderColor: "#fb923c",
    pulseColor: "#f97316",
    barColors: ["#22c55e","#f59e0b","#f97316","#e5e7eb"],
    icon: "⚠️",
  };

  const volatileArticle = news.find(n => {
    const t = `${n.title} ${n.summary}`;
    return (FLUID_KEYWORDS.test(t) || (NEIGHBOR_ATTACK_KEYWORDS.test(t) && n.severity === "medium")) && neighborInNews(t);
  });
  if (volatileArticle) return {
    level: 2, key: "volatile",
    label: "VOLATILE",
    sub: "Active military operations in the region",
    desc: "Military activity is ongoing nearby. The situation is fluid and could escalate without warning. Stay aware, review your emergency plan, and monitor official channels.",
    reason: volatileArticle.title,
    action: "Stay informed",
    actionLink: "news",
    color: "text-amber-700",
    gradientFrom: "#fffbeb", gradientTo: "#fef3c7",
    borderColor: "#fbbf24",
    pulseColor: "#f59e0b",
    barColors: ["#22c55e","#f59e0b","#e5e7eb","#e5e7eb"],
    icon: "🟡",
  };

  return {
    level: 1, key: "safe",
    label: "SAFE",
    sub: "No direct threats to your location",
    desc: "No active threats detected near your area. Situation across the broader region continues to be monitored. Continue normal activities and stay informed.",
    reason: news.length > 0 ? "No attack or military escalation in current headlines." : "Waiting for news data. Add your NewsAPI key to enable live monitoring.",
    action: null,
    actionLink: null,
    color: "text-green-700",
    gradientFrom: "#f0fdf4", gradientTo: "#dcfce7",
    borderColor: "#4ade80",
    pulseColor: "#22c55e",
    barColors: ["#22c55e","#e5e7eb","#e5e7eb","#e5e7eb"],
    icon: "✅",
  };
};

const AT_RISK_REGIONS = ["Iraq","Iran","Kuwait","Yemen","Syria","Lebanon","Israel","Gaza","West Bank","Bahrain","Hormuz"];
const ELEVATED_REGIONS = ["Saudi Arabia","Qatar","Oman","Jordan","Turkey"];

const assessLocationRisk = (country, city) => {
  const loc = `${country} ${city}`.toLowerCase();
  if (AT_RISK_REGIONS.some(r => loc.includes(r.toLowerCase()))) {
    return { level: "high", label: "HIGH RISK", color: "text-red-600", bg: "bg-red-50 border-red-200", sub: "Active conflict zone" };
  }
  if (ELEVATED_REGIONS.some(r => loc.includes(r.toLowerCase()))) {
    return { level: "elevated", label: "ELEVATED", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", sub: "Monitor closely" };
  }
  if (loc.includes("united arab emirates") || loc.includes("uae") || loc.includes("dubai") || loc.includes("abu dhabi") || loc.includes("sharjah")) {
    return { level: "safe", label: "SECURE", color: "text-green-600", bg: "bg-green-50 border-green-200", sub: "No direct threat" };
  }
  return { level: "safe", label: "SECURE", color: "text-green-600", bg: "bg-green-50 border-green-200", sub: "Outside conflict zone" };
};

const useUserLocation = () => {
  const [location, setLocation] = useState({ city: null, country: null, loading: true, error: null });

  useEffect(() => {
    const tryBrowserGeo = () => {
      if (!navigator.geolocation) { tryIPFallback(); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
            const data = await res.json();
            const city = data.address?.city || data.address?.town || data.address?.county || "Unknown city";
            const country = data.address?.country || "Unknown country";
            setLocation({ city, country, loading: false, error: null });
          } catch (_) { tryIPFallback(); }
        },
        () => tryIPFallback(),
        { timeout: 5000 }
      );
    };

    const tryIPFallback = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        setLocation({ city: data.city || "Unknown", country: data.country_name || "Unknown", loading: false, error: null });
      } catch (_) {
        setLocation({ city: "Dubai", country: "United Arab Emirates", loading: false, error: "location_unavailable" });
      }
    };

    tryBrowserGeo();
  }, []);

  return location;
};

const dedupeBullets = (items) => {
  const result = [];
  for (const b of items) {
    const url = b.news?.url;
    const titleNorm = (b.news?.title || "").toLowerCase().trim().slice(0, 60);
    const textWords = new Set((b.text || "").toLowerCase().replace(/\*\*/g, "").split(/\W+/).filter(w => w.length >= 4));
    const isDup = result.some((prev) => {
      if (url && prev.news?.url === url) return true;
      if (titleNorm && prev.news?.title && (prev.news.title || "").toLowerCase().trim().slice(0, 60) === titleNorm) return true;
      const prevWords = new Set((prev.text || "").toLowerCase().replace(/\*\*/g, "").split(/\W+/).filter(w => w.length >= 4));
      const overlap = [...textWords].filter(w => prevWords.has(w)).length;
      return overlap >= 4;
    });
    if (!isDup) result.push(b);
  }
  return result;
};

/** Remove duplicate/similar news articles (same URL, same title, or high content overlap) */
const dedupeNews = (articles) => {
  const result = [];
  for (const a of articles) {
    const url = a.url;
    const titleNorm = (a.title || "").toLowerCase().trim().slice(0, 80);
    const content = `${a.title || ""} ${a.summary || ""}`.toLowerCase();
    const words = new Set(content.split(/\W+/).filter(w => w.length >= 4));
    const isDup = result.some((prev) => {
      if (url && prev.url === url) return true;
      if (titleNorm && (prev.title || "").toLowerCase().trim().slice(0, 80) === titleNorm) return true;
      const prevWords = new Set(`${prev.title || ""} ${prev.summary || ""}`.toLowerCase().split(/\W+/).filter(w => w.length >= 4));
      const overlap = [...words].filter(w => prevWords.has(w)).length;
      return overlap >= 5; // same story if 5+ significant words overlap
    });
    if (!isDup) result.push(a);
  }
  return result;
};

/** Diversify articles by region — interleave so we don't show all from one country (e.g. Iran) */
const diversifyNewsByRegion = (articles, maxPerRegion = 3) => {
  const byRegion = {};
  for (const a of articles) {
    const r = a.region || "Middle East";
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push(a);
  }
  // Sort each region by date (newest first)
  for (const r of Object.keys(byRegion)) {
    byRegion[r].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }
  const result = [];
  for (let round = 0; round < maxPerRegion; round++) {
    for (const r of Object.keys(byRegion)) {
      if (byRegion[r][round]) result.push(byRegion[r][round]);
    }
  }
  // Append any remaining (from regions with many articles) sorted by date
  const used = new Set(result);
  const remaining = articles.filter(a => !used.has(a));
  remaining.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return [...result, ...remaining];
};

const isEnglishText = (text) => {
  if (!text || typeof text !== "string") return true;
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  const total = text.replace(/\s/g, "").length || 1;
  return cjk / total < 0.15;
};
const hasCyrillic = (text) => /[\u0400-\u04FF]/.test(text || "");
const NON_ENGLISH_SOURCE = /(^|\.)(de|fr|es|it|pt|ru|nl|pl|tr|ar)\.|\.(de|fr|es|it|pt|ru|nl|pl|tr)\b/i;
const NON_ENGLISH_WORDS = /\b(der|die|das|und|auf|zu|mit|für|ist|wird|werden|hat|haben|erneut|alarm|krieg|drohnen|militär|abgefangen|zypern|neue|alle|auch|nur|nicht|oder|aber|le|la|les|et|dans|pour|avec|sont|ont|une|des|el|los|las|del|que|son|una|por|con)\b/i;
const isEnglishContent = (text) => {
  if (!text || typeof text !== "string") return !!text;
  if (hasCyrillic(text)) return false;
  if (!isEnglishText(text)) return false;
  if (NON_ENGLISH_WORDS.test(text)) return false;
  return true;
};
const isEnglishSource = (source) => {
  if (!source) return true;
  const s = String(source).toLowerCase();
  return !NON_ENGLISH_SOURCE.test(s);
};

const useLiveNews = () => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const tryGdeltNews = async () => {
    const query = encodeURIComponent("missile attack strike explosion Iran Iraq Kuwait UAE Dubai Saudi Arabia");
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=20&format=json&timespan=1day&sourcelang=eng`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.articles || [])
      .filter(a => a.title && isEnglishContent(a.title) && isEnglishSource(a.domain || a.url || ""))
      .slice(0, 15).map((a, i) => ({
        id: i, source: a.domain || "GDELT", time: formatTimeAgo(a.seendate),
        publishedAt: a.seendate, title: a.title, summary: "",
        url: a.url, severity: classifySeverity(a.title), region: extractRegion(a.title),
      }));
  };

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!CONFIG.NEWS_API_KEY) throw new Error("NO_KEY");
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
      const q = encodeURIComponent(
        "(missile OR strike OR explosion OR attack OR ballistic OR Iran OR \"Middle East\" OR \"military\" OR \"troop\" OR \"defense\") AND (UAE OR Dubai OR Iraq OR Kuwait OR Saudi OR Hormuz) -oil -gold -price -stock -market -finance -commodity -OPEC -crude -trading"
      );
      const res = await fetch(`https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=20&from=${today}&to=${today}&apiKey=${CONFIG.NEWS_API_KEY}`);
      if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
      const data = await res.json();
      if (data.status !== "ok") throw new Error(data.message || "NewsAPI error");

      const filterByLang = (a) => {
        if (!a.title || a.title === "[Removed]") return false;
        if (!isEnglishContent(a.title)) return false;
        const src = a.source?.name || a.url || "";
        if (!isEnglishSource(src)) return false;
        if (a.description && !isEnglishContent(a.description)) return false;
        return true;
      };
      let articles = (data.articles || [])
        .filter(filterByLang)
        .map((a, i) => ({
          id: i, source: a.source?.name || "Unknown",
          time: formatTimeAgo(a.publishedAt), publishedAt: a.publishedAt,
          title: a.title, summary: a.description || "",
          url: a.url, urlToImage: a.urlToImage,
          severity: classifySeverity(`${a.title} ${a.description}`),
          region: extractRegion(`${a.title} ${a.description}`),
        }));

      if (articles.length === 0) {
        const fallback = await tryGdeltNews();
        if (fallback.length > 0) articles = fallback;
      }
      const deduped = dedupeNews(articles);
      const diversified = diversifyNewsByRegion(deduped).map((a, i) => ({ ...a, id: i }));
      setNews(diversified);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (err.message === "NO_KEY") setError("no_key");
      else setError(err.message);
      try {
        const fallback = await tryGdeltNews();
        if (fallback.length > 0) {
          const deduped = dedupeNews(fallback);
          const diversified = diversifyNewsByRegion(deduped).map((a, i) => ({ ...a, id: i }));
          setNews(diversified);
          setLastUpdated(new Date());
        } else setNews(DEMO_NEWS);
      } catch (_) { setNews(DEMO_NEWS); setLastUpdated(new Date()); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNews(); }, []);
  useEffect(() => { const id = setInterval(fetchNews, 5 * 60 * 1000); return () => clearInterval(id); }, []);

  return { news, loading, error, lastUpdated, refetch: fetchNews };
};

const useGdeltMap = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const q = encodeURIComponent("missile attack strike explosion Iran Iraq Kuwait UAE Saudi Arabia Hormuz ballistic");
        const url = `https://api.gdeltproject.org/api/v2/geo/geo?query=${q}&mode=pointdata&format=json&timespan=7days&maxrecords=60&sourcelang=eng`;
        const res = await fetch(url);
        const data = await res.json();

        const pts = (data.features || [])
          .filter(f => f.geometry?.coordinates?.length === 2 && f.properties?.name)
          .map((f, i) => {
            const [lon, lat] = f.geometry.coordinates;
            return {
              id: i, lon, lat,
              label: (f.properties.name || "").split(",")[0].toUpperCase().slice(0, 12),
              loc: f.properties.name || "Unknown",
              detail: (f.properties.name || "") + " — conflict event detected",
              url: f.properties.url || "#",
              color: "#ef4444", type: "strike",
            };
          })
          .filter(e => {
            const [cx, cy] = projectPoint(e.lon, e.lat);
            return cx > 30 && cx < 770 && cy > 10 && cy < 470;
          })
          .filter((e, i, arr) => {
            const [cx, cy] = projectPoint(e.lon, e.lat);
            return arr.findIndex(o => {
              const [ox, oy] = projectPoint(o.lon, o.lat);
              return Math.abs(ox - cx) < 18 && Math.abs(oy - cy) < 18;
            }) === i;
          })
          .slice(0, 14);

        const withDubai = pts.filter(p => !/dubai|uae|emirates/i.test(p.loc)).concat([{
          id: "dubai", lon: 55.27, lat: 25.20, type: "safe", label: "DUBAI",
          loc: "Dubai, UAE", detail: "No incidents reported — Secure", color: "#22c55e", url: "#",
        }]);

        setEvents(withDubai.length > 1 ? withDubai : DEMO_MAP_EVENTS);
      } catch (_) {
        setEvents(DEMO_MAP_EVENTS);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { events, loading };
};

const useClaudeSummary = (news) => {
  const [bullets, setBullets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const sigRef = useRef(null);

  const generate = async (articles) => {
    if (!articles?.length) return;
    const sig = articles.slice(0, 10).map(a => a.title).join("|").slice(0, 300);
    if (sig === sigRef.current) return;
    sigRef.current = sig;

    setLoading(true);
    setError(null);
    try {
      const MILITARY_CONFLICT_RE = /missile|strike|attack|explosion|war|conflict|military|troop|defense|ballistic|rocket|blast|bomb|combat|invasion|evacuation|travel advisory|terrorism|unrest|political|strategy|iran|iraq|kuwait|yemen|syria|hormuz|gulf|uae|dubai|middle east|air strike|airstrike/i;
      const EXCLUDE_FINANCE_RE = /oil|crude|petrol|brent|wti|barrel|opec|edible oil|oilmeals|oil sector|oil industry|commodit|commodity|stock|share|market|equity|nasdaq|s&p|dow|trading|invest|currency|forex|inflation|earnings|revenue|profit|dividend|ipo|billionaire|hedge fund|gold (surge|price|rally)|silver price|commodity price|rs \d|rupee|perfect time to (invest|buy|sell)|sector turn|cautious amid|agri|agricultur|food price|supply chain|import.*export|price (of|per)|pricing/i;
      const safetyRelevant = articles.filter(a => {
        const t = `${a.title} ${a.summary || ""}`;
        if (!isEnglishContent(a.title)) return false;
        if (!isEnglishSource(a.source || a.url || "")) return false;
        if (EXCLUDE_FINANCE_RE.test(t)) return false;
        if (!MILITARY_CONFLICT_RE.test(t)) return false;
        return true;
      });
      const toUse = safetyRelevant;
      if (toUse.length === 0) {
        setBullets([]);
        setLoading(false);
        return;
      }
      const articlesWithSummary = toUse.slice(0, 14).map((a, i) => ({
        index: i + 1,
        source: a.source,
        title: a.title,
        summary: (a.summary || "").slice(0, 250),
      }));
      const inputText = articlesWithSummary.map(a =>
        `${a.index}. [${a.source}] ${a.title}${a.summary ? `\n   ${a.summary}` : ""}`
      ).join("\n\n");

      const headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
      if (CONFIG.ANTHROPIC_API_KEY) headers["x-api-key"] = CONFIG.ANTHROPIC_API_KEY;
      if (typeof window !== "undefined") headers["anthropic-dangerous-direct-browser-access"] = "true";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: `You are a conflict analyst producing LIVE safety briefings for Dubai and Middle East residents.

## Your task
Summarize the war, conflict, and security situation in the Middle East region as bullet points. Focus ONLY on military status, strategy, and political conflict. For each article, write exactly ONE concise line.

## Rules — follow strictly
1. INCLUDE ONLY: Military conflicts, missile/strike activity, attacks, military strategy announcements, troop movements, defense policy, evacuations, travel advisories, terrorism, civil unrest, regional security, political tensions. Focus on military status and political conflict—what affects civilian safety. NO finance, NO markets.
2. EXCLUDE ALWAYS: Oil (any kind), oil sector, oilmeals, finance, stock markets, gold/commodity prices, currency, investments, business sectors, agriculture/food prices, supply chains, pricing. If an article mentions "X sector cautious" or "markets/react" or business/economic impact—SKIP IT entirely.
3. Each bullet = exactly ONE line. One short sentence only (~15–20 words max). Base on the article—do not invent. Wrap the key phrase in **double asterisks**.
4. Output 5–7 bullets. One article per bullet. Single sentence per bullet. Do NOT repeat the same story—if two articles cover the same event, include only ONE bullet for it.
5. Return ONLY a raw JSON array. No markdown, no preamble.
6. Write ALL summaries in English only. No other languages.

## Output format (each object)
- "text": string (ONE line, one sentence, ~15–20 words max, with **bold** key phrase)
- "severity": "high" | "medium" | "low"
- "articleIndex": 1-based index of the article (1–14)`,
          messages: [{ role: "user", content: `Articles (numbered 1–14). Generate the safety briefing in English only. Each bullet = ONE line only (one short sentence, ~15–20 words max). EXCLUDE: oil, gold, finance, commodities. INCLUDE ONLY: military status, strategy, political conflict. Do NOT include two bullets about the same news story. Write all output in English.\n\n${inputText}\n\nGenerate the JSON briefing now.` }],
        }),
      });

      if (!res.ok) throw new Error(`Claude ${res.status}`);
      const data = await res.json();
      const raw = data.content?.[0]?.text || "[]";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const withNews = parsed.map(b => ({ ...b, news: toUse[Math.max(0, (b.articleIndex || 1) - 1)] }));
      setBullets(dedupeBullets(withNews));
    } catch (err) {
      setError(err.message);
      // Prefer conflict-related headlines; if AI credits low, fall back to any news headlines
      const safeForFallback = articles.filter(a => {
        const t = `${a.title} ${a.summary || ""}`;
        if (/oil|crude|petrol|brent|commodit|stock|share|market|equity|trading|currency|forex|gold price|revenue|profit|dividend/i.test(t)) return false;
        if (/missile|strike|attack|explosion|war|conflict|military|troop|ballistic|iran|iraq|kuwait|hormuz|middle east/i.test(t)) return true;
        return false;
      });
      const fallbackArticles = safeForFallback.length > 0 ? safeForFallback : articles.filter(a => {
        const t = `${a.title} ${a.summary || ""}`;
        return !/oil|crude|petrol|brent|commodit|stock|share|market|equity|trading|currency|forex/i.test(t);
      });
      const oneLine = (s) => (s.length > 120 ? s.slice(0, 117).replace(/\s+\S*$/, "") + "…" : s);
      const fallbackBullets = fallbackArticles.slice(0, 8).map(a => ({ text: oneLine([a.title, a.summary].filter(Boolean).join(" ")), severity: a.severity, news: a }));
      setBullets(dedupeBullets(fallbackBullets));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (news.length > 0) generate(news); }, [news]);

  return { bullets, loading, error, regenerate: () => { sigRef.current = null; generate(news); } };
};

// ─────────────────────────────────────────────────────────────
//  UI Components
// ─────────────────────────────────────────────────────────────
const Spinner = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin text-slate-400">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const SeverityBadge = ({ level }) => {
  if (level === "high")   return <Badge variant="destructive">High</Badge>;
  if (level === "medium") return <Badge variant="warning">Medium</Badge>;
  return <Badge variant="success">Low</Badge>;
};

const SkeletonCard = () => (
  <div className="p-4 rounded-lg border border-slate-100 space-y-2">
    <div className="h-3 bg-slate-100 rounded w-1/4 animate-pulse"/>
    <div className="h-5 bg-slate-100 rounded w-full animate-pulse"/>
    <div className="h-3 bg-slate-100 rounded w-2/3 animate-pulse"/>
  </div>
);

const NewsCard = ({ item, compact = false }) => (
  <div className={cn("group flex flex-col gap-2 p-4 rounded-lg border-0 bg-neutral-50 hover:bg-slate-50 transition-all", compact && "p-3")}>
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{item.source}</span>
      <span className="text-xs text-slate-400">{item.time}</span>
      <SeverityBadge level={item.severity}/>
      <Badge variant="outline" className="text-[10px] ml-auto gap-1">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        {item.region}
      </Badge>
    </div>
    <p className={cn("font-semibold text-slate-900 leading-snug", compact ? "text-sm" : "text-[15px]")}>{item.title}</p>
    {!compact && item.summary && <p className="text-sm text-slate-500 leading-relaxed">{item.summary}</p>}
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-0.5 w-fit"
      onClick={e => e.stopPropagation()}>
      Read full story
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </a>
  </div>
);

const NewsSquareCard = ({ item }) => (
  <a href={item.url} target="_blank" rel="noopener noreferrer"
    className="group flex-shrink-0 w-[200px] h-[140px] snap-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all flex flex-col p-3 overflow-hidden">
    <div className="flex items-center gap-2 shrink-0 flex-wrap">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-full shrink-0">{item.source}</span>
      <SeverityBadge level={item.severity}/>
    </div>
    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5 block">{item.time}</span>
    <p className="text-xs font-semibold text-slate-900 leading-snug line-clamp-3 flex-1 min-h-0 mt-1">{item.title}</p>
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 group-hover:text-blue-700 mt-auto shrink-0">
      Read full story
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </span>
  </a>
);

const MISSILE_STRIKE_RE = /missile|ballistic|rocket|strike|explosion|blast|intercept|fired|launched/i;
const filterBullets = (bullets, filter) => {
  if (!filter) return bullets;
  if (filter === "missile") return bullets.filter(b => MISSILE_STRIKE_RE.test(b.text) || (b.news && MISSILE_STRIKE_RE.test(`${b.news.title || ""} ${b.news.summary || ""}`)));
  if (filter === "high") return bullets.filter(b => b.severity === "high");
  if (filter === "medium") return bullets.filter(b => b.severity === "medium");
  return bullets;
};

const AISummaryPanel = ({ bullets, loading, error, lastUpdated, onRegenerate, bulletFilter, onClearFilter, hasNews = false }) => {
  const filteredBullets = filterBullets(bullets, bulletFilter);
  const filterBadge = bulletFilter === "missile" ? { label: "🎯 Missile/strike", style: "bg-red-100 text-red-700 border-red-200" } : bulletFilter === "high" ? { label: "🔴 High-severity", style: "bg-orange-100 text-orange-700 border-orange-200" } : bulletFilter === "medium" ? { label: "🟡 Developing", style: "bg-amber-100 text-amber-700 border-amber-200" } : null;
  return (
  <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-white overflow-visible">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-blue-900 normal-case text-lg font-semibold flex items-center justify-center gap-4">
              Latest News
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
                Live
              </span>
            </CardTitle>
          </div>
          {filterBadge && onClearFilter && (
            <span className={cn("inline-flex items-center gap-1 w-fit rounded-full px-2.5 py-0.5 text-[10px] font-medium border", filterBadge.style)}>
              {filterBadge.label}
              <button onClick={onClearFilter} className="ml-0.5 -mr-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors" aria-label="Clear filter">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {lastUpdated && <span className="text-[10px] text-blue-500">{formatTimeAgo(lastUpdated.toISOString())}</span>}
          <button onClick={onRegenerate} disabled={loading}
            className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-0.5 bg-white/60 transition-colors disabled:opacity-40 cursor-pointer">
            {loading ? <Spinner size={10}/> : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
            Refresh
          </button>
        </div>
      </div>
    </CardHeader>
    <CardContent className="pt-1">
      {loading && bullets.length === 0 ? (
        <div className="flex items-center gap-3 py-4 text-sm text-blue-500"><Spinner size={16}/> Generating briefing from live news…</div>
      ) : bullets.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">{hasNews ? "No military or conflict-related news in this batch. Finance, oil, gold, and commodity news are excluded—only military status and political conflict." : "Waiting for news data… Add your NewsAPI key to enable live summaries."}</p>
      ) : (
        <ul className="space-y-2.5 min-w-0 w-full overflow-visible">
          {filteredBullets.length === 0 && filterBadge ? <p className="text-sm text-slate-400 py-2">No {filterBadge.label.replace(/^[^\s]+\s/, "")} items. {onClearFilter && <button onClick={onClearFilter} className="text-blue-600 hover:underline">Clear filter</button>}</p> : filteredBullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5 group/item min-w-0 w-full">
              <div className={cn("mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0",
                b.severity === "high" ? "bg-red-400" : b.severity === "medium" ? "bg-amber-400" : "bg-blue-400")}/>
              <div className="flex-1 min-w-0 overflow-visible w-full">
                <span className="text-sm text-slate-700 leading-relaxed break-words whitespace-normal block overflow-visible">
                  {b.text}
                  {b.news?.url && b.news?.source && (
                    <> · <a href={b.news.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border border-slate-200 text-blue-600 bg-blue-100 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                      onClick={e=>e.stopPropagation()}>{b.news.source}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a></>
                  )}
                </span>
              </div>
              {b.news?.url && (
                <a href={b.news.url} target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 mt-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity text-blue-500 hover:text-blue-700">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {filteredBullets.length > 0 && (() => {
        const newsItems = [...new Map(filteredBullets.filter(b => b.news?.url).map(b => [b.news.url, b.news])).values()];
        if (newsItems.length === 0) return null;
        return (
          <div className="mt-4 pt-4 border-t border-blue-100/50">
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory" style={{ WebkitOverflowScrolling: "touch" }}>
              {newsItems.map(n => <NewsSquareCard key={n.id ?? n.url} item={n}/>)}
            </div>
          </div>
        );
      })()}
      {error && !loading && (
        <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          Claude: {error} — showing headline extracts as fallback
        </p>
      )}
    </CardContent>
  </Card>
  );
};

// Middle East country IDs (ISO 3166-1 numeric / M49)
const MIDDLE_EAST_IDS = new Set([4, 48, 196, 275, 364, 368, 376, 400, 414, 422, 512, 586, 634, 682, 760, 784, 792, 818, 887, "4", "48", "196", "275", "364", "368", "376", "400", "414", "422", "512", "586", "634", "682", "760", "784", "792", "818", "887"]);

// ─────────────────────────────────────────────────────────────
//  Interactive Strike Map
// ─────────────────────────────────────────────────────────────
const StrikeMap = ({ events, loading }) => {
  const containerRef = useRef(null);
  const [tr, setTr] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [geography, setGeography] = useState(null);
  const dragStart = useRef(null);
  const lastTr = useRef({ x: 0, y: 0 });
  const lastTouches = useRef(null);
  const MIN = 0.5, MAX = 6;

  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then(topology => {
        const countries = feature(topology, topology.objects.countries);
        const filtered = {
          type: "FeatureCollection",
          features: countries.features.filter(f => MIDDLE_EAST_IDS.has(f.id) || MIDDLE_EAST_IDS.has(String(f.id)))
        };
        setGeography(filtered);
      })
      .catch(() => setGeography(null));
  }, []);

  const clamp = (x, y, s) => ({
    x: Math.min(560, Math.max(-800 * (s - 0.3), x)),
    y: Math.min(336, Math.max(-480 * (s - 0.3), y)),
    scale: s,
  });

  const onWheel = e => {
    e.preventDefault();
    const r = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const d = e.deltaY < 0 ? 1.13 : 0.88;
    setTr(p => { const s = Math.min(MAX, Math.max(MIN, p.scale * d)); const ratio = s / p.scale; return clamp(mx - ratio * (mx - p.x), my - ratio * (my - p.y), s); });
  };

  const onPointerDown = e => {
    if (e.target.closest("[data-marker]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastTr.current = { x: tr.x, y: tr.y };
  };
  const onPointerMove = e => { if (!dragging) return; setTr(p => clamp(lastTr.current.x + e.clientX - dragStart.current.x, lastTr.current.y + e.clientY - dragStart.current.y, p.scale)); };
  const onPointerUp = () => setDragging(false);

  const onTouchStart = e => { if (e.touches.length === 2) lastTouches.current = e.touches; };
  const onTouchMove = e => {
    if (e.touches.length !== 2 || !lastTouches.current) return;
    e.preventDefault();
    const prev = lastTouches.current;
    const pd = Math.hypot(prev[0].clientX - prev[1].clientX, prev[0].clientY - prev[1].clientY);
    const cd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const sd = cd / pd;
    const r = containerRef.current.getBoundingClientRect();
    const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
    const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
    setTr(p => { const s = Math.min(MAX, Math.max(MIN, p.scale * sd)); const ratio = s / p.scale; return clamp(mx - ratio * (mx - p.x), my - ratio * (my - p.y), s); });
    lastTouches.current = e.touches;
  };

  const zoomIn  = () => setTr(p => { const s = Math.min(MAX, p.scale * 1.35); const r = s / p.scale; return clamp(p.x - 400 * (r - 1), p.y - 240 * (r - 1), s); });
  const zoomOut = () => setTr(p => { const s = Math.max(MIN, p.scale / 1.35); const r = s / p.scale; return clamp(p.x - 400 * (r - 1), p.y - 240 * (r - 1), s); });
  const reset   = () => setTr({ x: 0, y: 0, scale: 1 });

  const allEvents = events.some(e => e.type === "safe")
    ? events
    : [...events, { id: "dubai", lon: 55.27, lat: 25.20, type: "safe", label: "DUBAI", loc: "Dubai, UAE", detail: "No incidents reported — Secure", color: "#22c55e", url: "#" }];

  const pathGenerator = geoPath().projection(mapProjection);

  // Resolve event position (support both lon/lat and legacy cx,cy)
  const getEventPos = (inc) => {
    if (inc.lon != null && inc.lat != null) return projectPoint(inc.lon, inc.lat);
    return [inc.cx ?? 400, inc.cy ?? 280];
  };

  // Map event loc → country name (TopoJSON properties.name)
  const locToCountry = (loc) => {
    const s = (loc || "").toLowerCase();
    if (/iraq|basra|baghdad|mosul/i.test(s)) return "Iraq";
    if (/iran|tehran|isfahan|hormuz|strait/i.test(s)) return "Iran";
    if (/kuwait/i.test(s)) return "Kuwait";
    if (/uae|dubai|abu dhabi|emirates|sharjah/i.test(s)) return "United Arab Emirates";
    if (/saudi|riyadh|jeddah|mecca/i.test(s)) return "Saudi Arabia";
    if (/oman|muscat/i.test(s)) return "Oman";
    if (/yemen|aden|sana/i.test(s)) return "Yemen";
    if (/qatar|doha/i.test(s)) return "Qatar";
    if (/bahrain/i.test(s)) return "Bahrain";
    if (/jordan|amman/i.test(s)) return "Jordan";
    if (/israel|tel aviv|jerusalem|gaza/i.test(s)) return "Israel";
    if (/syria|damascus/i.test(s)) return "Syria";
    if (/lebanon|beirut/i.test(s)) return "Lebanon";
    if (/egypt|cairo|sinai|alexandria/i.test(s)) return "Egypt";
    if (/turkey|ankara|istanbul/i.test(s)) return "Turkey";
    if (/cyprus/i.test(s)) return "Cyprus";
    if (/palestine|west bank|gaza/i.test(s)) return "Palestine";
    if (/pakistan|karachi|islamabad/i.test(s)) return "Pakistan";
    if (/afghanistan|kabul/i.test(s)) return "Afghanistan";
    return null;
  };

  const severityRank = { strike: 3, warning: 2, safe: 1 };
  const countryStatus = {};
  allEvents.forEach(inc => {
    const country = locToCountry(inc.loc);
    if (country && (!countryStatus[country] || severityRank[inc.type] > severityRank[countryStatus[country].type])) {
      countryStatus[country] = { type: inc.type, color: inc.color };
    }
  });
  const statusFill = (name) => {
    const s = countryStatus[name];
    if (s?.type === "strike") return "rgba(254,226,226,0.6)";
    if (s?.type === "warning") return "rgba(254,243,199,0.6)";
    if (s?.type === "safe") return "rgba(220,252,231,0.6)";
    return "rgba(241,245,249,0.85)";
  };

  const MIN_LABEL_AREA = 4000;

  return (
    <div ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-slate-200"
      style={{ height: 480, cursor: dragging ? "grabbing" : "grab", touchAction: "none", userSelect: "none", background: "#f8fafc" }}
      onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove}
    >
      <svg viewBox="0 0 800 480" width="800" height="480"
        style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%",
          transform:`translate(${tr.x}px,${tr.y}px) scale(${tr.scale})`,
          transformOrigin:"0 0", transition: dragging ? "none" : "transform 0.08s ease-out" }}>
        <defs>
          <pattern id="g2" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0L0 0 0 40" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="0.5"/>
          </pattern>
          <radialGradient id="rR" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ef4444" stopOpacity="0.22"/><stop offset="100%" stopColor="#ef4444" stopOpacity="0"/></radialGradient>
          <radialGradient id="rA" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2"/><stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/></radialGradient>
          <radialGradient id="rG" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.18"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0"/></radialGradient>
          <filter id="fR" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="fG" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        <rect width="800" height="480" fill="url(#g2)"/>
        {geography ? (
          <g>
            {geography.features.map((d, i) => {
              const p = pathGenerator(d);
              if (!p) return null;
              const name = d.properties?.name || "";
              const bounds = pathGenerator.bounds(d);
              const area = (bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]);
              const showLabel = area >= MIN_LABEL_AREA;
              let centroid;
              try { centroid = pathGenerator.centroid(d); } catch (_) { centroid = null; }
              return (
                <g key={i}>
                  <path d={p} fill={statusFill(name)} stroke="#cbd5e1" strokeWidth="0.8"/>
                  {showLabel && centroid && (
                    <text x={centroid[0]} y={centroid[1]} fontFamily="DM Mono,monospace" fontSize={area > 15000 ? 9 : 7} fill="#64748b" textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none" }}>
                      {name.length > 12 ? name.replace(/\s+(of|the)\s+/gi, " ").slice(0, 14) : name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ) : (
          <>
            <polygon points="500,80 560,70 620,90 650,130 640,180 600,210 560,220 520,200 490,170 480,130" fill="rgba(254,226,226,0.5)" stroke="#fca5a5" strokeWidth="1.2" strokeDasharray="5,3"/>
            <polygon points="430,130 480,130 490,170 480,230 450,260 410,250 390,220 400,180 410,150" fill="rgba(254,243,199,0.5)" stroke="#fcd34d" strokeWidth="1.2" strokeDasharray="5,3"/>
            <polygon points="470,260 500,255 510,280 490,295 465,285" fill="rgba(254,243,199,0.5)" stroke="#fcd34d" strokeWidth="1" strokeDasharray="4,3"/>
            <polygon points="390,220 450,260 465,285 510,280 520,320 500,380 450,400 370,390 330,340 320,290 350,250" fill="rgba(241,245,249,0.7)" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4,3"/>
            <polygon points="520,320 560,300 580,310 570,340 530,350 510,340" fill="rgba(220,252,231,0.7)" stroke="#86efac" strokeWidth="1.5"/>
            <polygon points="570,340 620,320 650,350 640,400 600,420 570,400 560,370" fill="rgba(241,245,249,0.7)" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4,3"/>
            <polygon points="320,100 370,90 390,120 380,160 350,170 310,150" fill="rgba(241,245,249,0.6)" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="4,3"/>
            <polygon points="280,30 400,20 430,60 400,80 360,70 300,75 260,60" fill="rgba(241,245,249,0.5)" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="4,3"/>
          </>
        )}

        {/* Status dots rendered first so country/city labels draw on top */}
        {allEvents.map(inc => {
          const [cx, cy] = getEventPos(inc);
          return (
          <g key={inc.id} data-marker="true" style={{ cursor: "pointer" }}
            onClick={e => { e.stopPropagation(); setTooltip(t => t?.id === inc.id ? null : inc); }}>
            <circle cx={cx} cy={cy}
              r={inc.type === "strike" ? 28 : inc.type === "warning" ? 22 : 18}
              fill={inc.type === "strike" ? "url(#rR)" : inc.type === "warning" ? "url(#rA)" : "url(#rG)"}
              style={{ width: "fit-content" }}>
              {inc.type !== "safe" && <>
                <animate attributeName="r" values={inc.type === "strike" ? "18;34;18" : "14;26;14"} dur={inc.type === "strike" ? "3s" : "4s"} repeatCount="indefinite"/>
                <animate attributeName="opacity" values="1;0.2;1" dur={inc.type === "strike" ? "3s" : "4s"} repeatCount="indefinite"/>
              </>}
            </circle>
            <circle cx={cx} cy={cy} r={inc.type === "safe" ? 5 : 7}
              fill={inc.color} filter={inc.type === "strike" ? "url(#fR)" : "none"}
              style={{ width: "fit-content" }}/>
          </g>
        );})}

        {allEvents.map(inc => {
          const [cx, cy] = getEventPos(inc);
          return (
          <g key={`label-${inc.id}`} data-marker="true" style={{ cursor: "pointer" }}
            onClick={e => { e.stopPropagation(); setTooltip(t => t?.id === inc.id ? null : inc); }}>
            <circle cx={cx} cy={cy} r={32} fill="transparent"/>
            <text x={cx} y={cy + 24} fontFamily="DM Mono,monospace" fontSize="8.5"
              fill={inc.color} textAnchor="middle" fontWeight="700" style={{ pointerEvents: "none", width: "fit-content" }}>
              {inc.loc?.slice(0, 18) || inc.label?.slice(0, 10)}
            </text>
          </g>
        );})}

        <g transform="translate(28,458)">
          <rect x="-4" y="-14" width="96" height="20" rx="3" fill="rgba(255,255,255,0.92)"/>
          <line x1="0" y1="0" x2="80" y2="0" stroke="#94a3b8" strokeWidth="1.5"/>
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#94a3b8" strokeWidth="1.5"/>
          <line x1="80" y1="-4" x2="80" y2="4" stroke="#94a3b8" strokeWidth="1.5"/>
          <text x="40" y="-5" textAnchor="middle" fontFamily="DM Mono,monospace" fontSize="8" fill="#94a3b8">~200 km</text>
        </g>
      </svg>

      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 p-3 shadow-sm pointer-events-none" style={{ zIndex:10 }}>
        <p className="font-heading text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Legend</p>
        {[["#ef4444","Active Strike"],["#f59e0b","Warning Zone"],["#22c55e","Secure / Safe"]].map(([c,l]) => (
          <div key={l} className="flex items-center gap-2 mb-1.5 last:mb-0">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }}/><span className="text-xs text-slate-600">{l}</span>
          </div>
        ))}
      </div>

      <div className="absolute top-3 right-12 bg-white/95 backdrop-blur-sm rounded-md border border-slate-200 px-2 py-1 shadow-sm pointer-events-none" style={{ zIndex:10 }}>
        <span className="text-[10px] font-mono text-slate-500">
          {loading ? "Loading GDELT…" : `GDELT Live · ${allEvents.length} events · 7 days`}
        </span>
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1" style={{ zIndex:10 }}>
        {[{label:"+",fn:zoomIn},{label:"−",fn:zoomOut},{label:null,fn:reset}].map((b,i) => (
          <button key={i} onClick={b.fn} className="w-8 h-8 bg-white border border-slate-200 rounded-md shadow-sm flex items-center justify-center text-slate-700 hover:bg-slate-50 cursor-pointer text-lg font-bold leading-none">
            {b.label || <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>}
          </button>
        ))}
      </div>

      <div className="absolute bottom-3 left-3 bg-white/90 border border-slate-200 rounded-md px-2 py-1 shadow-sm pointer-events-none" style={{ zIndex:10 }}>
        <span className="text-[10px] font-mono text-slate-500">{Math.round(tr.scale * 100)}%</span>
      </div>

      {tr.scale === 1 && tr.x === 0 && !tooltip && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-800/70 text-white text-[10px] px-3 py-1.5 rounded-full pointer-events-none whitespace-nowrap" style={{ zIndex:10 }}>
          Scroll to zoom · Drag to pan · Click marker for details
        </div>
      )}

      {tooltip && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-xl shadow-lg p-4 w-64" style={{ zIndex:20 }}>
          <button onClick={() => setTooltip(null)} className="absolute top-2.5 right-3 text-slate-400 hover:text-slate-700 text-xl cursor-pointer">×</button>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: tooltip.color }}/>
            <p className="font-bold text-sm text-slate-900">{tooltip.loc}</p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-2">{tooltip.detail}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={tooltip.type === "strike" ? "destructive" : tooltip.type === "warning" ? "warning" : "success"} className="text-[10px]">
              {tooltip.type === "strike" ? "Active Strike" : tooltip.type === "warning" ? "Warning Zone" : "Secure"}
            </Badge>
            {tooltip.url && tooltip.url !== "#" && (
              <a href={tooltip.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                View source <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-xl" style={{ zIndex:30 }}>
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-white px-4 py-2 rounded-lg shadow border border-slate-200">
            <Spinner size={18}/> Loading live data from GDELT…
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Guideline Accordion
// ─────────────────────────────────────────────────────────────
const GuidelineAccordion = ({ item }) => {
  const [open, setOpen] = useState(item.phase === "01");
  const c = { amber: { border:"border-amber-200", bg:"bg-amber-50", num:"text-amber-500" }, red: { border:"border-red-200", bg:"bg-red-50", num:"text-red-500" }, green: { border:"border-green-200", bg:"bg-green-50", num:"text-green-500" } }[item.color];
  return (
    <div className={cn("rounded-xl border overflow-hidden", open ? c.border : "border-slate-200")}>
      <button className={cn("w-full flex items-center gap-4 p-4 text-left transition-colors cursor-pointer", open ? c.bg : "bg-white hover:bg-slate-50")} onClick={() => setOpen(!open)}>
        <span className={cn("font-black text-3xl leading-none w-8", open ? c.num : "text-slate-300")}>{item.phase}</span>
        <div className="flex-1"><p className="font-heading font-bold text-slate-900">{item.title}</p><p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={cn("text-slate-400 transition-transform", open && "rotate-180")}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="p-4 bg-white border-t border-slate-100 space-y-3">
          {item.kit && <div className="grid grid-cols-3 gap-2 mb-4">{item.kit.map((k,i) => <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-slate-700 text-center">{k}</div>)}</div>}
          {item.steps.map((s,i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
              <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
              <div><p className="font-heading font-semibold text-sm text-slate-900 mb-0.5">{s.title}</p><p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Setup Banner
// ─────────────────────────────────────────────────────────────
const SetupBanner = ({ hasKey }) => hasKey ? null : (
  <Alert variant="warning" className="mb-4">
    <AlertTitle>⚙️ Add your NewsAPI key for live news articles</AlertTitle>
    <AlertDescription>
      <span className="block mt-1">1. Register free at <a href="https://newsapi.org/register" target="_blank" className="underline font-semibold text-amber-900">newsapi.org/register</a> · 2. Copy your key · 3. Add <code className="bg-amber-100 px-1 rounded text-[11px]">VITE_NEWS_API_KEY=your_key</code> to <code className="bg-amber-100 px-1 rounded text-[11px]">.env</code></span>
      <span className="block mt-1.5 text-amber-700 text-xs">✅ Map data (GDELT) and AI summaries (Claude) are already live — no additional keys needed.</span>
    </AlertDescription>
  </Alert>
);

// ─────────────────────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────────────────────
export default function SafeDXB() {
  const [tab, setTab] = useState("dashboard");
  const [time, setTime] = useState("");
  const [filter, setFilter] = useState("all");
  const [liveNewsFilter, setLiveNewsFilter] = useState(null);
  const liveNewsRef = useRef(null);

  const { news, loading: nLoading, error: nError, lastUpdated, refetch } = useLiveNews();
  const { events: mapEvents, loading: mLoading } = useGdeltMap();
  const { bullets, loading: aiLoading, error: aiError, regenerate } = useClaudeSummary(news);
  const userLoc = useUserLocation();

  const hasKey = !!CONFIG.NEWS_API_KEY;

  useEffect(() => {
    const t = () => setTime(new Date().toLocaleTimeString("en-US", { timeZone:"Asia/Dubai", hour12:false, hour:"2-digit", minute:"2-digit", second:"2-digit" }));
    t(); const id = setInterval(t, 1000); return () => clearInterval(id);
  }, []);

  const highCount = news.filter(n => n.severity === "high").length;
  const missileCount = news.filter(n => /missile|ballistic|rocket|strike|explosion|blast/i.test(n.title)).length;
  const locRisk = assessLocationRisk(userLoc.country || "", userLoc.city || "");
  const status = computeStatus(news, userLoc.city || "", userLoc.country || "");
  const filtered  = news.filter(n => filter === "all" || n.severity === filter);
  const regionCounts = news.reduce((a, n) => { a[n.region] = (a[n.region] || 0) + 1; return a; }, {});

  const TabIcon = ({ id, className }) => {
    const icons = {
      dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
      news: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>,
      map: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/><path d="M2 8l7-3 5 2 7-3"/><path d="M2 16l7-3 5 2 7-3"/></svg>,
      guidelines: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
      hotlines: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    };
    return <span className={cn("flex items-center justify-center", className)}>{icons[id] || null}</span>;
  };
  const TABS = [
    { id:"dashboard",  label:"Dashboard",        badge: null },
    { id:"news",       label:"Latest News",       badge: news.length },
    { id:"map",        label:"Strike Map",        badge: mapEvents.filter(e => e.type==="strike").length || null },
    { id:"guidelines", label:"Safety Guidelines", badge: null },
    { id:"hotlines",   label:"Hotlines",          badge: null },
  ];

  const HCard = ({ h }) => {
    const border = { red:"border-red-200 hover:border-red-300", green:"border-green-200 hover:border-green-300", blue:"border-blue-200 hover:border-blue-300", amber:"border-amber-200 hover:border-amber-300", slate:"border-slate-200 hover:border-slate-300" };
    const num    = { red:"text-red-600", green:"text-green-600", blue:"text-blue-600", amber:"text-amber-600", slate:"text-slate-700" };
    const btn    = { red:"bg-red-50 text-red-700 hover:bg-red-100", green:"bg-green-50 text-green-700 hover:bg-green-100", blue:"bg-blue-50 text-blue-700 hover:bg-blue-100", amber:"bg-amber-50 text-amber-700 hover:bg-amber-100", slate:"bg-slate-50 text-slate-700 hover:bg-slate-100" };
    return (
      <div className={cn("rounded-xl border bg-white p-5 flex flex-col items-center text-center transition-all hover:shadow-md gap-1", border[h.color])}>
        <span className="text-3xl mb-1">{h.emoji}</span>
        <p className="font-heading font-bold text-slate-900 text-sm uppercase tracking-wide">{h.name}</p>
        <p className={cn("font-black text-2xl leading-none my-1", num[h.color])}>{h.number}</p>
        <p className="text-xs text-slate-500 mb-2">{h.desc}</p>
        <a href={`tel:${h.tel}`} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors", btn[h.color])}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.14a16 16 0 006 6l1.41-1.41a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          Call Now
        </a>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily:"'DM Sans','Geist',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}body{margin:0}
        .ticker-wrap{overflow:hidden}
        .ticker-inner{display:flex;animation:ticker 12s linear infinite;white-space:nowrap}
        @keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .animate-spin{animation:spin 1s linear infinite}
        @keyframes pulse2{0%,100%{opacity:1}50%{opacity:.4}}
        .animate-pulse{animation:pulse2 2s ease-in-out infinite}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp 0.3s ease both}
      `}</style>

      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center"><span className="text-white font-black text-sm">S</span></div>
            <span className="font-heading font-black text-slate-900 text-lg tracking-tight">Safe<span className="text-red-600">DXB</span></span>
            <Badge variant="destructive" className="hidden sm:flex gap-1 animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>LIVE</Badge>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-mono">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Dubai {time} GST+4
          </div>
          <a href="tel:999" className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors shadow-sm cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.14a16 16 0 006 6l1.41-1.41a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            Emergency 999
          </a>
        </div>
        {news.length > 0 && (
          <div className="ticker-wrap bg-slate-900 text-white border-t border-slate-700 py-1.5">
            <div className="ticker-inner gap-0">
              {[...news.slice(0,10),...news.slice(0,10)].map((n,i) => (
                <span key={i} className="text-xs text-white font-medium shrink-0 mr-14">
                  {n.severity==="high"?"🔴":n.severity==="medium"?"🟡":"🟢"} {n.title}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="bg-white border-b border-slate-200 z-40">
          <div className="max-w-screen-xl mx-auto pl-6 pr-0 py-2 relative">
            <div className="overflow-x-auto">
              <div className="flex gap-1">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all cursor-pointer font-heading",
                    tab===t.id?"bg-slate-900 text-white shadow-sm":"text-slate-600 hover:text-slate-900 hover:bg-slate-100")}>
                    <TabIcon id={t.id}/>
                    {t.label}
                    {t.badge ? <span className={cn("text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-6 inline-flex items-center justify-center",tab===t.id?"bg-white text-slate-900":"bg-red-500 text-white")}>{t.badge}</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
              style={{ background: 'linear-gradient(to right, transparent, white)' }}
              aria-hidden
            />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 fade-up bg-white">
        {tab === "dashboard" && (
          <div className="space-y-6">
            {(() => {
              const isLoading = (nLoading && !news.length) || userLoc.loading;
              return (
                <div
                  className="rounded-2xl overflow-hidden border-2 transition-all duration-700"
                  style={{ borderColor: isLoading ? "#e2e8f0" : status.borderColor, background: `linear-gradient(135deg, ${isLoading ? "#f8fafc" : status.gradientFrom} 0%, ${isLoading ? "#f1f5f9" : status.gradientTo} 100%)` }}
                >
                  <div className="px-6 py-4 flex flex-col gap-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap h-8">
                      <div className="flex items-center gap-1.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400 flex-shrink-0"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
                        {userLoc.loading
                          ? <div className="h-3 bg-slate-200 rounded animate-pulse w-32"/>
                          : <span className="text-xs font-medium text-slate-500">{userLoc.city}{userLoc.country ? `, ${userLoc.country}` : ""} <span className="text-slate-400">· live location</span></span>
                        }
                      </div>
                      {!isLoading && lastUpdated && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          <button onClick={refetch} className="hover:text-slate-600 cursor-pointer transition-colors">
                            Updated {formatTimeAgo(lastUpdated.toISOString())} · tap to refresh
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-end justify-between gap-6">
                      <div className="flex-1 min-w-0">
                        {isLoading ? (
                          <div className="space-y-2">
                            <div className="h-12 bg-slate-200/70 rounded-xl animate-pulse w-40"/>
                            <div className="h-4 bg-slate-200/70 rounded animate-pulse w-64"/>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-end gap-3 mb-2">
                              <span className="font-heading font-black leading-none tracking-tight" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", color: status.pulseColor }}>{status.label}</span>
                              <div className="flex items-end gap-0.5 h-8">
                                {[1,2,3,4].map(l => {
                                  const w = l === 1 ? 10 : l === 2 ? 10 : l === 3 ? 10 : 12;
                                  return (
                                    <div key={l} className="rounded transition-all duration-700 flex-shrink-0 h-full" style={{
                                      width: w,
                                      background: isLoading ? "#e2e8f0" : (status.level >= l ? status.barColors[l-1] : "#e2e8f0"),
                                      boxShadow: !isLoading && status.level === l ? `0 0 8px ${status.barColors[l-1]}80` : "none"
                                    }}/>
                                  );
                                })}
                              </div>
                              {status.level > 1 && <span className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse" style={{ background: status.pulseColor }}/>}
                            </div>
                            <p className={cn("text-sm font-semibold mb-1.5", status.color)}>{status.sub}</p>
                            <p className="text-xs text-slate-500 leading-relaxed max-w-lg">{status.desc}</p>
                            {status.reason && (
                              <p className="text-xs text-slate-600 mt-2 max-w-lg"><span className="font-medium text-slate-600">Based on: </span><span className="text-slate-500">{status.reason.length > 140 ? status.reason.slice(0, 137) + "…" : status.reason}</span></p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {!isLoading && (
                      <div className="flex items-center flex-wrap gap-2 pt-4 border-t" style={{ borderColor: `${status.borderColor}60` }}>
                        {missileCount > 0 && (
                          <button onClick={() => { setLiveNewsFilter("missile"); liveNewsRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-red-100 text-red-700 border border-red-200 rounded-full px-3 py-1 hover:bg-red-200/50 transition-colors cursor-pointer">🎯 {missileCount} missile/strike report{missileCount > 1 ? "s" : ""}</button>
                        )}
                        {highCount > 0 && (
                          <button onClick={() => { setLiveNewsFilter("high"); liveNewsRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-3 py-1 hover:bg-orange-200/50 transition-colors cursor-pointer">🔴 {highCount} high-severity alert{highCount > 1 ? "s" : ""}</button>
                        )}
                        {news.filter(n => n.severity === "medium").length > 0 && (
                          <button onClick={() => { setLiveNewsFilter("medium"); liveNewsRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-200/50 transition-colors cursor-pointer">🟡 {news.filter(n => n.severity === "medium").length} developing</button>
                        )}
                        {missileCount === 0 && highCount === 0 && <span className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-green-100 text-green-700 border border-green-200 rounded-full px-3 py-1">✓ No active threats detected</span>}
                        {status.action && <span className="basis-full"><button onClick={() => setTab(status.actionLink)} className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-1.5 h-12 rounded-full text-white transition-all hover:opacity-90 cursor-pointer min-w-[220px]" style={{ background: status.pulseColor }}>{status.action}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button></span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div ref={liveNewsRef} className="lg:col-span-2 space-y-5 min-w-0">
                <AISummaryPanel bullets={bullets} loading={aiLoading} error={aiError} lastUpdated={lastUpdated} onRegenerate={regenerate} bulletFilter={liveNewsFilter} onClearFilter={() => setLiveNewsFilter(null)} hasNews={news.length > 0}/>
              </div>
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle>Quick Dial</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {[["🚒 Fire","997","red"],["🚑 Ambulance","998",""],["🚔 Police","999",""]].map(([l,n,col])=>(<a key={n} href={`tel:${n}`} className={cn("flex items-center justify-between p-3 rounded-lg border text-sm font-semibold transition-all hover:shadow-sm", col==="red"?"bg-red-50 border-red-200 text-red-700 hover:bg-red-100":"bg-white border-slate-200 text-slate-800 hover:bg-slate-50")}><span>{l}</span><span className="font-black text-lg">{n}</span></a>))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
        {tab === "news" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-700 mr-1">Filter:</p>
                {[["all","All","secondary"],["high","High","destructive"],["medium","Medium","warning"],["low","Low","success"]].map(([v,l,variant])=>(<button key={v} onClick={()=>setFilter(v)} className={cn("cursor-pointer transition-opacity h-full min-w-[70px] rounded-full",filter===v?"shadow-none":"opacity-60 hover:opacity-100")}><Badge variant={variant} className={cn("min-w-[70px] justify-center",filter===v&&variant==="secondary"?"!bg-slate-900 !text-slate-100":"")}>{l}</Badge></button>))}
                <div className="ml-auto flex items-center gap-2">{nLoading&&<Spinner size={13}/>}<span className="text-xs text-slate-400">{filtered.length} articles</span>{lastUpdated&&<span className="text-xs text-slate-400">· {formatTimeAgo(lastUpdated.toISOString())}</span>}</div>
              </div>
              {nLoading&&!news.length ? [...Array(5)].map((_,i)=><SkeletonCard key={i}/>) : filtered.length===0 ? <div className="text-center py-12 text-slate-400"><p className="text-lg">No articles found</p><p className="text-sm mt-1">{hasKey?"Try a different filter":"Add your NewsAPI key to see live news"}</p></div> : filtered.map(n=><NewsCard key={n.id} item={n}/>)}
            </div>
          </div>
        )}
        {tab === "map" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div><h2 className="font-heading font-black text-xl text-slate-900">Regional Strike Map</h2><p className="text-sm text-slate-500 mt-0.5">Powered by GDELT · Geo-located conflict events · Last 7 days</p></div>
              <Badge variant="destructive" className="gap-1.5 animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>{mLoading?"Loading…":`${mapEvents.filter(e=>e.type==="strike").length} Active Events`}</Badge>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2"><StrikeMap events={mapEvents} loading={mLoading}/></div>
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle>Live Events</CardTitle></CardHeader>
                  <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                    {mLoading ? [...Array(4)].map((_,i)=><div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse"/>) : mapEvents.map(e=>{const airportStatus=isCityOrCountry(e.loc)?(e.type==="strike"?{text:"Airport closed",cls:"bg-red-100 text-red-800",icon:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>}:e.type==="warning"?{text:"Check before travel",cls:"bg-amber-100 text-amber-800",icon:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>}:{text:"Airport open",cls:"bg-green-100 text-green-800",icon:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2l-1.8-7.2"/></svg>}):null;return(<div key={e.id} className={cn("rounded-lg border p-3", e.type==="strike"?"border-red-200 bg-red-50":e.type==="warning"?"border-amber-200 bg-amber-50":"border-green-200 bg-green-50")}><div className="flex items-start gap-2 justify-center"><div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{background:e.color}}/><div className="flex-1 min-w-0"><p className="font-bold text-xs text-slate-900 truncate">{e.loc}</p><p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{e.detail}</p>{e.url&&e.url!=="#"&&<a href={e.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-1">Source <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>}</div>{airportStatus&&<span className={cn("flex-shrink-0 flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-md self-center",airportStatus.cls)}>{airportStatus.icon}{airportStatus.text}</span>}</div></div>);})}
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-100"><CardContent className="pt-4 pb-4"><p className="font-heading text-xs font-semibold text-blue-800 mb-2">🌐 About GDELT</p><p className="text-xs text-blue-700 leading-relaxed">GDELT monitors global news in real-time and geo-tags conflict events using NLP. Coordinates are approximate. Free, no key needed, updated continuously.</p></CardContent></Card>
              </div>
            </div>
          </div>
        )}
        {tab === "guidelines" && (
          <div className="space-y-6">
            <Alert variant="warning"><AlertTitle>⚠ Stay Prepared — Review all phases below</AlertTitle><AlertDescription>Dubai remains secure. Familiarise yourself with protocols now so you can act quickly if needed.</AlertDescription></Alert>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">{GUIDELINES.map(g=><GuidelineAccordion key={g.phase} item={g}/>)}</div>
              <div className="space-y-4">
                <Card className="border-red-200 bg-red-50">
                  <CardHeader className="pb-2"><CardTitle className="text-red-800">⚡ Quick Reference</CardTitle></CardHeader>
                  <CardContent><p className="font-heading text-xs font-bold text-red-700 uppercase tracking-wider mb-2">If Alert Sounds:</p><ol className="space-y-1.5">{["STOP what you're doing","MOVE to interior room","CLOSE all windows","STAY away from glass","MONITOR official alerts","WAIT for all-clear"].map((s,i)=><li key={i} className="flex items-center gap-2 text-xs text-red-800"><span className="font-black text-red-500 w-4">{i+1}.</span>{s}</li>)}</ol><Separator className="my-3"/><p className="font-heading text-xs font-bold text-red-700 uppercase tracking-wider mb-2">Never Do:</p>{["Go to the rooftop","Film from windows","Spread rumours","Use elevators","Ignore sirens"].map((s,i)=><p key={i} className="text-xs text-red-700 flex items-center gap-1.5 mb-1"><span className="text-red-400">✗</span>{s}</p>)}</CardContent>
                </Card>
                <Card><CardHeader className="pb-2"><CardTitle>Official Channels</CardTitle></CardHeader><CardContent className="space-y-2">{[["UAE Civil Defense","@UAE_CD"],["MOD UAE","@modgovae"],["UAE Government","@UAEGov"],["NCEMA","@NCEMAuae"]].map(([n,h])=>(<div key={n} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0"><span className="text-sm text-slate-700">{n}</span><span className="text-xs font-mono text-blue-600">{h}</span></div>))}</CardContent></Card>
              </div>
            </div>
          </div>
        )}
        {tab === "hotlines" && (
          <div className="space-y-6">
            <Alert><AlertTitle>💡 In any life-threatening emergency, call 999 first</AlertTitle><AlertDescription>Operators dispatch police, fire, or ambulance from a single call. Keep other lines clear for non-critical issues.</AlertDescription></Alert>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{HOTLINES.map(h=><HCard key={h.name} h={h}/>)}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[{ title:"Hospitals", items:[["Rashid Hospital","+971 4 219 2000"],["DHA Emergency","800 342"],["Cleveland Clinic AUH","+971 2 501 0800"],["American Hospital DXB","+971 4 336 7777"]] },{ title:"More Embassies", items:[["🇺🇸 US Embassy AUH","+971 2 414 2200"],["🇮🇳 India Consulate","+971 4 397 1222"],["🇵🇭 Philippines","+971 4 220 7100"],["🇨🇦 Canada","+971 2 694 0300"]] },{ title:"Utilities", items:[["DEWA Emergency","991"],["Gas Leaks","800 ADGAS"],["Traffic Accidents","800 DUBAI"],["Coast Guard UAE","800 4666"]] }].map(sec=>(<Card key={sec.title}><CardHeader className="pb-2"><CardTitle>{sec.title}</CardTitle></CardHeader><CardContent className="space-y-1">{sec.items.map(([n,num])=>(<a key={n} href={`tel:${num.replace(/\s/g,"")}`} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded px-1 transition-colors group"><span className="text-sm text-slate-700">{n}</span><span className="text-xs font-mono font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{num}</span></a>))}</CardContent></Card>))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-8 py-4 px-6">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
          <span>SafeDXB — Live Regional Safety Monitor for Dubai residents</span>
          <span className="flex items-center gap-3"><span>News: NewsAPI.org</span><span>·</span><span>Map: GDELT Project</span><span>·</span><span>AI: Claude Sonnet</span><span>·</span><span>Auto-refresh: 5min</span></span>
        </div>
      </footer>
    </div>
  );
}

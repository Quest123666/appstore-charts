import fs from "node:fs/promises";
import path from "node:path";
import gplay from "google-play-scraper";

const TYPES = [
  {
    id: "apps",
    label: "应用",
    category: gplay.category.APPLICATION,
  },
  {
    id: "games",
    label: "游戏",
    category: gplay.category.GAME,
  },
];

const CHARTS = [
  {
    id: "free",
    label: "免费榜",
    collection: gplay.collection.TOP_FREE,
  },
  {
    id: "paid",
    label: "付费榜",
    collection: gplay.collection.TOP_PAID,
  },
  {
    id: "grossing",
    label: "畅销榜",
    collection: gplay.collection.GROSSING,
  },
];

const COUNTRIES = [
  {
    id: "us",
    label: "美国",
    lang: "en",
    charts: ["free", "paid", "grossing"],
  },
  {
    id: "cn",
    label: "中国",
    lang: "zh",
    // Google Play 中国区没有付费应用，付费榜为空。
    charts: ["free", "grossing"],
  },
];

const LIMIT = 100;
const OUT_DIR = path.resolve("public/data");

function formatPrice(price, currencyCode) {
  const code =
    typeof currencyCode === "string" &&
    /^[A-Z]{3}$/.test(currencyCode)
      ? currencyCode
      : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(price);
  } catch {
    return String(price);
  }
}

function safeIcon(raw) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !/(^|\.)googleusercontent\.com$/.test(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safePlayUrl(raw, appId) {
  const fallback = appId
    ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(
        appId,
      )}`
    : null;
  if (typeof raw !== "string") return fallback;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "play.google.com" ||
      url.pathname !== "/store/apps/details"
    ) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Google Play 在连续请求后会临时少返回条目（常见 20 条），最多重试 3 次取最大结果。
async function fetchChart(country, type, chart, attempts = 3) {
  let best = [];
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const apps = await gplay.list({
        category: type.category,
        collection: chart.collection,
        country: country.id,
        lang: country.lang,
        num: LIMIT,
      });
      if (Array.isArray(apps) && apps.length > best.length) {
        best = apps;
      }
      if (best.length >= LIMIT) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(1500 * attempt);
  }

  if (best.length > 0) return best;
  throw lastError || new Error("empty chart response");
}

await fs.mkdir(OUT_DIR, { recursive: true });
const now = new Date().toISOString();
let failures = 0;

for (const country of COUNTRIES) {
  for (const type of TYPES) {
    for (const chart of CHARTS) {
      if (!country.charts.includes(chart.id)) continue;
      try {
        const apps = await fetchChart(country, type, chart);

        const results = apps.map((app, index) => {
          const price = Number.isFinite(Number(app.price))
            ? Number(app.price)
            : 0;
          const free = Boolean(app.free) || price === 0;
          return {
            rank: index + 1,
            id: String(app.appId || ""),
            name: String(app.title || ""),
            artist: String(app.developer || ""),
            icon: safeIcon(app.icon),
            url: safePlayUrl(app.url, app.appId),
            price,
            priceLabel: free
              ? "免费"
              : typeof app.priceText === "string" &&
                  app.priceText.trim()
                ? app.priceText.trim()
                : formatPrice(price, app.currency),
            rating: Number.isFinite(Number(app.score))
              ? Number(app.score)
              : 0,
            ratingText: String(app.scoreText || ""),
          };
        });

        const payload = {
          ok: true,
          store: "google-play",
          country: country.id,
          countryLabel: country.label,
          type: type.id,
          typeLabel: type.label,
          chart: chart.id,
          chartLabel: chart.label,
          count: results.length,
          fetchedAt: now,
          source: "google-play-scraper",
          results,
        };

        const file = path.join(
          OUT_DIR,
          `play-${country.id}-${type.id}-${chart.id}.json`,
        );
        await fs.writeFile(file, JSON.stringify(payload, null, 2));
        console.log(
          `wrote ${path.relative(process.cwd(), file)} (${results.length})`,
        );
        await sleep(800);
      } catch (error) {
        failures += 1;
        console.error(
          `failed ${country.id}/${type.id}/${chart.id}: ${error?.message || error}`,
        );
      }
    }
  }
}

if (failures > 0) {
  console.error(`${failures} Google Play chart(s) failed`);
  process.exitCode = 1;
}

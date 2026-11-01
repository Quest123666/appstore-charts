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

const LIMIT = 100;
const OUT_DIR = path.resolve("public/data");
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

await fs.mkdir(OUT_DIR, { recursive: true });
const now = new Date().toISOString();
let failures = 0;

for (const type of TYPES) {
  for (const chart of CHARTS) {
    try {
      const apps = await gplay.list({
        category: type.category,
        collection: chart.collection,
        country: "us",
        lang: "en",
        num: LIMIT,
      });

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
          priceLabel: free ? "免费" : currency.format(price),
          rating: Number.isFinite(Number(app.score))
            ? Number(app.score)
            : 0,
          ratingText: String(app.scoreText || ""),
        };
      });

      const payload = {
        ok: true,
        store: "google-play",
        country: "us",
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
        `play-us-${type.id}-${chart.id}.json`,
      );
      await fs.writeFile(file, JSON.stringify(payload, null, 2));
      console.log(
        `wrote ${path.relative(process.cwd(), file)} (${results.length})`,
      );
      await sleep(250);
    } catch (error) {
      failures += 1;
      console.error(
        `failed ${type.id}/${chart.id}: ${error?.message || error}`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`${failures} Google Play chart(s) failed`);
  process.exitCode = 1;
}

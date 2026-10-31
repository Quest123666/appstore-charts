const COUNTRIES = new Set(["us", "cn"]);

const PLATFORM_FEEDS = {
  iphone: {
    "top-free": "topfreeapplications",
    "top-paid": "toppaidapplications",
    "top-grossing": "topgrossingapplications",
  },
  ipad: {
    "top-free": "topfreeipadapplications",
    "top-paid": "toppaidipadapplications",
    "top-grossing": "topgrossingipadapplications",
  },
  mac: {
    "top-free": "topfreemacapps",
  },
};

// Apple 的 iTunes 分类 ID（含游戏子分类）。只接受这份白名单，避免把接口变成任意 URL 代理。
const GENRE_IDS = new Set([
  "6000", "6001", "6002", "6003", "6004", "6005", "6006", "6007", "6008",
  "6009", "6010", "6011", "6012", "6013", "6014", "6015", "6016", "6017",
  "6018", "6020", "6021", "6022", "6023", "6024", "6025", "6026", "6027",
  "7001", "7002", "7003", "7004", "7005", "7006", "7007", "7008", "7009",
  "7011", "7012", "7013", "7014", "7015", "7016", "7017", "7018", "7019",
]);

const LIMIT = 100;
const CACHE_SECONDS = 300;
const CACHE_ORIGIN = "https://cache.apppodium.internal";
const lastGoodPayloads = new Map();
const LAST_GOOD_LIMIT = 12;

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function fail(status, code, message) {
  return jsonResponse({ ok: false, error: { code, message } }, status);
}

function getEntries(feed) {
  if (!feed || !feed.entry) return [];
  return Array.isArray(feed.entry) ? feed.entry : [feed.entry];
}

function upgradeArtworkUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/(^|\.)mzstatic\.com$/.test(url.hostname)) {
      return null;
    }
    url.pathname = url.pathname.replace(
      /\/(\d+)x(\d+)bb\.(png|jpg|jpeg)$/i,
      "/256x256bb.$3",
    );
    return url.toString();
  } catch {
    return null;
  }
}

function pickArtwork(entry) {
  const images = entry["im:image"];
  if (!Array.isArray(images) || images.length === 0) return null;
  const largest = images
    .slice()
    .sort(
      (a, b) =>
        Number(b?.attributes?.height || 0) - Number(a?.attributes?.height || 0),
    )[0];
  return upgradeArtworkUrl(largest?.label);
}

function cleanStoreUrl(raw, country, id) {
  const fallback = id ? `https://apps.apple.com/${country}/app/id${id}` : null;
  if (typeof raw !== "string") return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "apps.apple.com") {
      return fallback;
    }
    url.searchParams.delete("uo");
    return url.toString();
  } catch {
    return fallback;
  }
}

function normalizeEntry(entry, rank, country) {
  const id = String(entry?.id?.attributes?.["im:id"] || "").trim();
  const name = String(entry?.["im:name"]?.label || "").trim();
  if (!id || !/^\d{1,12}$/.test(id) || !name) return null;

  const links = Array.isArray(entry.link)
    ? entry.link
    : entry.link
      ? [entry.link]
      : [];
  const alternate = links.find(
    (item) =>
      item?.attributes?.rel === "alternate" &&
      typeof item.attributes.href === "string",
  );

  const priceAmount = Number.parseFloat(entry?.["im:price"]?.attributes?.amount);
  const isFree = Number.isFinite(priceAmount)
    ? priceAmount === 0
    : true;
  const rawPriceLabel = String(entry?.["im:price"]?.label || "").trim();

  return {
    rank,
    id,
    name,
    artist: String(entry?.["im:artist"]?.label || "").trim(),
    category: String(entry?.category?.attributes?.label || "").trim(),
    categoryId: String(entry?.category?.attributes?.["im:id"] || "").trim(),
    icon: pickArtwork(entry),
    url: cleanStoreUrl(alternate?.attributes?.href, country, id),
    price: isFree ? 0 : priceAmount,
    priceLabel: isFree ? "免费" : rawPriceLabel,
    currency: String(entry?.["im:price"]?.attributes?.currency || ""),
    releaseDate: String(entry?.["im:releaseDate"]?.label || ""),
  };
}

function buildCacheKey(params) {
  const query = new URLSearchParams();
  for (const key of ["country", "platform", "chart", "genre"]) {
    if (params[key]) query.set(key, params[key]);
  }
  return `${CACHE_ORIGIN}/api/charts?${query.toString()}`;
}

async function readCache(cacheKey) {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.default.match(new Request(cacheKey));
  } catch {
    return null;
  }
}

function rememberGood(cacheKey, payload) {
  lastGoodPayloads.delete(cacheKey);
  lastGoodPayloads.set(cacheKey, payload);
  if (lastGoodPayloads.size > LAST_GOOD_LIMIT) {
    const oldest = lastGoodPayloads.keys().next().value;
    lastGoodPayloads.delete(oldest);
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const country = url.searchParams.get("country") || "cn";
  const platform = url.searchParams.get("platform") || "iphone";
  const chart = url.searchParams.get("chart") || "top-free";
  const rawGenre = url.searchParams.get("genre");
  const fresh = url.searchParams.get("fresh") === "1";

  if (!COUNTRIES.has(country)) {
    return fail(400, "INVALID_COUNTRY", "不支持的商店地区");
  }
  if (!PLATFORM_FEEDS[platform]) {
    return fail(400, "INVALID_PLATFORM", "不支持的设备类型");
  }
  if (!PLATFORM_FEEDS[platform][chart]) {
    const code =
      platform === "mac" ? "CHART_UNAVAILABLE" : "INVALID_CHART";
    return fail(
      400,
      code,
      platform === "mac"
        ? "Apple 未开放 Mac 付费榜与畅销榜的 RSS 数据"
        : "不支持的榜单类型",
    );
  }
  if (rawGenre !== null && rawGenre !== "" && !GENRE_IDS.has(rawGenre)) {
    return fail(400, "INVALID_GENRE", "不支持的分类");
  }

  const genre = rawGenre && rawGenre !== "" ? rawGenre : null;
  const feedName = PLATFORM_FEEDS[platform][chart];
  const cacheKey = buildCacheKey({ country, platform, chart, genre });

  if (!fresh) {
    const cached = await readCache(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("x-cache", "HIT");
      return new Response(cached.body, {
        status: cached.status,
        headers,
      });
    }
  }

  const feedUrl =
    `https://itunes.apple.com/${country}/rss/${feedName}/limit=${LIMIT}` +
    (genre ? `/genre=${genre}` : "") +
    "/json";

  let upstream;
  try {
    upstream = await fetch(feedUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "AppPodium/1.0 (+Cloudflare Workers)",
      },
    });
  } catch {
    return serveStale(cacheKey);
  }

  if (!upstream.ok) {
    return serveStale(cacheKey);
  }

  let feed;
  try {
    const data = await upstream.json();
    feed = data?.feed;
  } catch {
    return serveStale(cacheKey);
  }

  if (!feed) {
    return serveStale(cacheKey);
  }

  const results = getEntries(feed)
    .map((entry, index) => normalizeEntry(entry, index + 1, country))
    .filter(Boolean);

  const payload = {
    ok: true,
    country,
    platform,
    chart,
    genre,
    count: results.length,
    updated: String(feed.updated?.label || "") || null,
    fetchedAt: new Date().toISOString(),
    results,
  };

  rememberGood(cacheKey, payload);

  const response = jsonResponse(payload, 200, {
    "cache-control": `public, max-age=120, s-maxage=${CACHE_SECONDS}`,
    "x-cache": "MISS",
  });

  if (typeof caches !== "undefined") {
    try {
      context.waitUntil(
        caches.default.put(new Request(cacheKey), response.clone()),
      );
    } catch {
      // 本地预览或运行环境不支持 Cache API 时静默跳过。
    }
  }

  return response;
}

async function serveStale(cacheKey) {
  const cached = await readCache(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("x-cache", "STALE");
    return new Response(cached.body, { status: 200, headers });
  }

  const payload = lastGoodPayloads.get(cacheKey);
  if (payload) {
    return jsonResponse(
      { ...payload, stale: true },
      200,
      { "cache-control": "no-store", "x-cache": "STALE" },
    );
  }

  return fail(502, "UPSTREAM_UNAVAILABLE", "Apple 榜单接口暂时不可用，请稍后重试");
}

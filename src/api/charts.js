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
const FRESH_MS = 5 * 60 * 1000;
const SERVE_STALE_MS = 24 * 60 * 60 * 1000;
const STORAGE_SECONDS = Math.floor(SERVE_STALE_MS / 1000);
const CLIENT_SECONDS = 120;
const UPSTREAM_TIMEOUT_MS = 8000;
const UPSTREAM_ATTEMPTS = 2;
const CACHE_VERSION = 2;
const CACHE_ORIGIN = "https://cache.apppodium.internal";
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

const lastGoodPayloads = new Map();
const LAST_GOOD_LIMIT = 12;
const refreshInFlight = new Map();

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

function fail(status, code, message, extraHeaders = {}) {
  return jsonResponse(
    { ok: false, error: { code, message } },
    status,
    extraHeaders,
  );
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
  const isFree = Number.isFinite(priceAmount) ? priceAmount === 0 : true;
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
  query.set("v", String(CACHE_VERSION));
  return `${CACHE_ORIGIN}/api/charts?${query.toString()}`;
}

async function readCached(cacheKey) {
  if (typeof caches === "undefined") return null;
  try {
    const cached = await caches.default.match(new Request(cacheKey));
    if (!cached) return null;
    const payload = await cached.json();
    if (!payload || !Array.isArray(payload.results)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function writeCached(cacheKey, payload) {
  if (typeof caches === "undefined") return;
  try {
    await caches.default.put(
      new Request(cacheKey),
      new Response(JSON.stringify(payload), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${STORAGE_SECONDS}`,
        },
      }),
    );
  } catch {
    // Cache API 不可用时仍返回数据，不影响用户。
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

function ageOf(payload) {
  const time = Date.parse(payload?.fetchedAt || "");
  return Number.isFinite(time) ? Math.max(0, Date.now() - time) : Infinity;
}

function buildPayload(params, feed, source) {
  const results = getEntries(feed)
    .map((entry, index) => normalizeEntry(entry, index + 1, params.country))
    .filter(Boolean);

  return {
    ok: true,
    country: params.country,
    platform: params.platform,
    chart: params.chart,
    genre: params.genre,
    count: results.length,
    updated: String(feed.updated?.label || "") || null,
    fetchedAt: new Date().toISOString(),
    source,
    results,
  };
}

function upstreamHeaders(result) {
  const headers = {
    "x-upstream-source": "itunes",
    "x-upstream-attempts": String(result?.attempts || 0),
    "x-upstream-status": String(result?.status || 0),
  };
  if (result?.error) headers["x-upstream-error"] = String(result.error);
  return headers;
}

async function fetchFeed(feedUrl, attempt) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    UPSTREAM_TIMEOUT_MS,
  );

  try {
    const response = await fetch(feedUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8",
        "user-agent": USER_AGENTS[attempt % USER_AGENTS.length],
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `http_${response.status}`,
        attempts: attempt + 1,
      };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        status: response.status,
        error: "invalid_json",
        attempts: attempt + 1,
      };
    }

    const feed = data?.feed;
    if (!feed) {
      return {
        ok: false,
        status: response.status,
        error: "missing_feed",
        attempts: attempt + 1,
      };
    }

    return { ok: true, status: response.status, feed, attempts: attempt + 1 };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.name === "AbortError" ? "timeout" : "fetch_failed",
      attempts: attempt + 1,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(feedUrl) {
  let last = {
    ok: false,
    status: 0,
    error: "not_attempted",
    attempts: 0,
  };

  for (let attempt = 0; attempt < UPSTREAM_ATTEMPTS; attempt += 1) {
    last = await fetchFeed(feedUrl, attempt);
    if (last.ok) return last;
    if (attempt < UPSTREAM_ATTEMPTS - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * (attempt + 1)),
      );
    }
  }

  return last;
}

function scheduleRefresh(context, cacheKey, feedUrl, params) {
  if (refreshInFlight.has(cacheKey)) return;

  const promise = (async () => {
    const result = await fetchWithRetry(feedUrl);
    if (!result.ok) return;
    const payload = buildPayload(params, result.feed, "itunes");
    rememberGood(cacheKey, payload);
    await writeCached(cacheKey, payload);
  })()
    .catch(() => {})
    .finally(() => {
      refreshInFlight.delete(cacheKey);
    });

  refreshInFlight.set(cacheKey, promise);
  try {
    context.waitUntil(promise);
  } catch {
    promise.catch(() => {});
  }
}

function respond(payload, options) {
  const { cacheStatus, ageMs, stale = false, upstream = null } = options;
  const body = { ...payload };
  delete body.stale;
  if (stale) body.stale = true;

  return jsonResponse(body, 200, {
    "cache-control": stale
      ? "no-store"
      : `public, max-age=${CLIENT_SECONDS}, s-maxage=300`,
    "x-cache": cacheStatus,
    "x-data-age": String(Math.max(0, Math.round((ageMs || 0) / 1000))),
    ...(upstream ? upstreamHeaders(upstream) : {}),
  });
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
    const code = platform === "mac" ? "CHART_UNAVAILABLE" : "INVALID_CHART";
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
  const params = { country, platform, chart, genre };
  const cacheKey = buildCacheKey(params);

  const cached =
    (await readCached(cacheKey)) ||
    lastGoodPayloads.get(cacheKey) ||
    null;
  const cacheAge = cached ? ageOf(cached) : Infinity;
  const usableCache = Boolean(cached && cacheAge < SERVE_STALE_MS);

  if (!fresh && usableCache) {
    if (cacheAge < FRESH_MS) {
      return respond(cached, {
        cacheStatus: "HIT",
        ageMs: cacheAge,
      });
    }

    // 缓存超过 5 分钟：立即返回旧数据，同时在后台尝试刷新。
    const feedUrl =
      `https://itunes.apple.com/${country}/rss/${feedName}/limit=${LIMIT}` +
      (genre ? `/genre=${genre}` : "") +
      "/json";
    scheduleRefresh(context, cacheKey, feedUrl, params);
    return respond(cached, {
      cacheStatus: "STALE",
      ageMs: cacheAge,
    });
  }

  const feedUrl =
    `https://itunes.apple.com/${country}/rss/${feedName}/limit=${LIMIT}` +
    (genre ? `/genre=${genre}` : "") +
    "/json";

  const result = await fetchWithRetry(feedUrl);

  if (result.ok) {
    const payload = buildPayload(params, result.feed, "itunes");
    rememberGood(cacheKey, payload);
    await writeCached(cacheKey, payload);
    return respond(payload, {
      cacheStatus: "MISS",
      ageMs: 0,
      upstream: result,
    });
  }

  if (usableCache) {
    return respond(cached, {
      cacheStatus: "STALE",
      ageMs: cacheAge,
      stale: true,
      upstream: result,
    });
  }

  const code =
    result.error === "timeout"
      ? "UPSTREAM_TIMEOUT"
      : "UPSTREAM_UNAVAILABLE";
  return fail(
    502,
    code,
    "Apple 榜单接口暂时不可用，请稍后重试",
    upstreamHeaders(result),
  );
}

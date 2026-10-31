const COUNTRIES = new Set(["us", "cn"]);
const MAX_IDS = 100;
const CACHE_ORIGIN = "https://cache.apppodium.internal";
const CACHE_VERSION = 2;
const CACHE_SECONDS = 6 * 60 * 60;
const CLIENT_SECONDS = 600;
const UPSTREAM_TIMEOUT_MS = 9000;
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

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

function parseIds(raw) {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_IDS) return null;
  if (!ids.every((id) => /^\d{1,12}$/.test(id))) return null;
  return [...new Set(ids)];
}

function buildCacheKey(country, ids) {
  const sorted = [...ids].sort();
  return `${CACHE_ORIGIN}/api/apps?v=${CACHE_VERSION}&country=${country}&ids=${sorted.join(",")}`;
}

async function readCached(cacheKey) {
  if (typeof caches === "undefined") return null;
  try {
    const cached = await caches.default.match(new Request(cacheKey));
    if (!cached) return null;
    const payload = await cached.json();
    if (!payload || typeof payload.apps !== "object") return null;
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
          "cache-control": `public, max-age=${CACHE_SECONDS}`,
        },
      }),
    );
  } catch {
    // Cache API 不可用时仍返回数据。
  }
}

async function fetchLookup(country, ids, attempt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://itunes.apple.com/lookup?id=${ids.join(
        ",",
      )}&country=${country}&entity=software`,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8",
          "user-agent": USER_AGENTS[attempt % USER_AGENTS.length],
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return { ok: false, status: response.status, error: `http_${response.status}` };
    }

    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.results)) {
      return { ok: false, status: response.status, error: "invalid_payload" };
    }

    return { ok: true, status: response.status, results: data.results };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.name === "AbortError" ? "timeout" : "fetch_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const country = url.searchParams.get("country") || "cn";
  const ids = parseIds(url.searchParams.get("ids"));

  if (!COUNTRIES.has(country)) {
    return fail(400, "INVALID_COUNTRY", "不支持的商店地区");
  }
  if (!ids) {
    return fail(400, "INVALID_IDS", "最多支持 100 个有效的 App ID");
  }

  const cacheKey = buildCacheKey(country, ids);
  const cached = await readCached(cacheKey);
  if (cached) {
    return jsonResponse(cached, 200, {
      "cache-control": `public, max-age=${CLIENT_SECONDS}`,
      "x-cache": "HIT",
    });
  }

  const result = await fetchLookup(country, ids, 0);
  if (!result.ok) {
    return fail(
      502,
      result.error === "timeout" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      "评分与更新数据暂时不可用",
      {
        "x-upstream-status": String(result.status || 0),
        "x-upstream-error": String(result.error || ""),
      },
    );
  }

  const requested = new Set(ids);
  const apps = {};

  for (const item of result.results) {
    const id = String(item?.trackId || "");
    if (!requested.has(id)) continue;
    apps[id] = {
      rating: Number.isFinite(Number(item.averageUserRating))
        ? Number(item.averageUserRating)
        : 0,
      ratingCount: Number.isFinite(Number(item.userRatingCount))
        ? Number(item.userRatingCount)
        : 0,
      updatedDate: String(item.currentVersionReleaseDate || ""),
      releaseDate: String(item.releaseDate || ""),
      version: String(item.version || ""),
      price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
      priceLabel: String(item.formattedPrice || ""),
    };
  }

  const payload = {
    ok: true,
    country,
    count: Object.keys(apps).length,
    apps,
    fetchedAt: new Date().toISOString(),
  };

  await writeCached(cacheKey, payload);

  return jsonResponse(payload, 200, {
    "cache-control": `public, max-age=${CLIENT_SECONDS}`,
    "x-cache": "MISS",
    "x-upstream-status": String(result.status || 0),
  });
}

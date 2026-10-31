const COUNTRIES = new Set(["us", "cn"]);
const PLATFORMS = new Set(["iphone", "ipad", "mac"]);
const CACHE_SECONDS = 3600;
const CACHE_ORIGIN = "https://cache.apppodium.internal";

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

function safeImageUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/(^|\.)mzstatic\.com$/.test(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeStoreUrl(raw, country, id) {
  const fallback = `https://apps.apple.com/${country}/app/id${id}`;
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

function upgradeScreenshotUrl(raw) {
  const safe = safeImageUrl(raw);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const match = url.pathname.match(/\/(\d+)x(\d+)bb\.(png|jpg|jpeg)$/i);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > 0 && height > 0 && width < 700) {
        const scale = Math.min(3, 720 / width);
        url.pathname = url.pathname.replace(
          /\/(\d+)x(\d+)bb\.(png|jpg|jpeg)$/i,
          `/${Math.round(width * scale)}x${Math.round(
            height * scale,
          )}bb.${match[3]}`,
        );
      }
    }
    return url.toString();
  } catch {
    return safe;
  }
}

function normalizeScreenshots(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(upgradeScreenshotUrl)
    .filter(Boolean)
    .slice(0, 6);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id") || "";
  const country = url.searchParams.get("country") || "cn";
  const platform = url.searchParams.get("platform") || "iphone";

  if (!/^\d{1,12}$/.test(id)) {
    return fail(400, "INVALID_ID", "无效的应用 ID");
  }
  if (!COUNTRIES.has(country)) {
    return fail(400, "INVALID_COUNTRY", "不支持的商店地区");
  }
  if (!PLATFORMS.has(platform)) {
    return fail(400, "INVALID_PLATFORM", "不支持的设备类型");
  }

  const cacheKey =
    `${CACHE_ORIGIN}/api/app?` +
    new URLSearchParams({ id, country, platform }).toString();

  if (typeof caches !== "undefined") {
    try {
      const cached = await caches.default.match(new Request(cacheKey));
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("x-cache", "HIT");
        return new Response(cached.body, { status: 200, headers });
      }
    } catch {
      // Cache API 不可用时继续请求上游。
    }
  }

  let upstream;
  try {
    upstream = await fetch(
      `https://itunes.apple.com/lookup?id=${id}&country=${country}&entity=software`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "AppPodium/1.0 (+Cloudflare Pages)",
        },
      },
    );
  } catch {
    return fail(502, "UPSTREAM_UNAVAILABLE", "暂时无法获取应用详情");
  }

  if (!upstream.ok) {
    return fail(502, "UPSTREAM_UNAVAILABLE", "暂时无法获取应用详情");
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return fail(502, "UPSTREAM_UNAVAILABLE", "应用详情返回格式异常");
  }

  const item = Array.isArray(data?.results)
    ? data.results.find((result) => String(result.trackId) === id)
    : null;

  if (!item) {
    return fail(404, "NOT_FOUND", "该应用在当前商店不可用");
  }

  const screenshots =
    platform === "ipad" && Array.isArray(item.ipadScreenshotUrls)
      ? normalizeScreenshots(item.ipadScreenshotUrls)
      : [];
  const shots = screenshots.length
    ? screenshots
    : normalizeScreenshots(item.screenshotUrls);

  const app = {
    id,
    name: String(item.trackName || ""),
    artist: String(item.artistName || ""),
    icon: safeImageUrl(item.artworkUrl512 || item.artworkUrl100),
    rating: Number.isFinite(Number(item.averageUserRating))
      ? Number(item.averageUserRating)
      : 0,
    ratingCount: Number.isFinite(Number(item.userRatingCount))
      ? Number(item.userRatingCount)
      : 0,
    price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
    priceLabel: String(item.formattedPrice || ""),
    category: String(item.primaryGenreName || ""),
    description: String(item.description || ""),
    screenshots: shots,
    version: String(item.version || ""),
    releaseDate: String(item.releaseDate || ""),
    updatedDate: String(item.currentVersionReleaseDate || ""),
    contentRating: String(item.contentAdvisoryRating || ""),
    storeUrl: safeStoreUrl(item.trackViewUrl, country, id),
  };

  const payload = { ok: true, app, fetchedAt: new Date().toISOString() };
  const response = jsonResponse(payload, 200, {
    "cache-control": `public, max-age=3600, s-maxage=${CACHE_SECONDS}`,
    "x-cache": "MISS",
  });

  if (typeof caches !== "undefined") {
    try {
      context.waitUntil(
        caches.default.put(new Request(cacheKey), response.clone()),
      );
    } catch {
      // 忽略本地环境不支持 Cache API 的情况。
    }
  }

  return response;
}

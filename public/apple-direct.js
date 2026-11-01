(function () {
  "use strict";

  const FEEDS = {
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
  const LIMIT = 100;

  function getEntries(feed) {
    if (!feed || !feed.entry) return [];
    return Array.isArray(feed.entry) ? feed.entry : [feed.entry];
  }

  function upgradeArtworkUrl(raw) {
    if (typeof raw !== "string") return null;
    try {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        !/(^|\.)mzstatic\.com$/.test(url.hostname)
      ) {
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
          Number(b?.attributes?.height || 0) -
          Number(a?.attributes?.height || 0),
      )[0];
    return upgradeArtworkUrl(largest?.label);
  }

  function cleanStoreUrl(raw, country, id) {
    const fallback = id
      ? `https://apps.apple.com/${country}/app/id${id}`
      : null;
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

    const priceAmount = Number.parseFloat(
      entry?.["im:price"]?.attributes?.amount,
    );
    const isFree = Number.isFinite(priceAmount)
      ? priceAmount === 0
      : true;
    const rawPriceLabel = String(
      entry?.["im:price"]?.label || "",
    ).trim();

    return {
      rank,
      id,
      name,
      artist: String(entry?.["im:artist"]?.label || "").trim(),
      category: String(entry?.category?.attributes?.label || "").trim(),
      categoryId: String(
        entry?.category?.attributes?.["im:id"] || "",
      ).trim(),
      icon: pickArtwork(entry),
      url: cleanStoreUrl(alternate?.attributes?.href, country, id),
      price: isFree ? 0 : priceAmount,
      priceLabel: isFree ? "免费" : rawPriceLabel,
      currency: String(
        entry?.["im:price"]?.attributes?.currency || "",
      ),
      releaseDate: String(
        entry?.["im:releaseDate"]?.label || "",
      ),
    };
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, {
      signal,
      cache: "no-store",
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error(`Apple 接口返回 ${response.status}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Apple 返回格式异常");
    }
  }

  async function fetchChart(params, signal) {
    const feedName = FEEDS[params.platform]?.[params.chart];
    if (!feedName) throw new Error("当前榜单暂不可用");

    const url =
      `https://itunes.apple.com/${params.country}/rss/${feedName}/limit=${LIMIT}` +
      (params.genre ? `/genre=${params.genre}` : "") +
      "/json";

    const data = await fetchJson(url, signal);
    if (!data?.feed) throw new Error("Apple 榜单返回格式异常");

    const results = getEntries(data.feed)
      .map((entry, index) =>
        normalizeEntry(entry, index + 1, params.country),
      )
      .filter(Boolean);

    return {
      ok: true,
      country: params.country,
      platform: params.platform,
      chart: params.chart,
      genre: params.genre || null,
      count: results.length,
      updated: String(data.feed.updated?.label || "") || null,
      fetchedAt: new Date().toISOString(),
      source: "direct",
      results,
    };
  }

  async function fetchApps(ids, country, signal) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("缺少 App ID");
    }
    const data = await fetchJson(
      `https://itunes.apple.com/lookup?id=${ids.join(
        ",",
      )}&country=${country}&entity=software`,
      signal,
    );
    if (!Array.isArray(data?.results)) {
      throw new Error("Apple 评分数据返回格式异常");
    }

    const requested = new Set(ids);
    const apps = {};
    for (const item of data.results) {
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
        price: Number.isFinite(Number(item.price))
          ? Number(item.price)
          : 0,
        priceLabel: String(item.formattedPrice || ""),
      };
    }
    return apps;
  }

  function safeImageUrl(raw) {
    if (typeof raw !== "string") return null;
    try {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        !/(^|\.)mzstatic\.com$/.test(url.hostname)
      ) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  function upgradeScreenshotUrl(raw) {
    const safe = safeImageUrl(raw);
    if (!safe) return null;
    try {
      const url = new URL(safe);
      const match = url.pathname.match(
        /\/(\d+)x(\d+)bb\.(png|jpg|jpeg)$/i,
      );
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

  function normalizeDetail(item, country, platform) {
    const id = String(item.trackId || "");
    const screenshots =
      platform === "ipad" && Array.isArray(item.ipadScreenshotUrls)
        ? normalizeScreenshots(item.ipadScreenshotUrls)
        : [];
    const shots = screenshots.length
      ? screenshots
      : normalizeScreenshots(item.screenshotUrls);

    return {
      id,
      name: String(item.trackName || ""),
      artist: String(item.artistName || ""),
      icon:
        safeImageUrl(item.artworkUrl512 || item.artworkUrl100) || null,
      rating: Number.isFinite(Number(item.averageUserRating))
        ? Number(item.averageUserRating)
        : 0,
      ratingCount: Number.isFinite(Number(item.userRatingCount))
        ? Number(item.userRatingCount)
        : 0,
      price: Number.isFinite(Number(item.price))
        ? Number(item.price)
        : 0,
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
  }

  async function fetchDetail(id, country, platform, signal) {
    const data = await fetchJson(
      `https://itunes.apple.com/lookup?id=${id}&country=${country}&entity=software`,
      signal,
    );
    const item = Array.isArray(data?.results)
      ? data.results.find((result) => String(result.trackId) === id)
      : null;
    if (!item) throw new Error("该应用在当前商店不可用");
    return normalizeDetail(item, country, platform);
  }

  window.AppleDirect = {
    fetchChart,
    fetchApps,
    fetchDetail,
  };
})();

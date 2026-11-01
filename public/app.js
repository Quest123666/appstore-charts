(() => {
  "use strict";

  // 部署后可以把你的公开仓库地址填在这里，例如：
  // repoUrl: "https://github.com/yourname/appstore-charts"
  // 留空则页面不会显示任何仓库链接（也更不容易泄露个人信息）。
  const CONFIG = {
    repoUrl: "",
  };

  const COUNTRIES = [
    { id: "cn", label: "中国", store: "中国区" },
    { id: "us", label: "美国", store: "美国区" },
  ];

  const PLATFORMS = [
    { id: "iphone", label: "iPhone" },
    { id: "ipad", label: "iPad" },
    { id: "mac", label: "Mac" },
  ];

  const CHARTS = [
    { id: "top-free", label: "免费榜" },
    { id: "top-paid", label: "付费榜" },
    { id: "top-grossing", label: "畅销榜" },
  ];

  const SORT_MODES = [
    {
      id: "chart",
      label: "榜单",
      title: "完整榜单",
      kicker: "FULL CHART",
    },
    {
      id: "rating",
      label: "评分",
      title: "评分榜",
      kicker: "TOP RATED",
    },
    {
      id: "updated",
      label: "最近更新",
      title: "最近更新榜",
      kicker: "RECENT UPDATES",
    },
    {
      id: "price",
      label: "价格",
      title: "价格榜",
      kicker: "LOWEST PRICE",
    },
  ];
  const SORT_LABELS = Object.fromEntries(
    SORT_MODES.map((mode) => [mode.id, mode.label]),
  );
  const SORT_META = Object.fromEntries(
    SORT_MODES.map((mode) => [mode.id, mode]),
  );
  const MANUAL_REFRESH_COOLDOWN_MS = 30 * 1000;
  const enrichCache = new Map();
  const ENRICH_CACHE_MAX = 8;

  const CATEGORIES = [
    { id: null, label: "全部" },
    { id: "6014", label: "游戏" },
    { id: "6005", label: "社交" },
    { id: "6008", label: "摄影与录像" },
    { id: "6016", label: "娱乐" },
    { id: "6017", label: "教育" },
    { id: "6007", label: "效率" },
    { id: "6015", label: "财务" },
    { id: "6012", label: "生活" },
    { id: "6013", label: "健康健美" },
    { id: "6024", label: "购物" },
    { id: "6023", label: "美食佳饮" },
    { id: "6011", label: "音乐" },
    { id: "6009", label: "新闻" },
    { id: "6002", label: "工具" },
    { id: "6000", label: "商务" },
    { id: "6003", label: "旅游" },
    { id: "6004", label: "体育" },
    { id: "6001", label: "天气" },
    { id: "6010", label: "导航" },
    { id: "6006", label: "参考" },
    { id: "6020", label: "医疗" },
    { id: "6018", label: "图书" },
    { id: "6021", label: "杂志与报纸" },
    { id: "6027", label: "图形与设计" },
    { id: "6026", label: "开发者工具" },
    { id: "6025", label: "贴纸" },
    { id: "6022", label: "目录" },
  ];

  const GAME_CATEGORIES = [
    { id: "6014", label: "全部游戏" },
    { id: "7001", label: "动作" },
    { id: "7002", label: "冒险" },
    { id: "7003", label: "休闲" },
    { id: "7004", label: "棋牌" },
    { id: "7005", label: "卡牌" },
    { id: "7006", label: "娱乐场" },
    { id: "7007", label: "骰子" },
    { id: "7008", label: "教育" },
    { id: "7009", label: "家庭" },
    { id: "7011", label: "音乐" },
    { id: "7012", label: "解谜" },
    { id: "7013", label: "竞速" },
    { id: "7014", label: "角色扮演" },
    { id: "7015", label: "模拟" },
    { id: "7016", label: "体育" },
    { id: "7017", label: "策略" },
    { id: "7018", label: "问答" },
    { id: "7019", label: "文字" },
  ];

  const CATEGORY_LABELS = {};
  for (const category of CATEGORIES) {
    if (category.id) CATEGORY_LABELS[category.id] = category.label;
  }
  for (const category of GAME_CATEGORIES) {
    if (category.id && category.id !== "6014") {
      CATEGORY_LABELS[category.id] = category.label;
    }
  }

  const DEFAULT_STATE = {
    country: "cn",
    platform: "iphone",
    chart: "top-free",
    genre: null,
    sort: "chart",
  };

  const CACHE_PREFIX = "apppodium.v1.";
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 8;
  const AUTO_REFRESH_MS = 5 * 60 * 1000;

  const STATIC_ICONS = {
    search:
      '<svg viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" stroke-width="1.7"/><path d="m15.6 15.6 4.1 4.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4.5 21 19.5H3L12 4.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17" r="0.9" fill="currentColor"/></svg>',
    empty:
      '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m4 8.5 8 4.5 8-4.5M12 13v7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };

  const detailCache = new Map();
  const state = {
    country: DEFAULT_STATE.country,
    platform: DEFAULT_STATE.platform,
    chart: DEFAULT_STATE.chart,
    genre: null,
    query: "",
    data: null,
    error: null,
    loading: false,
    seq: 0,
    abort: null,
    detailSeq: 0,
    detailAbort: null,
    lastLoadedAt: 0,
    retryTimer: 0,
    autoRetries: 0,
    sort: DEFAULT_STATE.sort,
    enrich: null,
    enrichKey: "",
    enrichPendingKey: "",
    enrichSeq: 0,
    enrichAbort: null,
    sortLoading: false,
    lastManualRefresh: 0,
  };

  let els = null;
  let searchTimer = 0;
  let toastTimer = 0;
  let autoRefreshTimer = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function idOf(list, value) {
    return list.some((item) => item.id === value);
  }

  function labelOf(list, value) {
    const match = list.find((item) => item.id === value);
    return match ? match.label : value;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase();
  }

  function isGameGenre(genre) {
    return Boolean(genre) && (genre === "6014" || genre.startsWith("7"));
  }

  function categoryLabel(app) {
    return CATEGORY_LABELS[app.categoryId] || app.category || "App";
  }

  function priceText(app) {
    return Number(app.price) === 0 ? "免费" : app.priceLabel || "—";
  }

  function padRank(rank) {
    const value = Number(rank);
    return value < 10 ? `0${value}` : String(value);
  }

  function medalFor(rank) {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return "";
  }

  function formatUpdated(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—:—";
    const now = new Date();
    const time = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    return sameDay
      ? time
      : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatCompact(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "0";
    try {
      return new Intl.NumberFormat("zh-CN", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(number);
    } catch {
      return String(Math.round(number));
    }
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

  function safeStoreUrl(raw) {
    if (typeof raw !== "string") return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.hostname !== "apps.apple.com") {
        return null;
      }
      url.searchParams.delete("uo");
      return url.toString();
    } catch {
      return null;
    }
  }

  function readStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const country = idOf(COUNTRIES, params.get("country"))
      ? params.get("country")
      : DEFAULT_STATE.country;
    const platform = idOf(PLATFORMS, params.get("platform"))
      ? params.get("platform")
      : DEFAULT_STATE.platform;
    const chart = idOf(CHARTS, params.get("chart"))
      ? params.get("chart")
      : DEFAULT_STATE.chart;
    let genre = params.get("genre");
    if (!genre || !CATEGORY_LABELS[genre]) genre = null;
    const normalizedChart =
      platform === "mac" && chart !== "top-free" ? "top-free" : chart;
    let sort = params.get("sort");
    if (!idOf(SORT_MODES, sort)) sort = "chart";
    if (sort === "price" && normalizedChart === "top-free") sort = "chart";

    return {
      country,
      platform,
      chart: normalizedChart,
      genre,
      sort,
    };
  }

  function assignState(next) {
    state.country = next.country;
    state.platform = next.platform;
    state.chart = next.chart;
    state.genre = next.genre;
    state.sort = next.sort;
  }

  function updateURL() {
    const params = new URLSearchParams();
    params.set("country", state.country);
    params.set("platform", state.platform);
    params.set("chart", state.chart);
    if (state.genre) params.set("genre", state.genre);
    if (state.sort !== "chart") params.set("sort", state.sort);
    const next = `?${params.toString()}`;
    if (window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }

  function cacheKeyFor(view) {
    return `${CACHE_PREFIX}${view.country}.${view.platform}.${view.chart}.${
      view.genre || "all"
    }`;
  }

  function sanitizeData(payload, country) {
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    const results = rows
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const id = String(item.id || "");
        const name = String(item.name || "").trim();
        if (!/^\d{1,12}$/.test(id) || !name) return null;

        const icon = safeImageUrl(item.icon);
        const storeUrl =
          safeStoreUrl(item.url) ||
          `https://apps.apple.com/${country}/app/id${id}`;
        const price = Number(item.price);
        const rank = Number(item.rank);

        return {
          rank: Number.isFinite(rank) && rank > 0 ? rank : index + 1,
          id,
          name,
          artist: String(item.artist || "").trim(),
          category: String(item.category || "").trim(),
          categoryId: String(item.categoryId || "").trim(),
          icon,
          url: storeUrl,
          price: Number.isFinite(price) ? price : 0,
          priceLabel: String(
            item.priceLabel ||
              (Number.isFinite(price) && price === 0 ? "免费" : ""),
          ),
          releaseDate: String(item.releaseDate || ""),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank);

    return {
      ...payload,
      results,
      count: results.length,
      updated: payload?.updated ? String(payload.updated) : null,
      fetchedAt: payload?.fetchedAt ? String(payload.fetchedAt) : null,
    };
  }

  function readCacheFor(view) {
    try {
      const raw = window.localStorage.getItem(cacheKeyFor(view));
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (!record || !record.data || !Array.isArray(record.data.results)) {
        return null;
      }
      if (Date.now() - Number(record.savedAt || 0) > CACHE_MAX_AGE) {
        return null;
      }
      if (
        record.data.country !== view.country ||
        record.data.platform !== view.platform ||
        record.data.chart !== view.chart ||
        (record.data.genre || null) !== view.genre
      ) {
        return null;
      }
      return {
        savedAt: Number(record.savedAt) || Date.now(),
        data: sanitizeData(record.data, view.country),
      };
    } catch {
      return null;
    }
  }

  function pruneCache(force) {
    try {
      const entries = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith(CACHE_PREFIX)) continue;
        let savedAt = 0;
        try {
          const record = JSON.parse(window.localStorage.getItem(key) || "{}");
          savedAt = Number(record.savedAt) || 0;
        } catch {
          savedAt = 0;
        }
        entries.push({ key, savedAt });
      }
      if (!force && entries.length <= CACHE_MAX_ENTRIES) return;
      entries
        .sort((a, b) => a.savedAt - b.savedAt)
        .slice(0, Math.max(0, entries.length - CACHE_MAX_ENTRIES + 2))
        .forEach((entry) => window.localStorage.removeItem(entry.key));
    } catch {
      // localStorage 不可用时忽略。
    }
  }

  function saveCache(data) {
    const key = cacheKeyFor(state);
    const record = JSON.stringify({ savedAt: Date.now(), data });
    try {
      window.localStorage.setItem(key, record);
      pruneCache(false);
    } catch {
      try {
        pruneCache(true);
        window.localStorage.setItem(key, record);
      } catch {
        // 配额不足或隐私模式，放弃缓存。
      }
    }
  }

  function fingerprint(data) {
    if (!data || !Array.isArray(data.results)) return "";
    return [
      data.updated || "",
      data.count,
      data.results.map((item) => item.id).join(","),
    ].join("|");
  }

  function searchApps(apps, query) {
    const needle = normalizeText(query);
    if (!needle) return apps;
    return apps.filter((app) =>
      normalizeText(
        `${app.name} ${app.artist} ${categoryLabel(app)}`,
      ).includes(needle),
    );
  }

  function requiresEnrichment(sort) {
    return sort === "rating" || sort === "updated";
  }

  function enrichmentKey() {
    const ids = state.data?.results?.map((app) => app.id).join(",") || "";
    return `${state.country}:${ids}`;
  }

  function getSortedResults() {
    const results = state.data?.results || [];
    if (state.sort === "chart") return results;

    const enrichment = state.enrich || {};
    const items = results.map((app) => ({
      ...app,
      enrich: enrichment[app.id] || null,
    }));

    if (state.sort === "rating") {
      if (!state.enrich) return items;
      return items.sort((a, b) => {
        const aRating =
          a.enrich && a.enrich.ratingCount > 0 ? a.enrich.rating : -1;
        const bRating =
          b.enrich && b.enrich.ratingCount > 0 ? b.enrich.rating : -1;
        if (bRating !== aRating) return bRating - aRating;
        const aCount = a.enrich?.ratingCount || 0;
        const bCount = b.enrich?.ratingCount || 0;
        if (bCount !== aCount) return bCount - aCount;
        return a.rank - b.rank;
      });
    }

    if (state.sort === "updated") {
      if (!state.enrich) return items;
      return items.sort((a, b) => {
        const aTime =
          Date.parse(
            a.enrich?.updatedDate ||
              a.enrich?.releaseDate ||
              a.releaseDate ||
              "",
          ) || 0;
        const bTime =
          Date.parse(
            b.enrich?.updatedDate ||
              b.enrich?.releaseDate ||
              b.releaseDate ||
              "",
          ) || 0;
        if (bTime !== aTime) return bTime - aTime;
        return a.rank - b.rank;
      });
    }

    if (state.sort === "price") {
      return items.sort((a, b) => {
        const aPrice = Number(a.price) || 0;
        const bPrice = Number(b.price) || 0;
        if (aPrice !== bPrice) return aPrice - bPrice;
        return a.rank - b.rank;
      });
    }

    return items;
  }

  function positionMap(sorted) {
    const map = new Map();
    sorted.forEach((app, index) => map.set(app.id, index + 1));
    return map;
  }

  function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function metricText(app, sort) {
    if (sort === "rating") {
      if (!app.enrich || app.enrich.ratingCount <= 0) return "暂无评分";
      return `★ ${Number(app.enrich.rating).toFixed(1)}`;
    }
    if (sort === "updated") {
      const date =
        app.enrich?.updatedDate ||
        app.enrich?.releaseDate ||
        app.releaseDate ||
        "";
      return date ? `${formatShortDate(date)} 更新` : "暂无日期";
    }
    return "";
  }

  function updateListHeading() {
    const meta = SORT_META[state.sort] || SORT_META.chart;
    els.listKicker.textContent = meta.kicker;
    els.listTitle.textContent = meta.title;
  }

  function updateMobileContext() {
    if (!els.followContext) return;
    const country = labelOf(COUNTRIES, state.country);
    const platform = labelOf(PLATFORMS, state.platform);
    const chart = labelOf(CHARTS, state.chart);
    const genre = state.genre ? CATEGORY_LABELS[state.genre] : "";
    const sort =
      state.sort !== "chart" ? ` · ${SORT_LABELS[state.sort]}` : "";
    els.followContext.textContent =
      `${country} · ${platform} · ${chart}` +
      (genre ? ` · ${genre}` : "") +
      sort;
  }

  function renderSortBar() {
    if (!els.sortStatus) return;
    const meta = SORT_META[state.sort] || SORT_META.chart;
    let status = "在当前榜单内重新排序";
    if (state.sortLoading) {
      status =
        state.sort === "updated"
          ? "正在获取最近更新时间…"
          : "正在获取评分数据…";
    } else if (state.sort !== "chart") {
      status = `已按${meta.label}排序`;
    }
    els.sortStatus.textContent = status;
    els.sortStatus.classList.toggle("is-loading", state.sortLoading);
  }

  function syncSortControls() {
    if (!els.sortControl) return;
    for (const button of els.sortControl.querySelectorAll(
      "button[data-sort]",
    )) {
      const value = button.dataset.sort;
      const active = value === state.sort;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      const priceUnavailable =
        value === "price" && state.chart === "top-free";
      button.classList.toggle("is-unavailable", priceUnavailable);
      button.title = priceUnavailable
        ? "免费榜所有 App 价格相同"
        : value === "price"
          ? "价格从低到高"
          : "";
    }
    updateListHeading();
    updateMobileContext();
  }

  function abortEnrichment() {
    state.enrichSeq += 1;
    if (state.enrichAbort) {
      state.enrichAbort.abort();
      state.enrichAbort = null;
    }
    state.enrichPendingKey = "";
    state.sortLoading = false;
  }

  async function fetchAppsPayload(ids, signal) {
    if (window.AppleDirect && typeof window.AppleDirect.fetchApps === "function") {
      try {
        const apps = await window.AppleDirect.fetchApps(
          ids,
          state.country,
          signal,
        );
        if (apps && Object.keys(apps).length > 0) return apps;
      } catch (error) {
        if (error.name === "AbortError") throw error;
      }
    }

    const params = new URLSearchParams({
      ids: ids.join(","),
      country: state.country,
    });
    const response = await fetch(`/api/apps?${params.toString()}`, {
      signal,
      headers: { accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !payload.apps) {
      throw new Error(
        payload?.error?.message || "评分数据暂时不可用",
      );
    }
    return payload.apps;
  }

  async function ensureEnrichment() {
    if (!requiresEnrichment(state.sort) || !state.data) return;
    const results = state.data.results || [];
    if (results.length === 0) return;
    const key = enrichmentKey();
    if (state.enrich && state.enrichKey === key) return;
    if (state.sortLoading && state.enrichPendingKey === key) return;

    const cached = enrichCache.get(key);
    if (cached) {
      state.enrich = cached;
      state.enrichKey = key;
      state.sortLoading = false;
      renderAll();
      return;
    }

    if (state.enrichAbort) state.enrichAbort.abort();
    const seq = ++state.enrichSeq;
    const controller = new AbortController();
    state.enrichAbort = controller;
    state.enrichPendingKey = key;
    state.sortLoading = true;
    renderSortBar();

    const ids = results.map((app) => app.id);

    try {
      const apps = await fetchAppsPayload(ids, controller.signal);
      if (seq !== state.enrichSeq) return;
      if (!apps || Object.keys(apps).length === 0) {
        throw new Error("评分数据暂时不可用");
      }

      state.enrich = apps;
      state.enrichKey = key;
      enrichCache.set(key, apps);
      if (enrichCache.size > ENRICH_CACHE_MAX) {
        enrichCache.delete(enrichCache.keys().next().value);
      }
      renderAll();
    } catch (error) {
      if (error.name === "AbortError") return;
      if (seq !== state.enrichSeq) return;
      state.enrich = null;
      state.enrichKey = "";
      state.sort = "chart";
      state.sortLoading = false;
      updateURL();
      syncSortControls();
      renderAll();
      showToast("特色排序数据暂时不可用，已恢复榜单排序", "error");
    } finally {
      if (seq === state.enrichSeq) {
        state.enrichPendingKey = "";
        state.sortLoading = false;
        renderSortBar();
      }
    }
  }

  function setSort(value) {
    if (!SORT_META[value] || value === state.sort) return;
    if (value === "price" && state.chart === "top-free") {
      showToast("免费榜所有 App 价格相同，暂不支持价格排序");
      return;
    }

    abortEnrichment();
    state.sort = value;
    state.sortLoading = false;
    updateURL();
    syncSortControls();
    renderAll();
    if (requiresEnrichment(value)) ensureEnrichment();
  }

  function manualRefresh() {
    if (state.loading) return;
    const now = Date.now();
    if (now - state.lastManualRefresh < MANUAL_REFRESH_COOLDOWN_MS) {
      showToast("刷新太频繁，请 30 秒后再试");
      return;
    }
    state.lastManualRefresh = now;
    load({ fresh: true });
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  let scrollTicking = false;

  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
      scrollTicking = false;
      updateScrollChrome();
    });
  }

  function updateScrollChrome() {
    if (!els || !els.mobileFollow) return;
    const y = window.scrollY || 0;
    const controlsBottom = els.controls
      ? els.controls.getBoundingClientRect().bottom
      : 0;
    const showFollow =
      window.innerWidth <= 820 &&
      controlsBottom < 8 &&
      !els.dialog.open;
    els.mobileFollow.classList.toggle("is-visible", showFollow);
    els.mobileFollow.setAttribute("aria-hidden", String(!showFollow));

    const showFab = y > 180 && !els.dialog.open;
    els.fabStack.classList.toggle("is-visible", showFab);
    els.fabStack.setAttribute("aria-hidden", String(!showFab));
    els.fabTop.hidden = y < 560;
  }

  function init() {
    els = {
      progressBar: document.getElementById("progressBar"),
      livePill: document.getElementById("livePill"),
      themeToggle: document.getElementById("themeToggle"),
      repoLink: document.getElementById("repoLink"),
      footerRepo: document.getElementById("footerRepo"),
      statCount: document.getElementById("statCount"),
      statUpdated: document.getElementById("statUpdated"),
      statPlatform: document.getElementById("statPlatform"),
      countryControl: document.getElementById("countryControl"),
      platformControl: document.getElementById("platformControl"),
      chartControl: document.getElementById("chartControl"),
      genreControl: document.getElementById("genreControl"),
      gameGenreControl: document.getElementById("gameGenreControl"),
      gameGenreRow: document.getElementById("gameGenreRow"),
      chipPrev: document.getElementById("chipPrev"),
      chipNext: document.getElementById("chipNext"),
      macNote: document.getElementById("macNote"),
      controls: document.querySelector(".controls"),
      sortControl: document.getElementById("sortControl"),
      sortStatus: document.getElementById("sortStatus"),
      listKicker: document.getElementById("listKicker"),
      listTitle: document.getElementById("listTitle"),
      rankings: document.getElementById("rankings"),
      banner: document.getElementById("banner"),
      spotlight: document.getElementById("spotlight"),
      listHead: document.querySelector(".list-head"),
      listSub: document.getElementById("listSub"),
      list: document.getElementById("list"),
      emptyState: document.getElementById("emptyState"),
      errorState: document.getElementById("errorState"),
      searchInput: document.getElementById("searchInput"),
      refreshBtn: document.getElementById("refreshBtn"),
      mobileFollow: document.getElementById("mobileFollow"),
      followContext: document.getElementById("followContext"),
      followFilter: document.getElementById("followFilter"),
      fabStack: document.getElementById("fabStack"),
      fabRefresh: document.getElementById("fabRefresh"),
      fabTop: document.getElementById("fabTop"),
      dialog: document.getElementById("appDialog"),
      dialogClose: document.getElementById("dialogClose"),
      dialogContent: document.getElementById("dialogContent"),
      toast: document.getElementById("toast"),
    };

    if (!els.list || !els.dialog) return;

    initTheme();
    initRepoLinks();
    assignState(readStateFromURL());
    if (window.location.search) updateURL();

    renderGenreChips();
    bindEvents();

    const record = readCacheFor(state);
    if (record) {
      state.data = record.data;
      state.lastLoadedAt =
        Date.parse(record.data.fetchedAt || "") || record.savedAt;
    }

    syncControls();
    renderSortBar();
    if (state.data) renderAll();
    updateChipArrows();
    updateScrollChrome();
    load();

    autoRefreshTimer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !state.loading &&
        !els.dialog.open
      ) {
        load();
      }
    }, AUTO_REFRESH_MS);
  }

  function initTheme() {
    const root = document.documentElement;
    const applyLabel = () => {
      const dark = root.dataset.theme === "dark";
      els.themeToggle.setAttribute(
        "aria-label",
        dark ? "切换为浅色模式" : "切换为深色模式",
      );
    };
    applyLabel();
    els.themeToggle.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        window.localStorage.setItem("apppodium-theme", next);
      } catch {
        // 忽略隐私模式下的存储异常。
      }
      applyLabel();
    });
  }

  function initRepoLinks() {
    const raw = String(CONFIG.repoUrl || "").trim();
    if (!raw) return;
    let url;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.protocol !== "https:" || url.hostname !== "github.com") return;
    if (!url.pathname || url.pathname === "/") return;
    for (const node of [els.repoLink, els.footerRepo]) {
      if (!node) continue;
      node.href = url.toString();
      node.hidden = false;
    }
  }

  function renderGenreChips() {
    els.genreControl.replaceChildren();
    for (const category of CATEGORIES) {
      const chip = el("button", "chip", category.label);
      chip.type = "button";
      chip.dataset.genre = category.id || "";
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        if (state.genre === category.id) return;
        setFilter({ genre: category.id });
      });
      els.genreControl.appendChild(chip);
    }

    els.gameGenreControl.replaceChildren();
    for (const category of GAME_CATEGORIES) {
      const chip = el("button", "chip", category.label);
      chip.type = "button";
      chip.dataset.genre = category.id;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        if (state.genre === category.id) return;
        setFilter({ genre: category.id });
      });
      els.gameGenreControl.appendChild(chip);
    }
  }

  function bindEvents() {
    bindSegment(els.countryControl, "country");
    bindSegment(els.platformControl, "platform");
    bindSegment(els.chartControl, "chart");

    els.searchInput.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.query = els.searchInput.value.trim();
        renderAll();
      }, 120);
    });

    els.refreshBtn.addEventListener("click", manualRefresh);
    els.fabRefresh.addEventListener("click", manualRefresh);
    els.sortControl.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button[data-sort]")
          : null;
      if (!button || button.disabled) return;
      setSort(button.dataset.sort);
    });

    els.chipPrev.addEventListener("click", () => {
      els.genreControl.scrollBy({ left: -320, behavior: "smooth" });
    });
    els.chipNext.addEventListener("click", () => {
      els.genreControl.scrollBy({ left: 320, behavior: "smooth" });
    });

    els.fabTop.addEventListener("click", scrollToTop);
    els.followFilter.addEventListener("click", () => {
      if (!els.controls) return;
      els.controls.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    });

    els.dialogClose.addEventListener("click", closeAppDialog);
    els.dialog.addEventListener("click", (event) => {
      if (event.target === els.dialog) closeAppDialog();
    });
    els.dialog.addEventListener("close", onDialogClosed);

    window.addEventListener("resize", () => {
      updateChipArrows();
      updateScrollChrome();
    });
    window.addEventListener("popstate", onPopState);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        !state.loading &&
        Date.now() - state.lastLoadedAt > AUTO_REFRESH_MS
      ) {
        load();
      }
      updateScrollChrome();
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(() => {
          updateChipArrows();
          updateScrollChrome();
        })
        .catch(() => {});
    }
  }

  function bindSegment(container, key) {
    container.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button[data-value]")
          : null;
      if (!button || button.disabled || !container.contains(button)) return;
      const value = button.dataset.value;
      if (state[key] === value) return;

      const patch = { [key]: value };
      if (
        key === "platform" &&
        value === "mac" &&
        state.chart !== "top-free"
      ) {
        patch.chart = "top-free";
        showToast("Mac 仅提供免费榜，已自动切换");
      }
      setFilter(patch);
    });
  }

  function setFilter(patch) {
    const next = {
      country: patch.country ?? state.country,
      platform: patch.platform ?? state.platform,
      chart: patch.chart ?? state.chart,
      genre: Object.prototype.hasOwnProperty.call(patch, "genre")
        ? patch.genre
        : state.genre,
    };

    if (next.platform === "mac" && next.chart !== "top-free") {
      next.chart = "top-free";
    }

    next.sort = state.sort;
    if (next.chart === "top-free" && next.sort === "price") {
      next.sort = "chart";
      showToast("免费榜价格相同，已恢复榜单排序");
    }

    if (
      next.country === state.country &&
      next.platform === state.platform &&
      next.chart === state.chart &&
      next.genre === state.genre &&
      next.sort === state.sort
    ) {
      return;
    }

    window.clearTimeout(searchTimer);
    window.clearTimeout(state.retryTimer);
    state.retryTimer = 0;
    state.autoRetries = 0;
    abortEnrichment();
    state.enrich = null;
    state.enrichKey = "";
    state.enrichPendingKey = "";
    state.sortLoading = false;
    state.country = next.country;
    state.platform = next.platform;
    state.chart = next.chart;
    state.genre = next.genre;
    state.sort = next.sort;
    state.query = "";
    state.error = null;
    els.searchInput.value = "";

    const record = readCacheFor(state);
    state.data = record ? record.data : null;
    state.lastLoadedAt = record
      ? Date.parse(record.data.fetchedAt || "") || record.savedAt
      : 0;

    updateURL();
    syncControls();
    if (state.data) renderAll();
    load();
  }

  function syncControls() {
    setSegmentActive(els.countryControl, state.country);
    setSegmentActive(els.platformControl, state.platform);
    setSegmentActive(els.chartControl, state.chart);

    const isMac = state.platform === "mac";
    for (const button of els.chartControl.querySelectorAll(
      "button[data-value]",
    )) {
      const unavailable =
        isMac &&
        (button.dataset.value === "top-paid" ||
          button.dataset.value === "top-grossing");
      button.disabled = unavailable;
      button.title = unavailable
        ? "Apple 未开放该 Mac 榜单数据"
        : "";
    }
    els.macNote.hidden = !isMac;

    const gameSelected = isGameGenre(state.genre);
    els.gameGenreRow.hidden = !gameSelected;
    updateChipStates();
    syncSortControls();
    renderSortBar();
    window.requestAnimationFrame(updateChipArrows);
    window.requestAnimationFrame(updateScrollChrome);
  }

  function setSegmentActive(container, value) {
    for (const button of container.querySelectorAll("button[data-value]")) {
      const active = button.dataset.value === value;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function updateChipStates() {
    let activeMain = null;
    for (const chip of els.genreControl.children) {
      const genre = chip.dataset.genre || null;
      const active =
        genre === state.genre ||
        (genre === "6014" && isGameGenre(state.genre));
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
      if (active) activeMain = chip;
    }

    let activeGame = null;
    for (const chip of els.gameGenreControl.children) {
      const active = chip.dataset.genre === state.genre;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
      if (active) activeGame = chip;
    }

    revealChip(els.genreControl, activeMain);
    if (!els.gameGenreRow.hidden) {
      revealChip(els.gameGenreControl, activeGame);
    }
  }

  function revealChip(container, chip) {
    if (!chip || !container.clientWidth) return;
    const chipRect = chip.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (chipRect.left < containerRect.left + 1) {
      container.scrollLeft -= containerRect.left - chipRect.left + 12;
    } else if (chipRect.right > containerRect.right - 1) {
      container.scrollLeft += chipRect.right - containerRect.right + 12;
    }
  }

  function updateChipArrows() {
    if (!els || !els.genreControl) return;
    const canScroll =
      els.genreControl.scrollWidth > els.genreControl.clientWidth + 4;
    els.chipPrev.hidden = !canScroll;
    els.chipNext.hidden = !canScroll;
  }

  async function fetchChartPayload(signal, fresh) {
    if (window.AppleDirect && typeof window.AppleDirect.fetchChart === "function") {
      try {
        const direct = await window.AppleDirect.fetchChart(
          {
            country: state.country,
            platform: state.platform,
            chart: state.chart,
            genre: state.genre,
          },
          signal,
        );
        if (direct && Array.isArray(direct.results)) return direct;
      } catch (error) {
        if (error.name === "AbortError") throw error;
      }
    }

    const params = new URLSearchParams({
      country: state.country,
      platform: state.platform,
      chart: state.chart,
    });
    if (state.genre) params.set("genre", state.genre);
    if (fresh) params.set("fresh", "1");

    const response = await fetch(`/api/charts?${params.toString()}`, {
      signal,
      headers: { accept: "application/json" },
      cache: fresh ? "no-store" : "default",
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("榜单返回格式异常");
    }

    if (
      !response.ok ||
      !payload ||
      payload.ok === false ||
      !Array.isArray(payload.results)
    ) {
      throw new Error(payload?.error?.message || "榜单加载失败");
    }

    return payload;
  }

  async function load(options = {}) {
    const fresh = Boolean(options.fresh);
    const seq = ++state.seq;
    if (state.abort) state.abort.abort();
    if (state.retryTimer) {
      window.clearTimeout(state.retryTimer);
      state.retryTimer = 0;
    }

    const controller = new AbortController();
    state.abort = controller;
    const hadData = Boolean(state.data);
    const previousFingerprint = fingerprint(state.data);

    state.loading = true;
    state.error = null;
    if (hadData) renderBanner();
    updateLoadingUI();
    if (!hadData) renderAll();

    try {
      const payload = await fetchChartPayload(controller.signal, fresh);
      if (seq !== state.seq) return;

      const nextData = sanitizeData(payload, state.country);
      const changed =
        previousFingerprint !== fingerprint(nextData) || !hadData;

      state.data = nextData;
      state.lastLoadedAt = Date.now();
      state.autoRetries = 0;
      saveCache(nextData);

      if (changed) {
        renderAll();
      } else {
        renderMeta();
        renderBanner();
      }

      if (fresh) {
        if (nextData.refreshLimited) {
          showToast("刷新太频繁，已显示缓存");
        } else if (nextData.stale) {
          showToast("刷新失败，正在显示缓存数据", "error");
        } else {
          showToast(changed ? "榜单已刷新" : "Apple 暂未更新排名");
        }
      }

      if (requiresEnrichment(state.sort)) {
        ensureEnrichment();
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      if (seq !== state.seq) return;

      state.error =
        (error && error.message) || "网络连接失败，请稍后重试";
      if (state.data) {
        renderBanner();
        updateLoadingUI();
      } else {
        renderAll();
        if (!fresh && state.autoRetries < 1) {
          state.autoRetries += 1;
          state.retryTimer = window.setTimeout(() => {
            state.retryTimer = 0;
            if (!state.data && !state.loading) load();
          }, 6000);
        }
      }
      if (fresh) showToast("刷新失败，请稍后再试", "error");
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        updateLoadingUI();
      }
    }
  }

  function updateLoadingUI() {
    els.progressBar.hidden = !state.loading;
    els.refreshBtn.disabled = state.loading;
    els.refreshBtn.classList.toggle("is-loading", state.loading);
    const label = els.refreshBtn.querySelector("span");
    if (label) label.textContent = state.loading ? "刷新中" : "刷新";
    if (els.fabRefresh) {
      els.fabRefresh.disabled = state.loading;
      els.fabRefresh.classList.toggle("is-loading", state.loading);
    }
    els.rankings.setAttribute(
      "aria-busy",
      state.loading ? "true" : "false",
    );
    els.livePill.classList.toggle(
      "is-offline",
      Boolean(state.error) && !state.loading,
    );
  }

  function renderAll() {
    const sorted = getSortedResults();
    const positions = state.sort !== "chart" ? positionMap(sorted) : null;
    const matches = state.query
      ? searchApps(sorted, state.query)
      : sorted;
    renderMeta();
    renderBanner();
    renderSortBar();
    renderSpotlight();
    renderList(sorted, matches, positions);
    renderStates(sorted, matches);
    updateListHeading();
    updateMobileContext();
    updateScrollChrome();
  }

  function renderMeta() {
    const platform = labelOf(PLATFORMS, state.platform);
    const country = labelOf(COUNTRIES, state.country);
    const chart = labelOf(CHARTS, state.chart);
    els.statPlatform.textContent = `${platform} · ${country}区`;

    if (state.data) {
      els.statCount.textContent = String(state.data.count ?? 0);
      els.statUpdated.textContent = formatUpdated(
        state.data.updated || state.data.fetchedAt,
      );
      document.title = `${platform} ${chart} · ${country} — AppPodium`;
    } else {
      els.statCount.textContent = "—";
      els.statUpdated.textContent = "—:—";
      document.title = "AppPodium — App Store 实时榜单";
    }
  }

  function renderBanner() {
    const banner = els.banner;
    banner.hidden = true;
    banner.classList.remove("is-warning");
    banner.replaceChildren();

    if (!state.data) return;

    let message = "";
    if (state.error) {
      message = `更新失败：${state.error}。当前显示 ${
        formatUpdated(state.data.updated || state.data.fetchedAt)
      } 的榜单。`;
    } else if (state.data.stale) {
      message = "Apple 接口暂时不稳定，正在显示最近一次成功获取的榜单。";
    } else {
      const fetchedAt = Date.parse(state.data.fetchedAt || "");
      if (
        Number.isFinite(fetchedAt) &&
        Date.now() - fetchedAt > 2 * 60 * 60 * 1000
      ) {
        const hours = Math.max(
          1,
          Math.round((Date.now() - fetchedAt) / (60 * 60 * 1000)),
        );
        message = `正在显示约 ${hours} 小时前的缓存数据，可手动刷新获取最新排名。`;
      }
    }

    if (!message) return;

    banner.hidden = false;
    banner.classList.add("is-warning");
    banner.appendChild(el("span", "banner-text", message));
    const retry = el("button", "", "重试");
    retry.type = "button";
    retry.addEventListener("click", () => {
      if (!state.loading) load({ fresh: true });
    });
    banner.appendChild(retry);
  }

  function renderSpotlight() {
    const box = els.spotlight;
    box.replaceChildren();
    box.classList.remove("is-single", "is-double");

    if (!state.data) {
      if (state.loading && !state.error) {
        box.hidden = false;
        box.appendChild(el("div", "sk sk-main"));
        const side = el("div", "spotlight-side");
        side.appendChild(el("div", "sk sk-mini"));
        side.appendChild(el("div", "sk sk-mini"));
        box.appendChild(side);
      } else {
        box.hidden = true;
      }
      return;
    }

    if (
      state.sort !== "chart" ||
      state.query ||
      state.data.results.length === 0
    ) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    const top = state.data.results.slice(0, 3);
    const main = buildSpotlightMain(top[0]);
    box.appendChild(main);

    if (top.length === 1) {
      box.classList.add("is-single");
      return;
    }

    if (top.length === 2) box.classList.add("is-double");

    const side = el("div", "spotlight-side");
    if (top[1]) side.appendChild(buildSpotlightMini(top[1], 2, "silver"));
    if (top[2]) side.appendChild(buildSpotlightMini(top[2], 3, "bronze"));
    box.appendChild(side);
  }

  function buildSpotlightMain(app) {
    const card = el("button", "spotlight-main");
    card.type = "button";
    card.setAttribute("aria-label", `第 1 名 ${app.name}，查看详情`);
    card.addEventListener("click", () => openApp(app));

    const top = el("div", "spotlight-main-top");
    top.appendChild(el("span", "spotlight-label", "NO.1 · 榜首"));
    top.appendChild(el("span", "spotlight-main-rank", "CHART LEADER"));

    const body = el("div", "spotlight-main-body");
    const icon = buildIcon(app, "spotlight-main-icon", false);
    const copy = el("div", "spotlight-main-copy");
    copy.appendChild(el("h3", "", app.name));
    copy.appendChild(
      el("span", "spotlight-main-artist", app.artist || "未知开发者"),
    );

    const meta = el("div", "spotlight-main-meta");
    meta.appendChild(el("span", "spotlight-tag", categoryLabel(app)));
    meta.appendChild(el("span", "spotlight-price", priceText(app)));
    const arrow = el("span", "spotlight-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    meta.appendChild(arrow);
    copy.appendChild(meta);

    body.appendChild(icon);
    body.appendChild(copy);
    card.appendChild(top);
    card.appendChild(body);
    return card;
  }

  function buildSpotlightMini(app, rank, medal) {
    const card = el("button", "spotlight-mini");
    card.type = "button";
    card.dataset.medal = medal;
    card.setAttribute("aria-label", `第 ${rank} 名 ${app.name}，查看详情`);
    card.addEventListener("click", () => openApp(app));

    const top = el("div", "mini-top");
    top.appendChild(el("span", "mini-rank", `NO.${rank}`));
    top.appendChild(el("span", "mini-price", priceText(app)));

    const body = el("div", "mini-body");
    body.appendChild(buildIcon(app, "mini-icon", true));
    const copy = el("div", "mini-copy");
    copy.appendChild(el("span", "mini-name", app.name));
    copy.appendChild(
      el("span", "mini-artist", app.artist || "未知开发者"),
    );
    body.appendChild(copy);

    card.appendChild(top);
    card.appendChild(body);
    return card;
  }

  function renderList(all, matches, positions) {
    els.list.replaceChildren();
    els.list.classList.remove("is-single");

    if (!state.data) {
      if (state.loading && !state.error) {
        const left = el("div", "rank-col");
        const right = el("div", "rank-col");
        for (let index = 0; index < 6; index += 1) {
          left.appendChild(el("div", "sk sk-rank"));
          right.appendChild(el("div", "sk sk-rank"));
        }
        els.list.appendChild(left);
        els.list.appendChild(right);
      }
      return;
    }

    const customSort = state.sort !== "chart";
    let display = state.query
      ? matches
      : customSort
        ? all
        : all.slice(3);
    if (!state.query && !customSort && all.length < 4) display = all;

    if (state.query) {
      els.listSub.textContent = `${matches.length} 个结果`;
    } else if (all.length === 0) {
      els.listSub.textContent = "暂无数据";
    } else if (customSort) {
      els.listSub.textContent = `共 ${all.length} 款`;
    } else if (all.length >= 4) {
      els.listSub.textContent = "第 4 名起";
    } else {
      els.listSub.textContent = `TOP ${all.length}`;
    }

    if (!display.length) return;

    const half = Math.ceil(display.length / 2);
    const left = el("div", "rank-col");
    const right = el("div", "rank-col");

    display.forEach((app, index) => {
      const displayRank = customSort
        ? positions?.get(app.id) || index + 1
        : app.rank;
      const card = buildRankCard(
        app,
        index,
        displayRank,
        customSort,
      );
      if (index < half) left.appendChild(card);
      else right.appendChild(card);
    });

    els.list.appendChild(left);
    if (right.childElementCount > 0) {
      els.list.appendChild(right);
    } else {
      els.list.classList.add("is-single");
    }
  }

  function buildRankCard(app, index, displayRank, customSort) {
    const card = el("button", "rank-card");
    card.type = "button";
    card.dataset.rank = String(displayRank);
    const medal = medalFor(displayRank);
    if (medal) card.dataset.medal = medal;
    let label = `第 ${displayRank} 名 ${app.name}`;
    if (customSort) label += `，原榜第 ${app.rank} 名`;
    label += "，查看详情";
    card.setAttribute("aria-label", label);
    card.style.setProperty(
      "--delay",
      `${Math.min(index, 10) * 22}ms`,
    );
    card.addEventListener("click", () => openApp(app));

    const rankWrap = el("span", "rank-wrap");
    rankWrap.appendChild(el("span", "rank-num", padRank(displayRank)));
    if (customSort) {
      rankWrap.appendChild(el("span", "rank-origin", `原${app.rank}`));
    }
    card.appendChild(rankWrap);
    card.appendChild(buildIcon(app, "app-icon", index > 7));

    const copy = el("div", "rank-copy");
    copy.appendChild(el("span", "rank-name", app.name));
    const meta = el("div", "rank-meta");
    meta.appendChild(
      el("span", "rank-artist", app.artist || "未知开发者"),
    );
    if (customSort && state.sort !== "price") {
      const metric = metricText(app, state.sort);
      if (metric) {
        meta.appendChild(el("span", "sort-metric", metric));
      }
    }
    const tag = el("span", "genre-tag", categoryLabel(app));
    tag.title = categoryLabel(app);
    meta.appendChild(tag);
    copy.appendChild(meta);
    card.appendChild(copy);

    card.appendChild(el("span", "rank-price", priceText(app)));
    const arrow = el("span", "rank-arrow", "›");
    arrow.setAttribute("aria-hidden", "true");
    card.appendChild(arrow);
    return card;
  }

  function buildIcon(app, className, lazy) {
    const wrap = el("div", className);
    const src = app.icon;
    const fallback = el(
      "span",
      "fallback",
      (app.name || "?").slice(0, 1).toUpperCase(),
    );

    if (!src) {
      wrap.appendChild(fallback);
      return wrap;
    }

    fallback.hidden = true;
    const image = el("img");
    image.src = src;
    image.alt = "";
    image.loading = lazy ? "lazy" : "eager";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.remove();
      fallback.hidden = false;
    });
    wrap.appendChild(image);
    wrap.appendChild(fallback);
    return wrap;
  }

  function renderStates(all, matches) {
    els.emptyState.hidden = true;
    els.errorState.hidden = true;

    const showHead = Boolean(state.data) || (state.loading && !state.error);
    els.listHead.hidden = !showHead;

    if (!state.data) {
      if (state.error) {
        buildStateCard(
          els.errorState,
          STATIC_ICONS.alert,
          "榜单加载失败",
          `${state.error}。页面会自动再试一次，也可以手动重新加载。`,
          "重新加载",
          () => load({ fresh: true }),
        );
      }
      return;
    }

    if (state.query && matches.length === 0) {
      buildStateCard(
        els.emptyState,
        STATIC_ICONS.search,
        "没有找到匹配的 App",
        "试试更短的关键词，或者清空搜索查看完整榜单。",
        "清空搜索",
        clearSearch,
      );
      return;
    }

    if (!state.query && all.length === 0) {
      buildStateCard(
        els.emptyState,
        STATIC_ICONS.empty,
        "这个分类暂时没有榜单",
        "Apple 没有返回该分类的数据。可以切换到其他分类、商店或设备再试。",
        state.genre ? "查看全部应用" : "重新加载",
        state.genre
          ? () => setFilter({ genre: null })
          : () => load({ fresh: true }),
      );
    }
  }

  function buildStateCard(container, iconSvg, title, text, actionLabel, action) {
    container.replaceChildren();
    container.hidden = false;

    const icon = el("span", "state-icon");
    icon.innerHTML = iconSvg;
    icon.setAttribute("aria-hidden", "true");
    container.appendChild(icon);
    container.appendChild(el("h3", "", title));
    container.appendChild(el("p", "", text));

    if (actionLabel && action) {
      const button = el("button", "state-action", actionLabel);
      button.type = "button";
      button.addEventListener("click", action);
      container.appendChild(button);
    }
  }

  function clearSearch() {
    window.clearTimeout(searchTimer);
    state.query = "";
    els.searchInput.value = "";
    renderAll();
    els.searchInput.focus();
  }

  function onPopState() {
    const next = readStateFromURL();
    if (
      next.country === state.country &&
      next.platform === state.platform &&
      next.chart === state.chart &&
      next.genre === state.genre &&
      next.sort === state.sort
    ) {
      return;
    }

    window.clearTimeout(state.retryTimer);
    state.retryTimer = 0;
    state.autoRetries = 0;
    abortEnrichment();
    state.enrich = null;
    state.enrichKey = "";
    state.enrichPendingKey = "";
    state.sortLoading = false;
    assignState(next);
    state.query = "";
    els.searchInput.value = "";
    state.error = null;

    const record = readCacheFor(state);
    state.data = record ? record.data : null;
    state.lastLoadedAt = record
      ? Date.parse(record.data.fetchedAt || "") || record.savedAt
      : 0;
    syncControls();
    if (state.data) renderAll();
    load();
  }

  async function fetchAppPayload(id, signal) {
    if (window.AppleDirect && typeof window.AppleDirect.fetchDetail === "function") {
      try {
        const detail = await window.AppleDirect.fetchDetail(
          id,
          state.country,
          state.platform,
          signal,
        );
        if (detail) return detail;
      } catch (error) {
        if (error.name === "AbortError") throw error;
      }
    }

    const params = new URLSearchParams({
      id,
      country: state.country,
      platform: state.platform,
    });
    const response = await fetch(`/api/app?${params.toString()}`, {
      signal,
      headers: { accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !payload.app) {
      throw new Error(payload?.error?.message || "应用详情加载失败");
    }
    return payload.app;
  }

  async function openApp(app) {
    const seq = ++state.detailSeq;
    if (state.detailAbort) state.detailAbort.abort();

    if (!els.dialog.open) {
      els.dialog.showModal();
    }
    document.body.classList.add("dialog-open");

    const key = `${state.country}:${state.platform}:${app.id}`;
    const cached = detailCache.get(key);
    if (cached) {
      renderDialogApp(cached, app);
      return;
    }

    renderDialogLoading(app);
    const controller = new AbortController();
    state.detailAbort = controller;

    try {
      const appDetail = await fetchAppPayload(app.id, controller.signal);

      if (seq !== state.detailSeq) return;
      const detail = sanitizeDetail(appDetail, app);
      detailCache.set(key, detail);
      if (detailCache.size > 20) {
        detailCache.delete(detailCache.keys().next().value);
      }
      renderDialogApp(detail, app);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (seq !== state.detailSeq) return;
      renderDialogError(app, error.message);
    }
  }

  function sanitizeDetail(raw, fallback) {
    const icon = safeImageUrl(raw.icon) || fallback.icon;
    const screenshots = Array.isArray(raw.screenshots)
      ? raw.screenshots
          .map(safeImageUrl)
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const rating = Math.min(
      5,
      Math.max(0, Number(raw.rating) || 0),
    );
    const ratingCount = Math.max(0, Number(raw.ratingCount) || 0);

    return {
      name: String(raw.name || fallback.name),
      artist: String(raw.artist || fallback.artist || "未知开发者"),
      icon,
      rating,
      ratingCount,
      price: Number.isFinite(Number(raw.price))
        ? Number(raw.price)
        : fallback.price,
      priceLabel: String(raw.priceLabel || fallback.priceLabel || ""),
      category: String(raw.category || fallback.category || ""),
      description: String(raw.description || ""),
      screenshots,
      version: String(raw.version || ""),
      contentRating: String(raw.contentRating || ""),
      updatedDate: String(raw.updatedDate || ""),
      storeUrl: safeStoreUrl(raw.storeUrl) || safeStoreUrl(fallback.url),
    };
  }

  function renderDialogLoading(app) {
    const content = els.dialogContent;
    content.setAttribute("aria-busy", "true");
    content.replaceChildren();

    const hero = el("div", "dialog-hero");
    hero.appendChild(buildIcon(app, "dialog-icon", false));
    const copy = el("div", "dialog-copy dialog-skeleton");
    copy.appendChild(el("div", "dialog-title", app.name));
    copy.appendChild(el("div", "dialog-artist", app.artist || "未知开发者"));
    copy.appendChild(el("div", "sk sk-line sk-sub"));
    copy.appendChild(el("div", "sk sk-line sk-title"));
    hero.appendChild(copy);
    content.appendChild(hero);

    content.appendChild(el("div", "sk sk-cta"));
  }

  function renderDialogApp(app, fallback) {
    const content = els.dialogContent;
    content.setAttribute("aria-busy", "false");
    content.replaceChildren();

    const hero = el("div", "dialog-hero");
    hero.appendChild(
      buildIcon({ ...fallback, icon: app.icon, name: app.name }, "dialog-icon", false),
    );

    const copy = el("div", "dialog-copy");
    copy.appendChild(el("h2", "dialog-title", app.name));
    copy.appendChild(el("div", "dialog-artist", app.artist));

    const rating = el("div", "dialog-rating");
    if (app.ratingCount > 0) {
      rating.appendChild(el("span", "star", "★"));
      rating.appendChild(el("strong", "", app.rating.toFixed(1)));
      rating.appendChild(
        el(
          "span",
          "",
          `· ${formatCompact(app.ratingCount)} 个评分`,
        ),
      );
    } else {
      rating.appendChild(el("span", "", "暂无评分"));
    }
    copy.appendChild(rating);

    const pills = el("div", "dialog-pills");
    const category =
      categoryLabel(fallback) || app.category || "App";
    pills.appendChild(el("span", "pill", category));
    pills.appendChild(el("span", "pill", priceText(app)));
    if (app.version) pills.appendChild(el("span", "pill", `v${app.version}`));
    if (app.contentRating) {
      pills.appendChild(el("span", "pill", app.contentRating));
    }
    if (app.updatedDate) {
      pills.appendChild(
        el("span", "pill", `更新于 ${formatDate(app.updatedDate)}`),
      );
    }
    copy.appendChild(pills);

    const storeUrl = app.storeUrl || safeStoreUrl(fallback.url);
    if (storeUrl) {
      const actions = el("div", "dialog-actions");
      const cta = el("a", "btn-primary");
      cta.href = storeUrl;
      cta.target = "_blank";
      cta.rel = "noopener noreferrer";
      cta.appendChild(document.createTextNode("在 App Store 打开"));
      const arrow = el("span", "", "↗");
      arrow.setAttribute("aria-hidden", "true");
      cta.appendChild(arrow);
      actions.appendChild(cta);
      copy.appendChild(actions);
    }

    hero.appendChild(copy);
    content.appendChild(hero);

    if (app.screenshots.length) {
      const section = el("section", "dialog-section");
      const head = el("div", "dialog-section-head");
      head.appendChild(el("span", "dialog-section-title", "预览"));
      section.appendChild(head);
      const shots = el("div", "shots");
      app.screenshots.forEach((src, index) => {
        const image = el("img");
        image.src = src;
        image.alt = `${app.name} 截图 ${index + 1}`;
        image.loading = "lazy";
        image.decoding = "async";
        shots.appendChild(image);
      });
      section.appendChild(shots);
      content.appendChild(section);
    }

    if (app.description) {
      const section = el("section", "dialog-section");
      const head = el("div", "dialog-section-head");
      head.appendChild(el("span", "dialog-section-title", "关于这款 App"));
      section.appendChild(head);

      const description = el("p", "dialog-description", app.description);
      section.appendChild(description);

      if (app.description.length > 300) {
        const toggle = el("button", "desc-toggle", "展开全文");
        toggle.type = "button";
        toggle.setAttribute("aria-expanded", "false");
        toggle.addEventListener("click", () => {
          const expanded = description.classList.toggle("is-expanded");
          toggle.textContent = expanded ? "收起" : "展开全文";
          toggle.setAttribute("aria-expanded", String(expanded));
        });
        section.appendChild(toggle);
      }
      content.appendChild(section);
    }
  }

  function renderDialogError(app, message) {
    const content = els.dialogContent;
    content.setAttribute("aria-busy", "false");
    content.replaceChildren();

    const wrap = el("div", "dialog-error");
    const icon = el("span", "state-icon");
    icon.innerHTML = STATIC_ICONS.alert;
    icon.setAttribute("aria-hidden", "true");
    wrap.appendChild(icon);
    wrap.appendChild(el("h3", "", "详情加载失败"));
    wrap.appendChild(
      el(
        "p",
        "",
        `${message || "Apple 暂时没有返回这款应用的信息"}。你仍然可以直接前往 App Store 查看。`,
      ),
    );

    const storeUrl = safeStoreUrl(app.url);
    if (storeUrl) {
      const cta = el("a", "btn-primary", "在 App Store 查看");
      cta.href = storeUrl;
      cta.target = "_blank";
      cta.rel = "noopener noreferrer";
      wrap.appendChild(cta);
    }
    content.appendChild(wrap);
  }

  function closeAppDialog() {
    if (els.dialog.open) els.dialog.close();
  }

  function onDialogClosed() {
    state.detailSeq += 1;
    if (state.detailAbort) {
      state.detailAbort.abort();
      state.detailAbort = null;
    }
    document.body.classList.remove("dialog-open");
    updateScrollChrome();
  }

  function showToast(message, type) {
    const toast = els.toast;
    toast.textContent = message;
    toast.className =
      "toast is-visible" + (type === "error" ? " is-error" : "");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

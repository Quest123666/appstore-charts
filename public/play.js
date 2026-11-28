(function () {
  "use strict";

  const TYPES = {
    apps: { label: "应用", file: "apps" },
    games: { label: "游戏", file: "games" },
  };
  const CHARTS = {
    free: "免费榜",
    paid: "付费榜",
    grossing: "畅销榜",
  };
  const COUNTRIES = {
    us: {
      label: "美国",
      kicker: "GOOGLE PLAY · US",
      eyebrow: "GOOGLE PLAY · UNITED STATES",
      charts: ["free", "paid", "grossing"],
    },
    cn: {
      label: "中国",
      kicker: "GOOGLE PLAY · CN",
      eyebrow: "GOOGLE PLAY · CHINA",
      charts: ["free", "grossing"],
    },
  };
  const SORTS = {
    chart: "榜内顺序",
    rating: "评分排序",
    price: "价格排序",
  };

  const state = {
    country: "us",
    type: "apps",
    chart: "free",
    sort: "chart",
    data: null,
    loading: false,
    error: "",
    query: "",
    seq: 0,
  };

  let els = null;
  let searchTimer = 0;
  let toastTimer = 0;
  let scrollTicking = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function padRank(rank) {
    return String(rank).padStart(2, "0");
  }

  function medalFor(rank) {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return null;
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

  function safePlayUrl(raw, id) {
    const fallback = id
      ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(
          id,
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

  function formatUpdated(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function formatRating(value) {
    const rating = Number(value);
    if (!Number.isFinite(rating) || rating <= 0) return "暂无评分";
    return `★ ${rating.toFixed(1)}`;
  }

  function priceText(app) {
    if (app.priceLabel) return app.priceLabel;
    return Number(app.price) === 0 ? "免费" : `$${Number(app.price).toFixed(2)}`;
  }

  function readStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const country = params.get("country");
    const type = params.get("type");
    const chart = params.get("chart");
    const sort = params.get("sort");
    const nextCountry = COUNTRIES[country] ? country : "us";
    const nextType = TYPES[type] ? type : "apps";
    let nextChart = CHARTS[chart] ? chart : "free";
    if (!COUNTRIES[nextCountry].charts.includes(nextChart)) {
      nextChart = "free";
    }
    let nextSort = SORTS[sort] ? sort : "chart";
    if (nextSort === "price" && (nextChart === "free" || nextCountry === "cn")) {
      nextSort = "chart";
    }
    return {
      country: nextCountry,
      type: nextType,
      chart: nextChart,
      sort: nextSort,
    };
  }

  function updateURL() {
    const params = new URLSearchParams();
    if (state.country !== "us") params.set("country", state.country);
    params.set("type", state.type);
    params.set("chart", state.chart);
    if (state.sort !== "chart") params.set("sort", state.sort);
    const next = `?${params.toString()}`;
    if (window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }

  function syncControls() {
    for (const button of els.countryControl.querySelectorAll("button")) {
      const active = button.dataset.value === state.country;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    const available = COUNTRIES[state.country].charts;
    for (const button of els.chartControl.querySelectorAll("button")) {
      const value = button.dataset.value;
      const ok = available.includes(value);
      button.disabled = !ok;
      button.title = ok ? "" : "中国区 Google Play 没有付费应用";
    }
    for (const button of els.typeControl.querySelectorAll("button")) {
      const active = button.dataset.value === state.type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    for (const button of els.chartControl.querySelectorAll("button")) {
      const active = button.dataset.value === state.chart;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    for (const button of els.sortControl.querySelectorAll("button")) {
      const value = button.dataset.value;
      const active = value === state.sort;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      const priceUnavailable =
        value === "price" &&
        (state.chart === "free" || state.country === "cn");
      button.classList.toggle("is-unavailable", priceUnavailable);
      button.title = priceUnavailable
        ? state.country === "cn"
          ? "中国区应用均为免费"
          : "免费榜所有 App 价格相同"
        : value === "price"
          ? "价格从低到高"
          : "";
    }
    if (els.followContext) {
      const parts = [
        COUNTRIES[state.country].label,
        TYPES[state.type].label,
        CHARTS[state.chart],
      ];
      if (state.sort !== "chart") parts.push(SORTS[state.sort]);
      els.followContext.textContent = parts.join(" · ");
    }

    const country = COUNTRIES[state.country];
    if (els.heroCountry) els.heroCountry.textContent = country.label;
    if (els.eyebrow) els.eyebrow.textContent = country.eyebrow;
    if (els.kicker) els.kicker.textContent = country.kicker;
    if (els.statContext) {
      els.statContext.textContent = `Google Play · ${country.label}`;
    }
    if (els.liveLink) {
      const store = state.type === "games" ? "games" : "apps";
      els.liveLink.href =
        `https://play.google.com/store/${store}` +
        `?device=phone&gl=${state.country}`;
    }
  }

  function setState(kind, title, message, withRetry) {
    if (!kind) {
      els.state.hidden = true;
      els.state.replaceChildren();
      return;
    }
    els.state.hidden = false;
    els.state.className = `state-card ${kind}-state`;
    els.state.replaceChildren();
    els.state.appendChild(el("h3", "", title));
    if (message) els.state.appendChild(el("p", "", message));
    if (withRetry) {
      const button = el("button", "btn-primary", "重新加载");
      button.type = "button";
      button.addEventListener("click", () => load());
      els.state.appendChild(button);
    }
  }

  function renderSkeleton() {
    els.list.replaceChildren();
    els.list.classList.remove("is-single");
    const left = el("div", "rank-col");
    const right = el("div", "rank-col");
    for (let index = 0; index < 6; index += 1) {
      left.appendChild(el("div", "sk sk-rank"));
      right.appendChild(el("div", "sk sk-rank"));
    }
    els.list.appendChild(left);
    els.list.appendChild(right);
  }

  function buildIcon(app, index) {
    const src = safeIcon(app.icon);
    if (!src) {
      return el(
        "span",
        "app-icon play-icon-fallback",
        (app.name || "?").slice(0, 1).toUpperCase(),
      );
    }
    const image = el("img", "app-icon");
    image.src = src;
    image.alt = "";
    image.loading = index > 7 ? "lazy" : "eager";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      const fallback = el(
        "span",
        "app-icon play-icon-fallback",
        (app.name || "?").slice(0, 1).toUpperCase(),
      );
      image.replaceWith(fallback);
    });
    return image;
  }

  function buildCard(app, index, typeLabel, displayRank) {
    const card = el("a", "rank-card play-card");
    const url = safePlayUrl(app.url, app.id);
    card.href = url || "https://play.google.com/store/apps";
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.dataset.rank = String(displayRank);
    const medal = medalFor(displayRank);
    if (medal) card.dataset.medal = medal;
    card.setAttribute(
      "aria-label",
      `第 ${displayRank} 名 ${app.name}，在 Google Play 打开`,
    );
    card.style.setProperty("--delay", `${Math.min(index, 10) * 22}ms`);

    const rankWrap = el("span", "rank-wrap");
    rankWrap.appendChild(el("span", "rank-num", padRank(displayRank)));
    if (displayRank !== app.rank) {
      rankWrap.appendChild(
        el("span", "rank-origin", `原榜 ${padRank(app.rank)}`),
      );
    }
    card.appendChild(rankWrap);
    card.appendChild(buildIcon(app, index));

    const copy = el("div", "rank-copy");
    const name = el("span", "rank-name", app.name);
    name.title = app.name;
    copy.appendChild(name);
    const meta = el("div", "rank-meta");
    const artist = el("span", "rank-artist", app.artist || "未知开发者");
    artist.title = app.artist || "未知开发者";
    meta.appendChild(artist);
    const rating = el(
      "span",
      "sort-metric",
      formatRating(app.rating),
    );
    meta.appendChild(rating);
    meta.appendChild(el("span", "genre-tag", typeLabel));
    copy.appendChild(meta);
    card.appendChild(copy);

    card.appendChild(el("span", "rank-price", priceText(app)));
    const arrow = el("span", "rank-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    card.appendChild(arrow);
    return card;
  }

  function sortResults(results) {
    const sorted = results.slice();
    if (state.sort === "rating") {
      sorted.sort(
        (a, b) =>
          (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
          a.rank - b.rank,
      );
    } else if (state.sort === "price") {
      sorted.sort(
        (a, b) =>
          (Number(a.price) || 0) - (Number(b.price) || 0) ||
          (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
          a.rank - b.rank,
      );
    } else {
      sorted.sort((a, b) => a.rank - b.rank);
    }
    return sorted;
  }

  function render() {
    if (!state.data) {
      if (state.loading) renderSkeleton();
      return;
    }

    const typeLabel = TYPES[state.type].label;
    const chartLabel = CHARTS[state.chart];
    const sortLabel = SORTS[state.sort];
    const query = state.query.trim().toLowerCase();
    const filtered = (state.data.results || []).filter((app) => {
      if (!query) return true;
      return `${app.name} ${app.artist}`
        .toLowerCase()
        .includes(query);
    });
    const results = sortResults(filtered);

    els.listTitle.textContent = `${typeLabel}榜`;
    els.listSub.textContent =
      state.sort === "chart"
        ? `${chartLabel} · TOP ${state.data.count || 0}`
        : `${chartLabel} · ${sortLabel} · TOP ${state.data.count || 0}`;
    els.statCount.textContent = String(state.data.count || 0);
    els.statUpdated.textContent = formatUpdated(state.data.fetchedAt);
    document.title =
      `${typeLabel}榜 · ${chartLabel} · ${sortLabel} — Google Play ${COUNTRIES[state.country].label} | AppPodium`;

    if (results.length === 0) {
      els.list.replaceChildren();
      setState(
        "empty",
        query ? "没有匹配的应用" : "暂无数据",
        query ? "换一个关键词试试。" : "数据文件暂时为空。",
        false,
      );
      return;
    }

    setState(null);
    els.list.replaceChildren();
    els.list.classList.remove("is-single");

    const half = Math.ceil(results.length / 2);
    const left = el("div", "rank-col");
    const right = el("div", "rank-col");
    results.forEach((app, index) => {
      const displayRank = index + 1;
      const card = buildCard(app, index, typeLabel, displayRank);
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

  function showToast(message, type) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.className =
      "toast is-visible" + (type === "error" ? " is-error" : "");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 3200);
  }

  async function load(options = {}) {
    const seq = ++state.seq;
    const manual = Boolean(options.manual);
    const previousFetchedAt =
      options.previous !== undefined
        ? options.previous
        : state.data?.fetchedAt || "";
    state.loading = true;
    state.error = "";
    els.rankings.setAttribute("aria-busy", "true");
    els.progressBar.hidden = false;
    if (els.fabRefresh) {
      els.fabRefresh.disabled = true;
      els.fabRefresh.classList.add("is-loading");
    }
    renderSkeleton();
    setState(null);
    syncControls();
    updateURL();

    const file =
      `/data/play-${state.country}-` +
      `${TYPES[state.type].file}-${state.chart}.json`;

    try {
      const response = await fetch(file, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (seq !== state.seq) return;
      if (
        !response.ok ||
        !payload ||
        payload.ok === false ||
        !Array.isArray(payload.results)
      ) {
        throw new Error("Google Play 榜单数据暂时不可用");
      }

      state.data = payload;
      state.loading = false;
      render();
      if (manual) {
        const unchanged =
          previousFetchedAt &&
          previousFetchedAt === payload.fetchedAt;
        showToast(
          unchanged ? "已刷新，数据快照未变化" : "榜单数据已刷新",
        );
      }
    } catch (error) {
      if (seq !== state.seq) return;
      state.loading = false;
      state.data = null;
      state.error = error?.message || "Google Play 榜单加载失败";
      els.list.replaceChildren();
      setState(
        "error",
        "Google Play 数据暂时不可用",
        state.error,
        true,
      );
      if (manual) {
        showToast("刷新失败，请稍后再试", "error");
      }
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        els.progressBar.hidden = true;
        els.rankings.setAttribute("aria-busy", "false");
        if (els.fabRefresh) {
          els.fabRefresh.disabled = false;
          els.fabRefresh.classList.remove("is-loading");
        }
      }
    }
  }

  function setSort(value) {
    if (!SORTS[value] || value === state.sort) return;
    if (
      value === "price" &&
      (state.chart === "free" || state.country === "cn")
    ) {
      showToast(
        state.country === "cn"
          ? "中国区应用均为免费，暂不支持价格排序"
          : "免费榜所有 App 价格相同，暂不支持价格排序",
      );
      return;
    }
    state.sort = value;
    syncControls();
    updateURL();
    render();
  }

  function manualRefresh() {
    if (state.loading) return;
    load({
      manual: true,
      previous: state.data?.fetchedAt || "",
    });
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

  function updateScrollChrome() {
    if (!els?.fabStack) return;
    const y = window.scrollY || 0;
    const controlsBottom = els.controls
      ? els.controls.getBoundingClientRect().bottom
      : 0;
    const showFollow =
      window.innerWidth <= 820 && controlsBottom < 8;
    if (els.mobileFollow) {
      els.mobileFollow.classList.toggle("is-visible", showFollow);
      els.mobileFollow.setAttribute(
        "aria-hidden",
        String(!showFollow),
      );
    }

    const showFab = y > 180;
    els.fabStack.classList.toggle("is-visible", showFab);
    els.fabStack.setAttribute("aria-hidden", String(!showFab));
    els.fabTop.hidden = y < 560;
  }

  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(() => {
      scrollTicking = false;
      updateScrollChrome();
    });
  }

  function initThemeToggle() {
    const button = document.getElementById("themeToggle");
    if (!button) return;
    const apply = (theme) => {
      document.documentElement.dataset.theme = theme;
      try {
        window.localStorage.setItem("apppodium-theme", theme);
      } catch {}
      button.setAttribute(
        "aria-label",
        theme === "dark" ? "切换为浅色模式" : "切换为深色模式",
      );
    };
    const current =
      document.documentElement.dataset.theme === "dark"
        ? "dark"
        : "light";
    apply(current);
    button.addEventListener("click", () => {
      apply(
        document.documentElement.dataset.theme === "dark"
          ? "light"
          : "dark",
      );
    });
  }

  function bindEvents() {
    els.typeControl.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button[data-value]")
          : null;
      if (!button || button.dataset.value === state.type) return;
      state.type = button.dataset.value;
      state.query = "";
      els.searchInput.value = "";
      load();
    });

    els.countryControl.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button[data-value]")
          : null;
      if (!button || button.dataset.value === state.country) return;
      state.country = button.dataset.value;
      const isCn = state.country === "cn";
      let notice = "";
      if (!COUNTRIES[state.country].charts.includes(state.chart)) {
        state.chart = "free";
        notice = "中国区没有付费榜，已切换到免费榜";
      }
      if (state.sort === "price" && (state.chart === "free" || isCn)) {
        state.sort = "chart";
        if (!notice) {
          notice = isCn
            ? "中国区应用均为免费，已取消价格排序"
            : "免费榜价格相同，已恢复榜单排序";
        }
      }
      if (notice) showToast(notice);
      state.query = "";
      els.searchInput.value = "";
      load();
    });

    els.chartControl.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button[data-value]")
          : null;
      if (!button || button.dataset.value === state.chart) return;
      state.chart = button.dataset.value;
      if (state.chart === "free" && state.sort === "price") {
        state.sort = "chart";
        showToast("免费榜价格相同，已恢复榜单排序");
      }
      state.query = "";
      els.searchInput.value = "";
      load();
    });

    els.sortControl.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button[data-value]")
          : null;
      if (!button) return;
      setSort(button.dataset.value);
    });

    els.searchInput.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.query = els.searchInput.value;
        render();
      }, 80);
    });

    els.fabRefresh.addEventListener("click", manualRefresh);
    els.fabTop.addEventListener("click", scrollToTop);
    els.followFilter.addEventListener("click", () => {
      els.controls.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function init() {
    els = {
      typeControl: document.getElementById("playTypeControl"),
      chartControl: document.getElementById("playChartControl"),
      countryControl: document.getElementById("playCountryControl"),
      sortControl: document.getElementById("playSortControl"),
      heroCountry: document.getElementById("playHeroCountry"),
      eyebrow: document.getElementById("playEyebrow"),
      kicker: document.getElementById("playKicker"),
      statContext: document.getElementById("playStatContext"),
      liveLink: document.getElementById("playLiveLink"),
      searchInput: document.getElementById("playSearchInput"),
      list: document.getElementById("playList"),
      listTitle: document.getElementById("playListTitle"),
      listSub: document.getElementById("playListSub"),
      statCount: document.getElementById("statCount"),
      statUpdated: document.getElementById("statUpdated"),
      state: document.getElementById("playState"),
      rankings: document.getElementById("playRankings"),
      progressBar: document.getElementById("progressBar"),
      fabStack: document.getElementById("playFabStack"),
      fabRefresh: document.getElementById("playFabRefresh"),
      fabTop: document.getElementById("playFabTop"),
      toast: document.getElementById("playToast"),
      controls: document.getElementById("playControls"),
      mobileFollow: document.getElementById("playMobileFollow"),
      followContext: document.getElementById("playFollowContext"),
      followFilter: document.getElementById("playFollowFilter"),
    };

    const initial = readStateFromURL();
    state.country = initial.country;
    state.type = initial.type;
    state.chart = initial.chart;
    state.sort = initial.sort;
    initThemeToggle();
    syncControls();
    bindEvents();
    updateScrollChrome();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

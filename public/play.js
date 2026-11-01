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

  const state = {
    type: "apps",
    chart: "free",
    data: null,
    loading: false,
    error: "",
    query: "",
    seq: 0,
  };

  let els = null;
  let searchTimer = 0;

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
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
    const type = params.get("type");
    const chart = params.get("chart");
    return {
      type: TYPES[type] ? type : "apps",
      chart: CHARTS[chart] ? chart : "free",
    };
  }

  function updateURL() {
    const params = new URLSearchParams();
    params.set("type", state.type);
    params.set("chart", state.chart);
    const next = `?${params.toString()}`;
    if (window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }

  function syncControls() {
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
      button.addEventListener("click", load);
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

  function buildCard(app, index, typeLabel) {
    const card = el("a", "rank-card play-card");
    const url = safePlayUrl(app.url, app.id);
    card.href = url || "https://play.google.com/store/apps";
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.dataset.rank = String(app.rank);
    const medal = medalFor(app.rank);
    if (medal) card.dataset.medal = medal;
    card.setAttribute(
      "aria-label",
      `第 ${app.rank} 名 ${app.name}，在 Google Play 打开`,
    );
    card.style.setProperty("--delay", `${Math.min(index, 10) * 22}ms`);

    const rankWrap = el("span", "rank-wrap");
    rankWrap.appendChild(el("span", "rank-num", padRank(app.rank)));
    card.appendChild(rankWrap);
    card.appendChild(buildIcon(app, index));

    const copy = el("div", "rank-copy");
    copy.appendChild(el("span", "rank-name", app.name));
    const meta = el("div", "rank-meta");
    meta.appendChild(
      el("span", "rank-artist", app.artist || "未知开发者"),
    );
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

  function render() {
    if (!state.data) {
      if (state.loading) renderSkeleton();
      return;
    }

    const typeLabel = TYPES[state.type].label;
    const chartLabel = CHARTS[state.chart];
    const query = state.query.trim().toLowerCase();
    const results = (state.data.results || []).filter((app) => {
      if (!query) return true;
      return `${app.name} ${app.artist}`
        .toLowerCase()
        .includes(query);
    });

    els.listTitle.textContent = `${typeLabel}榜`;
    els.listSub.textContent = `${chartLabel} · TOP ${state.data.count || 0}`;
    els.statCount.textContent = String(state.data.count || 0);
    els.statUpdated.textContent = formatUpdated(state.data.fetchedAt);
    document.title = `${typeLabel}榜 · ${chartLabel} — Google Play 美国 | AppPodium`;

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
      const card = buildCard(app, index, typeLabel);
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

  async function load() {
    const seq = ++state.seq;
    state.loading = true;
    state.error = "";
    els.rankings.setAttribute("aria-busy", "true");
    els.progressBar.hidden = false;
    renderSkeleton();
    setState(null);
    syncControls();
    updateURL();

    const file = `/data/play-us-${TYPES[state.type].file}-${state.chart}.json`;

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
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        els.progressBar.hidden = true;
        els.rankings.setAttribute("aria-busy", "false");
      }
    }
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

    els.chartControl.addEventListener("click", (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest("button[data-value]")
          : null;
      if (!button || button.dataset.value === state.chart) return;
      state.chart = button.dataset.value;
      state.query = "";
      els.searchInput.value = "";
      load();
    });

    els.searchInput.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.query = els.searchInput.value;
        render();
      }, 80);
    });
  }

  function init() {
    els = {
      typeControl: document.getElementById("playTypeControl"),
      chartControl: document.getElementById("playChartControl"),
      searchInput: document.getElementById("playSearchInput"),
      list: document.getElementById("playList"),
      listTitle: document.getElementById("playListTitle"),
      listSub: document.getElementById("playListSub"),
      statCount: document.getElementById("statCount"),
      statUpdated: document.getElementById("statUpdated"),
      state: document.getElementById("playState"),
      rankings: document.getElementById("playRankings"),
      progressBar: document.getElementById("progressBar"),
    };

    const initial = readStateFromURL();
    state.type = initial.type;
    state.chart = initial.chart;
    syncControls();
    bindEvents();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

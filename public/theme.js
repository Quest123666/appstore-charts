(function () {
  try {
    var key = "apppodium-theme";
    var saved = window.localStorage.getItem(key);
    var prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = saved === "dark" || saved === "light" ? saved : prefersDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();

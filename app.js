(function () {
  "use strict";

  var SEED = window.SEED_FACTS || [];
  var POOL_SIZE = 7;
  var SAVE_KEY = "kf:saved:v1";
  var WIKI_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/random/summary";
  var WIKI_BATCH = 3;

  var LABELS = {
    science: "Science", history: "History", language: "Language", math: "Math",
    ideas: "Ideas", technology: "Technology", nature: "Nature", random: "Wikipedia"
  };

  var feed = document.getElementById("feed");
  var spacerTop = document.getElementById("spacer-top");
  var spacerBottom = document.getElementById("spacer-bottom");
  var emptyEl = document.getElementById("empty");
  var selCategory = document.getElementById("category");
  var savedViewBtn = document.getElementById("saved-view");
  var savedCountEl = document.getElementById("saved-count");
  var saveCardBtn = document.getElementById("save-card");
  var counterEl = document.getElementById("counter");
  var hintEl = document.getElementById("hint");

  var state = {
    mode: "all",
    category: "all",
    facts: [],
    ci: 0,
    windowStart: -1,
    saved: loadSaved(),
    loading: false,
    online: navigator.onLine
  };
  var deck = shuffle(seedForCategory("all"));

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; }
    catch (e) { return []; }
  }
  function persistSaved() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.saved)); } catch (e) {}
  }
  function isSaved(id) {
    for (var i = 0; i < state.saved.length; i++) if (state.saved[i].id === id) return true;
    return false;
  }
  function addSaved(f) {
    if (isSaved(f.id)) return;
    state.saved.unshift({
      id: f.id, title: f.title, text: f.text, category: f.category,
      source: f.source, curated: f.curated
    });
    persistSaved();
  }
  function removeSaved(id) {
    state.saved = state.saved.filter(function (f) { return f.id !== id; });
    persistSaved();
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function seedForCategory(cat) {
    return SEED.filter(function (f) { return cat === "all" ? true : f.category === cat; });
  }
  function takeSeed(n) {
    var out = [];
    while (out.length < n) {
      if (deck.length === 0) deck = shuffle(seedForCategory(state.category));
      var f = deck.shift();
      if (f) out.push(f); else break;
    }
    return out;
  }

  function trimWiki(t) {
    t = (t || "").trim();
    if (t.length <= 250) return t;
    var cut = t.slice(0, 250);
    var sp = cut.lastIndexOf(" ");
    if (sp > 160) cut = cut.slice(0, sp);
    return cut + "\u2026";
  }
  function normalizeWiki(data) {
    if (!data || !data.extract) return null;
    if (data.type === "disambiguation" || data.type === "no-extract" || data.type === "mainpage" || data.type === "related") return null;
    var text = trimWiki(data.extract);
    if (text.length < 60) return null;
    var src = (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) ||
              ("https://en.wikipedia.org/wiki/" + encodeURIComponent(data.title || ""));
    return {
      id: "wiki:" + (data.title || Math.random().toString(36).slice(2)),
      title: data.title || null,
      text: text,
      category: "random",
      source: src,
      curated: false
    };
  }
  function fetchWikiBatch(n) {
    var tasks = [];
    for (var i = 0; i < n; i++) {
      tasks.push(fetch(WIKI_ENDPOINT, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }));
    }
    return Promise.all(tasks).then(function (arr) {
      return arr.map(normalizeWiki).filter(Boolean);
    });
  }

  function appendFacts(list) {
    var seen = {};
    for (var i = 0; i < state.facts.length; i++) seen[state.facts[i].id] = true;
    for (var j = 0; j < list.length; j++) {
      var f = list[j];
      if (f && !seen[f.id]) { state.facts.push(f); seen[f.id] = true; }
    }
  }

  function ensureMore() {
    if (state.loading) return;
    if (state.mode === "saved") return;
    if (state.facts.length - state.ci > 6) return;

    if (state.mode === "all" && state.online) {
      state.loading = true;
      fetchWikiBatch(WIKI_BATCH).then(function (batch) {
        state.loading = false;
        if (batch.length === 0) appendFacts(takeSeed(WIKI_BATCH));
        else appendFacts(batch);
        scheduleRender();
        if (state.facts.length - state.ci <= 6) ensureMore();
      }).catch(function () {
        state.loading = false;
        appendFacts(takeSeed(WIKI_BATCH));
        scheduleRender();
      });
    } else {
      appendFacts(takeSeed(4));
      scheduleRender();
    }
  }

  function showEmpty(yes) { if (emptyEl) emptyEl.hidden = !yes; }

  function reset(mode, category) {
    state.mode = mode;
    state.category = category || "all";
    state.facts = [];
    state.ci = 0;
    state.windowStart = -1;
    deck = shuffle(seedForCategory(state.category));

    if (state.mode === "saved") {
      if (state.saved.length === 0) {
        showEmpty(true);
      } else {
        showEmpty(false);
        appendFacts(state.saved.slice());
        appendFacts([{ id: "__end__", end: true, category: "random" }]);
      }
    } else {
      showEmpty(false);
      var initial = Math.min(seedForCategory(state.category).length, POOL_SIZE + 2);
      appendFacts(takeSeed(initial));
    }

    feed.scrollTop = 0;
    savedViewBtn.classList.toggle("is-active", state.mode === "saved");
    savedViewBtn.setAttribute("aria-label", state.mode === "saved" ? "Back to feed" : "View saved facts");
    scheduleRender();
    ensureMore();
  }

  function getH() { return feed.clientHeight || window.innerHeight; }

  function labelFor(cat) { return LABELS[cat] || "Fact"; }

  function fillCard(node, fact, idx) {
    node.dataset.idx = String(idx);
    if (fact.end) {
      node.classList.add("card--end");
      node.removeAttribute("data-category");
      var pEnd = node.querySelector(".card__pill"); pEnd.style.display = "none";
      node.querySelector(".card__source").style.display = "none";
      node.querySelector(".card__text").textContent = "That's everything you've saved.";
      node.setAttribute("aria-label", "End");
      setActive(node, idx);
      return;
    }
    node.classList.remove("card--end");
    var pill = node.querySelector(".card__pill");
    pill.style.display = "";
    pill.textContent = labelFor(fact.category);
    pill.setAttribute("data-category", fact.category);
    node.setAttribute("data-category", fact.category);
    node.querySelector(".card__text").textContent = fact.text;
    var src = node.querySelector(".card__source");
    src.style.display = "";
    src.href = fact.source || "#";
    src.textContent = (fact.title ? fact.title : (fact.curated ? "Source" : "Wikipedia")) + " \u2197";
    node.setAttribute("aria-label", labelFor(fact.category) + " fact");
    setActive(node, idx);
  }

  function setActive(node, idx) {
    if (idx === state.ci) node.classList.add("is-active");
    else node.classList.remove("is-active");
  }

  function render() {
    var total = state.facts.length;
    var H = getH();

    if (total === 0) {
      spacerTop.style.height = "0px";
      spacerBottom.style.height = "0px";
      for (var z = 0; z < pool.length; z++) { pool[z].style.display = "none"; pool[z].classList.remove("is-active"); }
      updateChrome();
      return;
    }

    var start = Math.max(0, Math.min(total - POOL_SIZE, state.ci - 2));
    var end = Math.min(total, start + POOL_SIZE);

    for (var i = 0; i < pool.length; i++) {
      var node = pool[i];
      var idx = start + i;
      if (idx < end) { fillCard(node, state.facts[idx], idx); node.style.display = ""; }
      else { node.style.display = "none"; node.classList.remove("is-active"); }
    }

    spacerTop.style.height = (start * H) + "px";
    spacerBottom.style.height = (Math.max(0, (total - end) * H)) + "px";
    state.windowStart = start;
    updateChrome();
  }

  function updateChrome() {
    var cur = state.facts[state.ci];
    counterEl.textContent = state.facts.length ? String(state.ci + 1) : "";
    savedCountEl.textContent = String(state.saved.length);
    if (cur && !cur.end) {
      saveCardBtn.disabled = false;
      var saved = isSaved(cur.id);
      saveCardBtn.setAttribute("aria-pressed", saved ? "true" : "false");
      saveCardBtn.classList.toggle("is-saved", saved);
    } else {
      saveCardBtn.disabled = true;
      saveCardBtn.setAttribute("aria-pressed", "false");
      saveCardBtn.classList.remove("is-saved");
    }
  }

  var rafPending = false;
  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; render(); });
  }

  function onScroll() {
    var H = getH();
    var ci = Math.round(feed.scrollTop / H);
    var total = state.facts.length;
    if (total) ci = Math.max(0, Math.min(total - 1, ci));
    if (ci !== state.ci) {
      state.ci = ci;
      scheduleRender();
      ensureMore();
    }
  }

  function goTo(i, smooth) {
    var H = getH();
    var total = state.facts.length;
    if (!total) return;
    i = Math.max(0, Math.min(total - 1, i));
    feed.scrollTo({ top: i * H, behavior: smooth === false ? "auto" : "smooth" });
  }

  function toggleSaveCurrent() {
    var cur = state.facts[state.ci];
    if (!cur || cur.end) return;
    if (isSaved(cur.id)) removeSaved(cur.id); else addSaved(cur);
    updateChrome();
    if (state.mode === "saved") reset("saved", "all");
  }

  function showHelp() {
    if (hintEl) {
      hintEl.style.animation = "none";
      hintEl.style.opacity = "1";
      hintEl.style.visibility = "visible";
      hintEl.textContent = "↑ ↓ browse \u00b7 Space next \u00b7 s save \u00b7 1-7 jump to topic";
      window.setTimeout(function () { hintEl.style.opacity = "0"; }, 2600);
    }
  }

  /* ---------- Pool setup ---------- */

  function createCardNode() {
    var el = document.createElement("article");
    el.className = "card";
    el.innerHTML =
      '<div class="card__inner">' +
        '<span class="card__pill">Fact</span>' +
        '<p class="card__text"></p>' +
        '<a class="card__source" href="#" target="_blank" rel="noopener noreferrer">Source \u2197</a>' +
      "</div>";
    feed.insertBefore(el, spacerBottom);
    return el;
  }
  var pool = [];
  for (var k = 0; k < POOL_SIZE; k++) pool.push(createCardNode());

  /* ---------- Events ---------- */

  feed.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", scheduleRender);
  window.addEventListener("online", function () { state.online = true; ensureMore(); });
  window.addEventListener("offline", function () { state.online = false; });

  selCategory.addEventListener("change", function () {
    var v = this.value;
    reset(v === "all" ? "all" : "category", v);
  });

  savedViewBtn.addEventListener("click", function () {
    if (state.mode === "saved") { selCategory.value = "all"; reset("all", "all"); }
    else reset("saved", "all");
  });

  saveCardBtn.addEventListener("click", toggleSaveCurrent);

  var TOPIC_KEYS = { "1": "all", "2": "science", "3": "history", "4": "language", "5": "math", "6": "ideas", "7": "technology" };
  window.addEventListener("keydown", function (e) {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var key = e.key;
    if (key === "ArrowDown" || key === "j" || key === "PageDown" || (key === " " && !e.shiftKey)) {
      e.preventDefault(); goTo(state.ci + 1);
    } else if (key === "ArrowUp" || key === "k" || key === "PageUp" || (key === " " && e.shiftKey)) {
      e.preventDefault(); goTo(state.ci - 1);
    } else if (key === "Home") {
      e.preventDefault(); goTo(0);
    } else if (key === "s" || key === "S") {
      e.preventDefault(); toggleSaveCurrent();
    } else if (key === "?" || key === "/") {
      e.preventDefault(); showHelp();
    } else if (TOPIC_KEYS[key]) {
      var cat = TOPIC_KEYS[key];
      selCategory.value = cat;
      reset(cat === "all" ? "all" : "category", cat);
    }
  });

  /* ---------- Init ---------- */

  reset("all", "all");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  var installBtn = document.getElementById("install-btn");
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn) {
    installBtn.addEventListener("click", function () {
      installBtn.hidden = true;
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; }).catch(function () {});
    });
    window.addEventListener("appinstalled", function () {
      installBtn.hidden = true;
      deferredPrompt = null;
    });
  }
})();

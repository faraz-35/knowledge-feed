(function () {
  "use strict";

  var SEED = window.SEED_FACTS || [];
  var SAVE_KEY = "kf:saved:v1";
  var WIKI_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/random/summary";
  var WIKI_BATCH = 3;
  var MAX_CARDS = 240;
  var TRIM_CHUNK = 60;

  var LABELS = {
    science: "Science", history: "History", language: "Language", math: "Math",
    ideas: "Ideas", technology: "Technology", nature: "Nature", random: "Wikipedia"
  };

  var feed = document.getElementById("feed");
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
    trimOffset: 0,
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

  /* ---------- DOM cards (static, no recycling) ---------- */

  function cardH() { return feed.clientHeight || window.innerHeight; }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        var prev = feed.querySelector(".card.is-active");
        if (prev && prev !== e.target) prev.classList.remove("is-active");
        e.target.classList.add("is-active");
        var idx = +e.target.dataset.absIdx;
        if (idx !== state.ci) { state.ci = idx; updateChrome(); ensureMore(); }
        break;
      }
    }
  }, { root: feed, threshold: [0.5] });

  function createCardEl(fact, idx) {
    var el = document.createElement("article");
    el.className = "card";
    el.dataset.absIdx = String(idx);
    var inner = document.createElement("div");
    inner.className = "card__inner";
    var pill = document.createElement("span");
    pill.className = "card__pill";
    var text = document.createElement("p");
    text.className = "card__text";
    var src = document.createElement("a");
    src.className = "card__source";
    src.target = "_blank";
    src.rel = "noopener noreferrer";
    inner.appendChild(pill);
    inner.appendChild(text);
    inner.appendChild(src);
    el.appendChild(inner);
    fillCardEl(el, fact);
    return el;
  }

  function fillCardEl(el, fact) {
    var pill = el.querySelector(".card__pill");
    var text = el.querySelector(".card__text");
    var src = el.querySelector(".card__source");
    if (fact.end) {
      el.classList.add("card--end");
      el.removeAttribute("data-category");
      pill.style.display = "none";
      src.style.display = "none";
      text.textContent = "That's everything you've saved.";
      el.setAttribute("aria-label", "End");
      return;
    }
    el.classList.remove("card--end");
    pill.style.display = "";
    pill.textContent = labelFor(fact.category);
    pill.setAttribute("data-category", fact.category);
    el.setAttribute("data-category", fact.category);
    text.textContent = fact.text;
    src.style.display = "";
    src.href = fact.source || "#";
    src.textContent = (fact.title ? fact.title : (fact.curated ? "Source" : "Wikipedia")) + " \u2197";
    el.setAttribute("aria-label", labelFor(fact.category) + " fact");
  }

  function mountCard(fact) {
    var el = createCardEl(fact, state.facts.length - 1);
    feed.insertBefore(el, emptyEl);
    io.observe(el);
  }

  function clearCards() {
    var cs = feed.querySelectorAll(".card");
    for (var i = 0; i < cs.length; i++) { io.unobserve(cs[i]); cs[i].remove(); }
  }

  function appendFacts(list) {
    var seen = {};
    for (var i = 0; i < state.facts.length; i++) seen[state.facts[i].id] = true;
    for (var j = 0; j < list.length; j++) {
      var f = list[j];
      if (f && !seen[f.id]) { state.facts.push(f); seen[f.id] = true; mountCard(f); }
    }
  }

  function trimIfLarge() {
    var cs = feed.querySelectorAll(".card");
    if (cs.length <= MAX_CARDS) return;
    var H = cardH();
    for (var i = 0; i < TRIM_CHUNK; i++) { io.unobserve(cs[i]); cs[i].remove(); }
    state.trimOffset += TRIM_CHUNK;
    feed.scrollTop -= TRIM_CHUNK * H;
  }

  function ensureMore() {
    if (state.loading) return;
    if (state.mode === "saved") return;
    if (state.facts.length - state.ci > 8) return;

    if (state.mode === "all" && state.online) {
      state.loading = true;
      fetchWikiBatch(WIKI_BATCH).then(function (batch) {
        state.loading = false;
        if (batch.length === 0) appendFacts(takeSeed(WIKI_BATCH));
        else appendFacts(batch);
        if (state.facts.length - state.ci <= 8) ensureMore();
      }).catch(function () {
        state.loading = false;
        appendFacts(takeSeed(WIKI_BATCH));
      });
    } else {
      appendFacts(takeSeed(4));
    }
  }

  function showEmpty(yes) { if (emptyEl) emptyEl.hidden = !yes; }

  function reset(mode, category) {
    state.mode = mode;
    state.category = category || "all";
    clearCards();
    state.facts = [];
    state.ci = 0;
    state.trimOffset = 0;
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
      var initial = Math.min(seedForCategory(state.category).length, 11);
      appendFacts(takeSeed(initial));
    }

    feed.scrollTop = 0;
    var first = feed.querySelector(".card");
    if (first) first.classList.add("is-active");
    savedViewBtn.classList.toggle("is-active", state.mode === "saved");
    savedViewBtn.setAttribute("aria-label", state.mode === "saved" ? "Back to feed" : "View saved facts");
    updateChrome();
    ensureMore();
  }

  function labelFor(cat) { return LABELS[cat] || "Fact"; }

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

  var trimPending = false;
  function onScroll() {
    ensureMore();
    if (!trimPending) {
      trimPending = true;
      requestAnimationFrame(function () { trimPending = false; trimIfLarge(); });
    }
  }

  function goTo(i, smooth) {
    var total = state.facts.length;
    if (!total) return;
    i = Math.max(0, Math.min(total - 1, i));
    var top = (i - state.trimOffset) * cardH();
    if (top < 0) top = 0;
    feed.scrollTo({ top: top, behavior: smooth === false ? "auto" : "smooth" });
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
      hintEl.textContent = "\u2191 \u2193 browse \u00b7 Space next \u00b7 s save \u00b7 1-7 jump to topic";
      window.setTimeout(function () { hintEl.style.opacity = "0"; }, 2600);
    }
  }

  /* ---------- Events ---------- */

  feed.addEventListener("scroll", onScroll, { passive: true });
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
      e.preventDefault(); goTo(state.trimOffset);
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
  var isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
                     window.matchMedia("(display-mode: minimal-ui)").matches ||
                     window.navigator.standalone === true;

  function showMenuHint() {
    var existing = document.querySelector(".toast");
    if (existing) existing.parentNode.removeChild(existing);
    var t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = "Install from your browser menu: \u2630 \u2192 <strong>Install</strong> / <strong>Add to Home screen</strong>";
    document.body.appendChild(t);
    window.setTimeout(function () { t.classList.add("toast--hide"); }, 3400);
    window.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3900);
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn && !isStandalone) {
    installBtn.addEventListener("click", function () {
      if (deferredPrompt) {
        installBtn.hidden = true;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () { deferredPrompt = null; }).catch(function () {});
      } else {
        showMenuHint();
      }
    });
    window.addEventListener("appinstalled", function () {
      installBtn.hidden = true;
      deferredPrompt = null;
    });
    window.setTimeout(function () {
      if (!deferredPrompt && installBtn.hidden) installBtn.hidden = false;
    }, 5000);
  } else if (installBtn) {
    installBtn.hidden = true;
  }
})();

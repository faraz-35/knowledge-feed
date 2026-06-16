(function () {
  "use strict";

  var SEED = window.SEED_FACTS || [];
  var SAVE_KEY = "kf:saved:v1";
  var SEEN_KEY = "kf:seen:v1";
  var WIKI_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/random/summary";
  var WIKI_BATCH = 3;
  var MAX_CARDS = 240;
  var TRIM_CHUNK = 60;

  var LABELS = {
    science: "Science", history: "History", language: "Language", math: "Math",
    ideas: "Ideas", technology: "Technology", nature: "Nature", random: "Wikipedia",
    tech: "Tech", trivia: "Trivia", quote: "Quote", number: "Number"
  };

  var feed = document.getElementById("feed");
  var emptyEl = document.getElementById("empty");
  var selCategory = document.getElementById("category");
  var savedViewBtn = document.getElementById("saved-view");
  var savedCountEl = document.getElementById("saved-count");
  var saveCardBtn = document.getElementById("save-card");
  var counterEl = document.getElementById("counter");

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
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; }
    catch (e) { return []; }
  }
  function persistSaved() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.saved)); } catch (e) {}
  }
  var seen = loadSeen();
  var mounted = new Set();
  function loadSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); }
    catch (e) { return new Set(); }
  }
  function persistSeen() {
    try {
      var arr = Array.from(seen);
      if (arr.length > 8000) arr = arr.slice(arr.length - 8000);
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function markSeen(fact) {
    if (!fact || fact.end || seen.has(fact.id)) return;
    seen.add(fact.id);
    persistSeen();
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
    var pool = seedForCategory(state.category).filter(function (f) { return !seen.has(f.id); });
    if (!pool.length) return [];
    return shuffle(pool).slice(0, n);
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
    var id = "wiki:" + (data.title || Math.random().toString(36).slice(2));
    if (seen.has(id)) return null;
    var src = (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) ||
              ("https://en.wikipedia.org/wiki/" + encodeURIComponent(data.title || ""));
    return {
      id: id,
      title: data.title || null,
      text: text,
      category: "random",
      source: src,
      curated: false
    };
  }
  function fetchWikiRaw() {
    var tasks = [];
    for (var i = 0; i < 5; i++) {
      tasks.push(fetch(WIKI_ENDPOINT, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }));
    }
    return Promise.all(tasks).then(function (arr) { return arr.filter(Boolean); });
  }

  function makeSource(fetchRemote, normalize) {
    var pool = [];
    var pending = null;
    function refill() {
      if (pending) return pending;
      pending = fetchRemote().then(function (raw) {
        pending = null;
        if (raw) for (var i = 0; i < raw.length; i++) {
          try { var f = normalize(raw[i]); if (f) pool.push(f); } catch (e) {}
        }
      }).catch(function () { pending = null; });
      return pending;
    }
    return {
      fetch: function (n) {
        var out = [];
        while (out.length < n && pool.length) out.push(pool.shift());
        if (out.length >= n) return Promise.resolve(out);
        return refill().then(function () {
          while (out.length < n && pool.length) out.push(pool.shift());
          return out;
        });
      }
    };
  }

  function normHn(hit) {
    if (!hit || !hit.title) return null;
    var id = "hn:" + hit.objectID;
    if (seen.has(id)) return null;
    var domain = "Hacker News";
    var src = "https://news.ycombinator.com/item?id=" + hit.objectID;
    if (hit.url) {
      try { domain = new URL(hit.url).hostname.replace(/^www\./, ""); src = hit.url; } catch (e) {}
    }
    var label = domain + " \u00b7 " + (hit.points || 0) + " pts";
    return {
      id: id,
      title: "Hacker News",
      text: hit.title,
      category: "tech",
      source: src,
      sourceLabel: label,
      curated: false
    };
  }
  function fetchHnRaw() {
    return fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.hits) ? j.hits : []; })
      .catch(function () { return []; });
  }

  function normQuote(q) {
    if (!q || !q.quote) return null;
    var text = String(q.quote).replace(/['\u2019]([A-Z])/g, function (m, c) { return m.charAt(0) + c.toLowerCase(); });
    if (text.length > 180) return null;
    var id = "quote:" + q.id;
    if (seen.has(id)) return null;
    var author = q.author || "Unknown";
    return {
      id: id,
      title: author,
      text: "\u201C" + text + "\u201D",
      category: "quote",
      source: "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(author),
      curated: false
    };
  }
  function fetchQuoteRaw() {
    var skip = Math.floor(Math.random() * 1400);
    return fetch("https://dummyjson.com/quotes?limit=20&skip=" + skip, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.quotes) ? j.quotes : []; })
      .catch(function () { return []; });
  }

  function normNumber(d) {
    if (!d || !d.text || d.found === false) return null;
    var id = "num:" + d.number + ":" + d.category;
    if (seen.has(id)) return null;
    return {
      id: id,
      title: "Number \u00b7 " + d.number,
      text: d.text,
      category: "number",
      source: "https://numbersapi.com/" + d.number,
      curated: false
    };
  }
  function fetchNumbersRaw() {
    var urls = [];
    for (var i = 0; i < 5; i++) urls.push("https://numbersapi.com/random/trivia?json");
    return Promise.all(urls.map(function (u) {
      return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    })).then(function (arr) { return arr.filter(Boolean); });
  }

  function b64decode(s) {
    try { return new TextDecoder().decode(Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); })); }
    catch (e) { return s; }
  }
  function normTrivia(r) {
    if (!r || !r.question) return null;
    var q = b64decode(r.question);
    var a = b64decode(r.correct_answer || "");
    var c = b64decode(r.category || "");
    if (q.length > 200) return null;
    var id = "trivia:" + q.slice(0, 48);
    if (seen.has(id)) return null;
    return {
      id: id,
      title: c || "Trivia",
      text: q,
      answer: a,
      category: "trivia",
      source: "https://www.google.com/search?q=" + encodeURIComponent(q),
      curated: false
    };
  }
  function fetchTriviaRaw() {
    return fetch("https://opentdb.com/api.php?amount=10&type=multiple&encode=base64", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.results) ? j.results : []; })
      .catch(function () { return []; });
  }

  var SOURCES = [
    makeSource(fetchWikiRaw, normalizeWiki),
    makeSource(fetchHnRaw, normHn),
    makeSource(fetchQuoteRaw, normQuote),
    makeSource(fetchTriviaRaw, normTrivia),
    makeSource(fetchNumbersRaw, normNumber)
  ];
  var sourceCursor = 0;

  function fetchMixed(count) {
    var collected = [];
    function attempt(i) {
      if (i >= SOURCES.length || collected.length >= count) return Promise.resolve(collected);
      var src = SOURCES[(sourceCursor + i) % SOURCES.length];
      return src.fetch(count - collected.length).then(function (items) {
        collected = collected.concat(items);
        return attempt(i + 1);
      }).catch(function () { return attempt(i + 1); });
    }
    return attempt(0).then(function (items) {
      sourceCursor = (sourceCursor + 1) % SOURCES.length;
      return shuffle(items);
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
        markSeen(state.facts[idx]);
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
    var answer = document.createElement("p");
    answer.className = "card__answer";
    var src = document.createElement("a");
    src.className = "card__source";
    src.target = "_blank";
    src.rel = "noopener noreferrer";
    inner.appendChild(pill);
    inner.appendChild(text);
    inner.appendChild(answer);
    inner.appendChild(src);
    el.appendChild(inner);
    fillCardEl(el, fact);
    return el;
  }

  function fillCardEl(el, fact) {
    var pill = el.querySelector(".card__pill");
    var text = el.querySelector(".card__text");
    var answer = el.querySelector(".card__answer");
    var src = el.querySelector(".card__source");
    if (fact.end) {
      el.classList.add("card--end");
      el.removeAttribute("data-category");
      pill.style.display = "none";
      answer.style.display = "none";
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
    if (fact.answer) { answer.textContent = "A: " + fact.answer; answer.style.display = ""; }
    else { answer.textContent = ""; answer.style.display = "none"; }
    src.style.display = "";
    src.href = fact.source || "#";
    var label = fact.sourceLabel || (fact.title ? fact.title : (fact.curated ? "Source" : "Wikipedia"));
    src.textContent = label + " \u2197";
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

  function appendFacts(list, keepAll) {
    var added = 0;
    for (var j = 0; j < list.length; j++) {
      var f = list[j];
      if (!f) continue;
      if (!keepAll) {
        if (seen.has(f.id)) continue;
        if (mounted.has(f.id)) continue;
        mounted.add(f.id);
      }
      state.facts.push(f);
      mountCard(f);
      added++;
    }
    return added;
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
      fetchMixed(WIKI_BATCH).then(function (batch) {
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

  function showEmpty(yes, title, sub) {
    if (!emptyEl) return;
    if (yes) {
      if (title) { var t = emptyEl.querySelector(".empty__title"); if (t) t.textContent = title; }
      if (sub) { var s = emptyEl.querySelector(".empty__sub"); if (s) s.textContent = sub; }
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
    }
  }

  function reset(mode, category) {
    state.mode = mode;
    state.category = category || "all";
    clearCards();
    state.facts = [];
    state.ci = 0;
    state.trimOffset = 0;
    mounted = new Set();

    if (state.mode === "saved") {
      if (state.saved.length === 0) {
        showEmpty(true, "No saved facts yet", "Tap the heart on any card to keep it here.");
      } else {
        showEmpty(false);
        appendFacts(state.saved.slice(), true);
        appendFacts([{ id: "__end__", end: true, category: "random" }], true);
      }
    } else {
      var unseen = seedForCategory(state.category).filter(function (f) { return !seen.has(f.id); });
      appendFacts(takeSeed(Math.min(unseen.length, 11)));
      if (state.facts.length === 0 && !state.online) {
        showEmpty(true, "You're all caught up", "You've seen every offline fact. Reconnect for a fresh stream.");
      } else {
        showEmpty(false);
      }
    }

    feed.scrollTop = 0;
    var first = feed.querySelector(".card");
    if (first) {
      first.classList.add("is-active");
      markSeen(state.facts[0]);
    }
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
})();

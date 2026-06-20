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
    tech: "Tech", trivia: "Trivia", quote: "Quote", number: "Number",
    onthisday: "On This Day", poem: "Poem", featured: "Today's Article"
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

  var SENT_SPLIT = /([.!?])\s+(?=[A-Z0-9\u201c"])/g;
  function trimWiki(t) {
    t = (t || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    var parts = t.replace(SENT_SPLIT, "$1\u0001").split("\u0001");
    var take = parts.length <= 3 ? parts.length : 3;
    var out = parts.slice(0, take).join(" ").trim();
    if (out.length > 300) {
      var cut = out.slice(0, 300);
      var sp = cut.lastIndexOf(" ");
      if (sp > 160) cut = out.slice(0, sp);
      out = cut + "\u2026";
    }
    return out;
  }
  var SHOWBIZ = /\(song\)|\(single\)|\(album\)|\(ep\)|\(film\)|\(films\)|\(tv series\)|\(television series\)|\(video game\)|\(video games\)|\(novel\)|\(novella\)|\(band\)|\(musical\)|\(anime\)|\(manga\)|\(comic book\)|\(character\)|\(sitcom\)|\(reality show\)|song by|single by|album by|\bactor\b|\bactress\b|\bsinger\b|\bsongwriter\b|\brapper\b|\bmusician\b|rock band|boy band|girl group|television series|tv series|television presenter|video game|\banime\b|\bmanga\b|novel by|\bnovelist\b|fictional character|\byoutuber\b|\binfluencer\b|\bcelebrit|supermodel|fashion model|talk[- ]show|game[- ]show|soap opera|\bsitcom\b|\bgrammy\b|\boscar\b|\bemmy\b|\bbafta\b|\bcomedian\b|playwright|stage musical|film director|film producer|record label|\bdj\b|disc jockey|\bdancer\b|choreographer|\bfilm\b|\bfilms\b|\bmovie\b|\bmovies\b/i;
  var DRY_BIO = /\b(?:is|was|are|were)\s+(?:a|an)\s+(?:[\w-]+\s+){0,3}(?:actor|actress|singer|songwriter|rapper|musician|footballer|soccer|baseball|basketball|tennis|golfer|cricketer|youtuber|blogger|influencer|comedian|poet|novelist|author|director|producer|politician|minister|senator|governor|mayor|general|admiral|captain|professor|doctor|physician|surgeon|engineer|lawyer|judge|attorney|chef|manager|executive|ceo|chairman|founder|partner|representative|ambassador|diplomat|consultant|analyst|teacher|tutor|coach|trainer|therapist|nurse|pharmacist|dentist|screenwriter|soprano|tenor|violinist|pianist|cellist|guitarist|drummer|composer|conductor|dancer|choreographer|model|fashion designer|beauty pageant)/i;
  var SPORTS = /\b(nfl|nba|mlb|nhl|pga|fifa|uefa|world cup|championship|grand prix|grand slam|playoffs?|tournament|medals?|trophy|league|stadium|arena|sports?|football|soccer|basketball|baseball|cricket|tennis|hockey|rugby|boxing|ufc|olympics?|olympian|pitcher|touchdowns?|home run|wickets?|birdie|bogey|knockout|submission|golfers?|\bgolf\b|marathon|racer|racing|drivers?)\b/i;
  var GEOGRAPHY = /\b(?:is a|is the)\s+(?:city|town|village|county|municipality|district|province|state|region|island|river|mountain|range|lake|desert|forest|park|reserve|commune|borough|settlement|prefecture|parish)\b|\b(population of|capital of|located in|situated in|administrative|census-designated|metropolitan area|in the province|seat of|covers an area)\b/i;
  var DRY_PATTERNS = /\b(?:species of|genus|subgenus|subspecies|family of|order of|bacterium|fungus|algae|moth|beetle|spider|insect|crustacean|gastropod)\b|\b(native to|endemic to|distributed in|inhabits|found in the|described in)\b/i;
  var INFRASTRUCTURE = /\b(railway station|train station|airport|bridge|highway|motorway|canal|dam|reservoir|power plant|factory|refinery|terminal|port|harbour|harbor)\b/i;
  var VIOLENCE = /\b(shootings?|mass shooting|massacre|bombing|explosion|killed|murder|murdered|assassination|execution|genocide|atrocity|atrocities|siege|invasion|occupation|rebellion|uprising|riots?|protests?|revolution|coup|serial killer|terrorist|terrorism|warlord|militia|casualt|fatalit|wounded|slain|gunman|attack|deaths?|death toll|civil war|armed conflict|hostage)\b/i;
  var NEWS_STUBS = /\b(elections?|elected|incumbent|candidate|campaign|ballot|primary election|headquartered|co-founded|subsidiary of|acquired by|merged with|stock exchange|publicly traded|bankruptcy|filed for|restructuring|conglomerate|\bipo\b|initial public offering)\b/i;
  function isWikiDry(text) {
    return SHOWBIZ.test(text) || DRY_BIO.test(text) || SPORTS.test(text)
        || GEOGRAPHY.test(text) || DRY_PATTERNS.test(text) || INFRASTRUCTURE.test(text);
  }
  function normalizeWiki(data) {
    if (!data || !data.extract) return null;
    if (data.type === "disambiguation" || data.type === "no-extract" || data.type === "mainpage" || data.type === "related") return null;
    var combined = (data.title || "") + " " + (data.description || "") + " " + (data.extract || "");
    if (isWikiDry(combined) || VIOLENCE.test(combined) || NEWS_STUBS.test(combined)) return null;
    var text = trimWiki(data.extract);
    if (text.length < 60) return null;
    if (!/[.!?]/.test(text)) return null;
    if (/^list of\b/i.test(data.title || "")) return null;
    if (/^index of\b/i.test(data.title || "")) return null;
    if (/population|demographic|coordinates?|elevation|area code|postal code|iso code|zip code/i.test(text.slice(0, 120))) return null;
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
    for (var i = 0; i < 6; i++) {
      tasks.push(fetch(WIKI_ENDPOINT, {
        cache: "no-store",
        headers: { "User-Agent": "KnowledgeFeed/1.0 (https://github.com/knowledge-feed)" }
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }));
    }
    return Promise.all(tasks).then(function (arr) { return arr.filter(Boolean); });
  }

  function normWikiTFA(data) {
    if (!data || !data.extract) return null;
    if (data.type === "disambiguation" || data.type === "no-extract" || data.type === "mainpage" || data.type === "related") return null;
    var text = trimWiki(data.extract);
    if (text.length < 60) return null;
    if (!/[.!?]/.test(text)) return null;
    var id = "tfa:" + (data.title || Math.random().toString(36).slice(2));
    if (seen.has(id)) return null;
    var src = (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) ||
              ("https://en.wikipedia.org/wiki/" + encodeURIComponent(data.title || ""));
    return { id: id, title: data.title || null, text: text, category: "featured", source: src, curated: true };
  }
  function fetchWikiTFARaw() {
    var now = new Date();
    var y = now.getFullYear();
    var m = ("0" + (now.getMonth() + 1)).slice(-2);
    var d = ("0" + now.getDate()).slice(-2);
    return fetch("https://en.wikipedia.org/api/rest_v1/feed/featured/" + y + "/" + m + "/" + d, {
      cache: "no-store",
      headers: { "User-Agent": "KnowledgeFeed/1.0 (https://github.com/knowledge-feed)" }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.tfa) ? [j.tfa] : []; })
      .catch(function () { return []; });
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

  function normQuote(q) {
    if (!q || !q.q) return null;
    var text = String(q.q);
    if (text.length > 250) return null;
    if (text.length < 15) return null;
    var id = "quote:" + (q.a || "") + ":" + text.slice(0, 40);
    if (seen.has(id)) return null;
    var author = q.a || "Unknown";
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
    return fetch("https://zenquotes.io/api/quotes", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return Array.isArray(j) ? j : []; })
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
  var TRIVIA_CATS = [9, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 30];
  function fetchTriviaRaw() {
    var cat = TRIVIA_CATS[Math.floor(Math.random() * TRIVIA_CATS.length)];
    return fetch("https://opentdb.com/api.php?amount=10&category=" + cat + "&type=multiple&encode=base64", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.results) ? j.results : []; })
      .catch(function () { return []; });
  }

  function stripHtml(s) {
    return (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }
  var WIKI_OTT_REJECT = /disambiguation|does not have an article/i;
  function normWikiOnThisDay(ev) {
    if (!ev || !ev.text) return null;
    var text = stripHtml(ev.text);
    if (text.length < 30) return null;
    if (WIKI_OTT_REJECT.test(text)) return null;
    if (isWikiDry(text) || VIOLENCE.test(text)) return null;
    var year = ev.year || "";
    var id = "ott:" + year + ":" + text.slice(0, 48);
    if (seen.has(id)) return null;
    var display = year ? year + " \u2014 " + text : text;
    return {
      id: id,
      title: "On This Day",
      text: display,
      category: "history",
      source: "https://en.wikipedia.org/wiki/" + encodeURIComponent(ev.page || "Portal:Current_events"),
      curated: false
    };
  }
  function fetchWikiOnThisDayRaw() {
    var now = new Date();
    var m = now.getMonth() + 1;
    var d = now.getDate();
    return fetch("https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/" + m + "/" + d, {
      cache: "no-store",
      headers: { "User-Agent": "KnowledgeFeed/1.0 (https://github.com/knowledge-feed)" }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return [];
        var events = (j.selected || []).map(normWikiOnThisDay).filter(Boolean);
        return events;
      })
      .catch(function () { return []; });
  }

  function normNinjaFact(item) {
    if (!item || !item.fact) return null;
    var text = String(item.fact).trim();
    if (text.length < 30 || text.length > 300) return null;
    var id = "ninja:" + text.slice(0, 48);
    if (seen.has(id)) return null;
    return {
      id: id,
      title: "Fact",
      text: text,
      category: "science",
      source: "https://api-ninjas.com/",
      curated: false
    };
  }
  function fetchNinjaFactRaw() {
    var tasks = [];
    for (var i = 0; i < 5; i++) {
      tasks.push(fetch("https://api.api-ninjas.com/v1/facts", {
        cache: "no-store",
        headers: { "X-Api-Key": "La0DxYXrAt2S3G1MsNeSioIUjamJ7XNqYEhM3m3B" }
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; }));
    }
    return Promise.all(tasks).then(function (arr) {
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i])) out = out.concat(arr[i]);
      }
      return out;
    });
  }

  function normPoem(p) {
    if (!p || !p.lines || !p.lines.length) return null;
    var take = p.lines.length > 4 ? 4 : p.lines.length;
    var text = p.lines.slice(0, take).join(" / ").trim();
    if (p.lines.length > 4) text += " \u2026";
    if (text.length < 15 || text.length > 300) return null;
    var id = "poem:" + (p.author || "") + ":" + (p.title || "") + ":" + p.lines[0].slice(0, 40);
    if (seen.has(id)) return null;
    var who = p.author || "Unknown";
    return {
      id: id,
      title: (p.title ? p.title + " \u2014 " : "") + who,
      text: text,
      category: "poem",
      source: "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(who + " " + (p.title || "")),
      curated: false
    };
  }
  function fetchPoemRaw() {
    return fetch("https://poetrydb.org/random/6", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return Array.isArray(j) ? j : []; })
      .catch(function () { return []; });
  }

  var DICT_WORDS = ["serendipity","quarantine","robot","panic","nostalgia","assassin","disaster","muscle","companion","salary","clue","nemesis","goodbye","nightmare","sarcophagus","typhoon","banana","alcohol","coffee","sugar","magazine","safari","khaki","pajamas","shampoo","thug","boss","kudos","museum","academy","echo","tantalize","marathon","boycott","guillotine","sandwich","silhouette","leotard","cardigan","denim","bikini","pamphlet","slogan","whiskey","vodka","ketchup","chocolate","avocado","coconut","mosquito","kangaroo","panda","penguin","gorilla","jumbo","dinosaur","fossil","android","cyber","algorithm","algebra","zero","cipher","checkmate","gymnasium","drama","comedy","music","rhythm","melody","symphony","philosophy","logic","paper","gospel","angel","devil","paradise","magic","pandemonium","escapade","avalanche","hurricane","tsunami","volcano","glacier","oasis","mirage","compass","anchor","galaxy","nebula","quasar","zenith","horizon","odyssey","utopia","dystopia"];
  function normDict(r) {
    if (!r || !r.entry || !r.word) return null;
    var e = r.entry;
    var pos = (e.meanings && e.meanings[0] && e.meanings[0].partOfSpeech) || "";
    var def = (e.meanings && e.meanings[0] && e.meanings[0].definitions && e.meanings[0].definitions[0] && e.meanings[0].definitions[0].definition) || "";
    if (!def) return null;
    var text = r.word + (pos ? " (" + pos + ")" : "") + ": " + def;
    text = trimWiki(text);
    if (text.length < 20) return null;
    var id = "dict:" + r.word;
    if (seen.has(id)) return null;
    return {
      id: id,
      title: r.word,
      text: text,
      category: "language",
      source: "https://en.wiktionary.org/wiki/" + encodeURIComponent(r.word),
      curated: false
    };
  }
  function fetchDictRaw() {
    var w = DICT_WORDS[Math.floor(Math.random() * DICT_WORDS.length)];
    return fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(w), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (Array.isArray(j) && j.length) ? [{ word: w, entry: j[0] }] : []; })
      .catch(function () { return []; });
  }

  function normAnimal(r) {
    if (!r || !r.text) return null;
    var t = String(r.text).trim();
    if (t.length < 30 || t.length > 300) return null;
    var id = "animal:" + r.kind + ":" + t.slice(0, 48);
    if (seen.has(id)) return null;
    return {
      id: id,
      title: r.kind === "cat" ? "Cat Fact" : "Dog Fact",
      text: t,
      category: "nature",
      source: r.kind === "cat" ? "https://catfact.ninja/" : "https://dog-api.kinduff.com/",
      curated: false
    };
  }
  function fetchAnimalRaw() {
    var cats = [];
    for (var i = 0; i < 3; i++) {
      cats.push(fetch("https://catfact.ninja/fact", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (f) { return f && f.fact ? [{ kind: "cat", text: f.fact }] : []; })
        .catch(function () { return []; }));
    }
    var dogs = fetch("https://dog-api.kinduff.com/api/facts", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (f) { return (f && Array.isArray(f.facts)) ? f.facts.map(function (t) { return { kind: "dog", text: t }; }) : []; })
      .catch(function () { return []; });
    return Promise.all([Promise.all(cats).then(function (a) { return a.reduce(function (x, y) { return x.concat(y); }, []); }), dogs])
      .then(function (p) { return p[0].concat(p[1]); });
  }

  function normLight(r) {
    if (!r) return null;
    if (r.kind === "advice") {
      var t = String(r.text || "").trim();
      if (t.length < 15 || t.length > 200) return null;
      var id = "advice:" + t.slice(0, 48);
      if (seen.has(id)) return null;
      return { id: id, title: "Advice", text: t, category: "ideas", source: "https://api.adviceslip.com/", curated: false };
    }
    if (r.kind === "joke") {
      var q = String(r.setup || "").trim();
      var a = String(r.punch || "").trim();
      if (q.length < 10 || q.length > 200) return null;
      var id2 = "joke:" + q.slice(0, 48);
      if (seen.has(id2)) return null;
      return { id: id2, title: "Joke", text: q, answer: a, category: "trivia", source: "https://github.com/15Dkatz/official_joke_api", curated: false };
    }
    return null;
  }
  function fetchLightRaw() {
    var adv = fetch("https://api.adviceslip.com/advice", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.slip && j.slip.advice) ? [{ kind: "advice", text: j.slip.advice }] : []; })
      .catch(function () { return []; });
    var jok = fetch("https://official-joke-api.appspot.com/random_joke", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.setup && j.punchline) ? [{ kind: "joke", setup: j.setup, punch: j.punchline }] : []; })
      .catch(function () { return []; });
    return Promise.all([adv, jok]).then(function (p) { return p[0].concat(p[1]); });
  }

  var SOURCES = [
    makeSource(fetchWikiRaw, normalizeWiki),
    makeSource(fetchWikiTFARaw, normWikiTFA),
    makeSource(fetchWikiOnThisDayRaw, normWikiOnThisDay),
    makeSource(fetchQuoteRaw, normQuote),
    makeSource(fetchPoemRaw, normPoem),
    makeSource(fetchDictRaw, normDict),
    makeSource(fetchAnimalRaw, normAnimal),
    makeSource(fetchLightRaw, normLight),
    makeSource(fetchNinjaFactRaw, normNinjaFact),
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

/* ============================================================
   Chat du portfolio · recherche seule, sans IA générative
   ------------------------------------------------------------
   Les réponses sont écrites à la première personne (Youssef répond).
   Le chat ne rédige jamais de texte. Il compare la question
   aux mots-clés de knowledge.json et affiche, telle quelle, la
   réponse validée correspondante. Sinon :
     - question sur Youssef mais absente de la fiche → « je ne sais pas » + contacts
     - question hors sujet                           → refus poli
   Le moteur (PortfolioBot) est pur et testable avec Node :
     node tests/chatbot.test.js
   ============================================================ */
(function (root) {
  'use strict';

  var WEIGHTS = { key: 5, strong: 3, medium: 2, weak: 1 };
  var THRESHOLD = 2;      // score minimal pour répondre
  var CLOSE_RATIO = 0.75; // une 2e entrée à ≥ 75 % du meilleur score est proposée en suggestion
  var MAX_LEN = 300;

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/[^a-z0-9+#]+/g, ' ')
      .trim();
  }

  function tokenize(s) {
    var n = normalize(s);
    return n ? n.split(' ') : [];
  }

  // Un mot-clé de 5 lettres ou plus accepte les variantes (« competence » → « competences »).
  function tokenMatch(q, k) {
    return k.length >= 5 ? q.indexOf(k) === 0 : q === k;
  }

  // Un mot-clé de plusieurs mots doit apparaître dans l'ordre, mots consécutifs.
  // Renvoie la position du premier mot trouvé, ou -1.
  function phraseAt(qTokens, kTokens) {
    if (!kTokens.length) return -1;
    for (var i = 0; i + kTokens.length <= qTokens.length; i++) {
      var ok = true;
      for (var j = 0; j < kTokens.length; j++) {
        if (!tokenMatch(qTokens[i + j], kTokens[j])) { ok = false; break; }
      }
      if (ok) return i;
    }
    return -1;
  }
  function phraseIn(qTokens, kTokens) { return phraseAt(qTokens, kTokens) !== -1; }

  function prepare(kb) {
    if (kb.__prepared) return kb;
    kb.entries.forEach(function (e) {
      e.__kw = [];
      Object.keys(WEIGHTS).forEach(function (level) {
        (e[level] || []).forEach(function (k) {
          var t = tokenize(k);
          if (t.length) e.__kw.push({ tokens: t, w: WEIGHTS[level] });
        });
      });
      // Les mots-clés les plus forts (puis les plus longs) sont comptés en premier.
      e.__kw.sort(function (a, b) { return b.w - a.w || b.tokens.length - a.tokens.length; });
    });
    kb.__domain = (kb.domainTerms || []).map(function (d) { return tokenize(d); });
    kb.__offtopic = (kb.offtopicTerms || []).map(function (d) { return tokenize(d); });
    kb.__byId = {};
    kb.entries.forEach(function (e) { kb.__byId[e.id] = e; });
    kb.__prepared = true;
    return kb;
  }

  // Chaque mot de la question ne compte qu'une fois par entrée
  // (« tunis » et « tunisie » ne s'additionnent pas sur le même mot).
  function score(entry, qTokens) {
    var s = 0;
    var used = {};
    entry.__kw.forEach(function (k) {
      var at = phraseAt(qTokens, k.tokens);
      if (at === -1) return;
      for (var j = 0; j < k.tokens.length; j++) if (used[at + j]) return;
      for (j = 0; j < k.tokens.length; j++) used[at + j] = true;
      s += k.w;
    });
    return s;
  }

  function isAboutYoussef(kb, qTokens) {
    return kb.__domain.some(function (d) { return phraseIn(qTokens, d); });
  }

  /**
   * Renvoie { type, entry, alternates }
   *   type : 'answer' | 'unknown' | 'offtopic' | 'empty'
   */
  function ask(kb, text) {
    prepare(kb);
    var q = String(text || '').slice(0, MAX_LEN);
    var qTokens = tokenize(q);
    if (!qTokens.length) return { type: 'empty', entry: null, alternates: [] };

    // Demandes clairement hors sujet (traduire, poème, blague…) : refus direct.
    if (kb.__offtopic.some(function (d) { return phraseIn(qTokens, d); })) {
      return { type: 'offtopic', entry: null, alternates: [] };
    }

    var ranked = kb.entries
      .map(function (e, i) { return { e: e, s: score(e, qTokens), i: i }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; });

    var best = ranked[0];
    if (best && best.s >= THRESHOLD) {
      var alternates = ranked.slice(1)
        .filter(function (r) { return r.s >= THRESHOLD && r.s >= best.s * CLOSE_RATIO; })
        .slice(0, 2)
        .map(function (r) { return r.e.id; });
      return { type: 'answer', entry: best.e, alternates: alternates };
    }
    return { type: isAboutYoussef(kb, qTokens) ? 'unknown' : 'offtopic', entry: null, alternates: [] };
  }

  var Bot = { normalize: normalize, tokenize: tokenize, ask: ask, prepare: prepare, THRESHOLD: THRESHOLD };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Bot; }
  root.PortfolioBot = Bot;

  /* ==========================================================
     Interface (navigateur uniquement)
     ========================================================== */
  if (typeof document === 'undefined') return;

  var LOAD_ERROR = 'Mes réponses n\'ont pas pu être chargées, et je préfère ne rien dire de mémoire. Mes coordonnées sont dans la section Contact de cette page.';
  var kb = null;
  var loadError = false;
  var greeted = false;
  var els = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Texte → paragraphes et listes à puces ; les URL deviennent des liens. Aucun innerHTML.
  function appendRich(parent, text) {
    var blocks = String(text).split(/\n{2,}/);
    blocks.forEach(function (block) {
      var lines = block.split('\n');
      var list = null;
      var para = null;
      lines.forEach(function (line) {
        var bullet = /^\s*•\s?/.test(line);
        if (bullet) {
          if (!list) { list = el('ul'); parent.appendChild(list); para = null; }
          var li = el('li');
          linkify(li, line.replace(/^\s*•\s?/, ''));
          list.appendChild(li);
        } else if (/^\s{2,}\S/.test(line) && list && list.lastChild) {
          list.lastChild.appendChild(document.createElement('br'));
          linkify(list.lastChild, line.trim());
        } else {
          list = null;
          if (!para) { para = el('p'); parent.appendChild(para); }
          else { para.appendChild(document.createElement('br')); }
          linkify(para, line);
        }
      });
    });
  }

  function linkify(parent, text) {
    var re = /https:\/\/[^\s)]+/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el('a', null, m[0].replace(/^https:\/\//, ''));
      a.href = m[0]; a.target = '_blank'; a.rel = 'noopener';
      parent.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function contactBlock() {
    var c = (kb && kb.contact) || {};
    var box = el('div', 'contact-list');
    [
      ['Email', c.email, c.email && 'mailto:' + c.email],
      ['Téléphone', c.phone, c.phoneHref],
      ['LinkedIn', c.linkedinLabel, c.linkedin],
      ['GitHub', c.githubLabel, c.github]
    ].forEach(function (row) {
      if (!row[1] || !row[2]) return;
      var a = el('a');
      a.href = row[2];
      if (/^https:/.test(row[2])) { a.target = '_blank'; a.rel = 'noopener'; }
      a.appendChild(el('span', null, row[0]));
      a.appendChild(document.createTextNode(row[1]));
      box.appendChild(a);
    });
    return box;
  }

  function scrollDown() { els.log.scrollTop = els.log.scrollHeight; }

  function addUser(text) {
    els.log.appendChild(el('div', 'msg user', text));
    scrollDown();
  }

  function addBot(build) {
    var m = el('div', 'msg bot');
    build(m);
    els.log.appendChild(m);
    scrollDown();
    return m;
  }

  function addSuggestions(items) {
    if (!items.length) return;
    var wrap = el('div', 'suggest');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Suggestions');
    items.forEach(function (it) {
      var b = el('button', null, it.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        wrap.remove();
        if (it.id) answerEntry(it.label, kb.__byId[it.id]);
        else handle(it.label);
      });
      wrap.appendChild(b);
    });
    els.log.appendChild(wrap);
    scrollDown();
  }

  function clearSuggestions() {
    Array.prototype.forEach.call(els.log.querySelectorAll('.suggest'), function (n) { n.remove(); });
  }

  function withTyping(fn) {
    var t = el('div', 'msg bot typing');
    t.setAttribute('aria-hidden', 'true');
    t.appendChild(el('i')); t.appendChild(el('i')); t.appendChild(el('i'));
    els.log.appendChild(t);
    scrollDown();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () { t.remove(); fn(); }, reduce ? 0 : 350);
  }

  function renderEntry(entry, alternates) {
    var msg = addBot(function (m) {
      appendRich(m, entry.answer);
      if (entry.showContact) m.appendChild(contactBlock());
    });
    var ids = (alternates || []).concat(entry.related || []);
    var seen = {}; seen[entry.id] = true;
    var items = [];
    ids.forEach(function (id) {
      var e = kb.__byId[id];
      if (e && !seen[id] && !e.greeting) { seen[id] = true; items.push({ id: id, label: e.title }); }
    });
    addSuggestions(items.slice(0, 3));
    // Une réponse longue s'affiche depuis son début, pas depuis la fin.
    if (msg.offsetHeight > els.log.clientHeight * 0.6) els.log.scrollTop = msg.offsetTop - 12;
  }

  function answerEntry(label, entry) {
    clearSuggestions();
    addUser(label);
    withTyping(function () { renderEntry(entry, []); });
  }

  function handle(text) {
    clearSuggestions();
    var q = String(text || '').trim();
    if (!q) return;
    addUser(q);
    withTyping(function () {
      if (loadError || !kb) {
        addBot(function (m) {
          m.appendChild(el('p', null, LOAD_ERROR));
        });
        return;
      }
      var r = ask(kb, q);
      if (r.type === 'answer') return renderEntry(r.entry, r.alternates);
      if (r.type === 'empty') return addBot(function (m) { m.appendChild(el('p', null, kb.messages.empty)); });
      if (r.type === 'unknown') {
        addBot(function (m) {
          m.appendChild(el('p', null, kb.messages.unknown));
          m.appendChild(contactBlock());
        });
      } else {
        addBot(function (m) { m.appendChild(el('p', null, kb.messages.offtopic)); });
      }
      addSuggestions(kb.suggestions.slice(0, 3).map(function (s) { return { label: s }; }));
    });
  }

  function greet() {
    if (greeted || !kb) return;
    greeted = true;
    addBot(function (m) { m.appendChild(el('p', null, kb.messages.welcome)); });
    addSuggestions(kb.suggestions.map(function (s) { return { label: s }; }));
  }

  function open() {
    els.panel.hidden = false;
    els.launcher.setAttribute('aria-expanded', 'true');
    if (kb) greet();
    else if (loadError) addBot(function (m) { m.appendChild(el('p', null, LOAD_ERROR)); });
    els.input.focus();
  }

  function close() {
    els.panel.hidden = true;
    els.launcher.setAttribute('aria-expanded', 'false');
    els.launcher.focus();
  }

  function init() {
    els.panel = document.getElementById('chat-panel');
    els.launcher = document.getElementById('chat-launcher');
    els.log = document.getElementById('chat-log');
    els.form = document.getElementById('chat-form');
    els.input = document.getElementById('chat-input');
    if (!els.panel) return;

    els.launcher.addEventListener('click', open);
    document.getElementById('chat-close').addEventListener('click', close);
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-chat]'), function (b) {
      b.addEventListener('click', open);
    });
    els.panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = els.input.value;
      els.input.value = '';
      handle(v);
    });

    fetch('knowledge.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { kb = prepare(data); if (!els.panel.hidden) greet(); })
      .catch(function () { loadError = true; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);

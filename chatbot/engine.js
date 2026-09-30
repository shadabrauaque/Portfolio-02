/*
 * Question-matching engine for "Shadab's Assistant".
 *
 * It turns a visitor's question into a reply drawn ONLY from knowledge.js.
 * No network calls, no API keys, nothing generated on the fly — so it can't
 * invent facts about Shadab. It works offline and on any static host.
 *
 * Pipeline:  text → normalise → tokens (stemmed) → score every topic → reply
 *
 *   score ≥ 3        answer the best topic
 *   1 ≤ score < 3    "Did you mean…?" with the closest topics as buttons
 *   score < 1        honest "I don't know" + offer to forward the question
 *
 * The file has no DOM code, so it runs in Node too (see engine.test.js).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.PortfolioBotEngine = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIDENT = 3;        // score needed to answer outright
  var CLARIFY = 1;          // score needed to offer "did you mean…" buttons
  var SMALLTALK_YIELD_RATIO = 0.5; // a real topic with at least this share of the small-talk score wins ("thanks! what about his education?")
  var ENTITY_WEIGHT = 6;    // naming a specific skill / tool is a strong signal ("does he use Photoshop?")
  var FUZZY_QUALITY = 0.9;  // a typo'd match counts for 90% of an exact one
  var MAX_INPUT = 500;
  var MAX_CHIPS = 4;

  /* ------------------------------------------------------------------ */
  /* Text normalisation                                                  */
  /* ------------------------------------------------------------------ */

  function toSet(str) {
    var o = Object.create(null);
    str.split(/\s+/).forEach(function (w) { if (w) { o[w] = true; } });
    return o;
  }

  // Third-person references to Shadab (and the people who are "he/she" in a question).
  var HE_WORDS = toSet('he him his himself she her hers herself shadab shadabs shadaab raunaqui raunaque raunaki raunak msr md mohd mohammad mohammed muhammad mr candidate applicant guy man person owner');
  // Visitors often talk to the chat as if it were Shadab ("what are your skills?").
  var YOU_WORDS = toSet('you your yours yourself youre u ur');
  // The asker — carries no meaning for matching, so it is dropped.
  var ME_WORDS = toSet('i me my mine myself we us our ours ourselves im');
  var FILLER_WORDS = toSet('a an the please pls plz kindly just really actually also maybe quickly briefly so well um uh hmm sir madam mam dear bro buddy mate');

  var SLANG = {
    wat: 'what', wht: 'what', hw: 'how', abt: 'about', thx: 'thanks', tnx: 'thanks', thanx: 'thanks', thnx: 'thanks',
    ty: 'thanks', tq: 'thanks', r: 'are', y: 'why', ppl: 'people', bcoz: 'because', bcz: 'because', cuz: 'because',
    whats: 'what is', hows: 'how is', wheres: 'where is', whos: 'who is', thats: 'that is', hes: 'he is', shes: 'she is',
    dont: 'do not', cant: 'can not', wont: 'will not', doesnt: 'does not', isnt: 'is not', arent: 'are not', didnt: 'did not',
    youre: 'you are', theyre: 'they are', ive: 'i have', lets: 'let us', exp: 'experience', yrs: 'years', yr: 'year',
    vid: 'video', vids: 'videos', pic: 'picture', pics: 'pictures', gonna: 'going to', wanna: 'want to'
  };

  var CONTRACTIONS = [
    [/\b(what|who|where|when|how|why|that|there|here|it|he|she)'s\b/g, '$1 is'],
    [/\blet's\b/g, 'let us'],
    [/\bi'm\b/g, 'i am'],
    [/\b(you|we|they)'re\b/g, '$1 are'],
    [/\b(i|you|we|they|he|she|it)'ll\b/g, '$1 will'],
    [/\b(i|you|we|they)'ve\b/g, '$1 have'],
    [/\b(i|you|we|they|he|she|it)'d\b/g, '$1 would'],
    [/\bcan't\b/g, 'can not'],
    [/\bcannot\b/g, 'can not'],
    [/\bwon't\b/g, 'will not'],
    [/\bain't\b/g, 'is not'],
    [/\b(\w+)n't\b/g, '$1 not']
  ];

  // Forms a stemmer can't guess.
  var IRREGULAR = {
    is: 'be', are: 'be', am: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    does: 'do', did: 'do', done: 'do', doing: 'do',
    has: 'have', had: 'have', having: 'have',
    goes: 'go', went: 'go', gone: 'go', going: 'go',
    got: 'get', gotten: 'get', knew: 'know', known: 'know', took: 'take', taken: 'take',
    saw: 'see', seen: 'see', built: 'build', wrote: 'write', written: 'write', made: 'make',
    began: 'begin', begun: 'begin'
  };

  var SUFFIX_RULES = [
    [/^(.{3,})ied$/, '$1y', false],
    [/^(.{3,})ing$/, '$1', true],
    [/^(.{3,})ed$/, '$1', true],
    [/^(.{3,})ion$/, '$1', false],   // animation → animat, education → educat
    [/^(.{3,})or$/, '$1', false],    // editor → edit, animator → animat
    [/^(.{4,})er$/, '$1', false],    // designer → design
    [/^(.{3,})ment$/, '$1', false],
    [/^(.{3,})al$/, '$1', false],    // professional → profession → profess
    [/^(.{3,})ly$/, '$1', false]
  ];

  function undouble(base) {
    return /(bb|dd|gg|mm|nn|pp|rr|tt)$/.test(base) ? base.slice(0, -1) : base;
  }

  /**
   * A deliberately small stemmer: enough so that edit/editing/editor/edited,
   * animate/animation/animator and hire/hiring/hired meet in the middle.
   * It is applied to BOTH the question and the keywords, so the two always agree.
   */
  function stem(word) {
    var w = IRREGULAR[word] || word;
    if (w.length <= 3) { return w; }

    if (/ies$/.test(w) && w.length > 4) { w = w.slice(0, -3) + 'y'; }
    else if (/(ss|us|is)$/.test(w)) { /* class, status, this — leave alone */ }
    else if (/(ch|sh|x|z|ss)es$/.test(w)) { w = w.slice(0, -2); }
    else if (/s$/.test(w)) { w = w.slice(0, -1); }

    for (var round = 0; round < 3; round++) {
      var changed = false;
      for (var i = 0; i < SUFFIX_RULES.length; i++) {
        var rule = SUFFIX_RULES[i];
        if (rule[0].test(w)) {
          w = w.replace(rule[0], rule[1]);
          if (rule[2]) { w = undouble(w); }
          changed = true;
          break;
        }
      }
      if (!changed) { break; }
    }

    if (w.length > 3 && w.charAt(w.length - 1) === 'e') { w = w.slice(0, -1); }
    if (w.length > 3 && w.charAt(w.length - 1) === 'y') { w = w.slice(0, -1) + 'i'; }
    return w;
  }

  function normalize(text) {
    var s = String(text == null ? '' : text).slice(0, MAX_INPUT + 100).toLowerCase();
    s = s.replace(/[\u2018\u2019\u201B\u02BC`\u00B4]/g, "'");
    if (s.normalize) { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    for (var i = 0; i < CONTRACTIONS.length; i++) { s = s.replace(CONTRACTIONS[i][0], CONTRACTIONS[i][1]); }
    s = s.replace(/(\w)'s\b/g, '$1').replace(/'/g, '');
    s = s.replace(/\be[\s-]+mail\b/g, 'email');
    s = s.replace(/\b([23])\s*-?\s*d\b/g, '$1d');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** text → array of tokens. Stems are lowercase; HE / YOU / P are the special markers. */
  function tokenize(text) {
    var words = normalize(text);
    if (!words) { return []; }
    var out = [], raws = [];
    words.split(' ').forEach(function (raw) {
      var w = raw.replace(/(.)\1{2,}/g, '$1');            // "hiii" → "hi"
      var parts = (SLANG[w] || w).split(' ');
      parts.forEach(function (part) {
        var tok;
        if (part === 'zzp') { tok = 'P'; }                // wildcard used inside knowledge-base terms
        else if (HE_WORDS[part]) { tok = 'HE'; }
        else if (YOU_WORDS[part]) { tok = 'YOU'; }
        else if (ME_WORDS[part] || FILLER_WORDS[part]) { return; }
        else { tok = stem(part); }
        if (tok === 'HE' && out[out.length - 1] === 'HE') { return; }   // "md shadab raunaqui" → one HE
        out.push(tok);
        raws.push(part);
      });
    });
    // The spelling the visitor typed, for typo matching ("emial" is stemmed to "emi", but is one letter off "email").
    Object.defineProperty(out, 'raw', { value: raws, enumerable: false });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Typo tolerance                                                      */
  /* ------------------------------------------------------------------ */

  /** Damerau–Levenshtein (optimal string alignment) with an early exit. */
  function editDistance(a, b, max) {
    var al = a.length, bl = b.length, i, j;
    if (Math.abs(al - bl) > max) { return max + 1; }
    var prev2 = null, prev = [], cur;
    for (j = 0; j <= bl; j++) { prev[j] = j; }
    for (i = 1; i <= al; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= bl; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) { rowMin = v; }
      }
      if (rowMin > max) { return max + 1; }
      prev2 = prev;
      prev = cur;
    }
    return prev[bl];
  }

  var PLAIN = /^[a-z0-9]+$/;

  function isTypoOf(q, t) {
    if (!PLAIN.test(q) || !PLAIN.test(t)) { return false; }
    if (t.length < 5 || q.length < 4) { return false; }
    if (Math.abs(q.length - t.length) > 2) { return false; }
    if (q.charAt(0) !== t.charAt(0) || q.charAt(1) !== t.charAt(1)) { return false; }   // typos rarely hit the first letters; avoids skill/still
    var max = t.length >= 10 ? 2 : 1;
    if (editDistance(q, t, max) <= max) { return true; }
    // A misspelt ending survives stemming ("educaton" stays "educaton", the keyword is "educat"),
    // so also compare against the same-length beginning of the word.
    return q.length > t.length && editDistance(q.slice(0, t.length + 1), t, max) <= max;
  }

  /* ------------------------------------------------------------------ */
  /* Terms                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * 'what do P do'   → tokens [what, do, P, do]  (P = he | you)
   * 'tell about he$' → must end the question
   */
  function compileTerm(raw, weight) {
    var s = String(raw).trim(), anchorEnd = false, anchorStart = false, strict = false;
    if (s.charAt(s.length - 1) === '$') { anchorEnd = true; s = s.slice(0, -1); }
    if (s.charAt(0) === '^') { anchorStart = true; s = s.slice(1); }
    if (s.charAt(0) === '=') { strict = true; s = s.slice(1); }
    var tokens = tokenize(s.replace(/\bP\b/g, 'zzp'));
    if (!tokens.length) { return null; }
    return {
      raw: raw, tokens: tokens, weight: weight,
      anchorEnd: anchorEnd, anchorStart: anchorStart, strict: strict,
      joined: tokens.length === 2 ? tokens[0] + tokens[1] : null     // "after effects" ≈ "aftereffects"
    };
  }

  function tokEq(p, q) { return p === 'P' ? (q === 'HE' || q === 'YOU') : p === q; }

  /** Words in order, allowing ONE filler word between neighbours. */
  function matchPhrase(term, toks) {
    var p = term.tokens, n = toks.length;
    for (var i = 0; i < n; i++) {
      if (term.anchorStart && i > 0) { break; }
      if (!tokEq(p[0], toks[i])) { continue; }
      var pos = i, ok = true;
      for (var j = 1; j < p.length; j++) {
        var found = -1;
        if (pos + 1 < n && tokEq(p[j], toks[pos + 1])) { found = pos + 1; }
        else if (!term.strict && pos + 2 < n && tokEq(p[j], toks[pos + 2])) { found = pos + 2; }
        if (found < 0) { ok = false; break; }
        pos = found;
      }
      if (ok && (!term.anchorEnd || pos === n - 1)) { return 1; }
    }
    if (term.joined && toks.indexOf(term.joined) >= 0) { return 1; }
    return 0;
  }

  function matchSingle(term, toks, known) {
    var t = term.tokens[0], n = toks.length, i;
    for (i = 0; i < n; i++) {
      if (toks[i] === t && (!term.anchorEnd || i === n - 1) && (!term.anchorStart || i === 0)) { return 1; }
    }
    if (term.anchorEnd || term.anchorStart) { return 0; }
    if (t.length >= 6) {                                             // "show reel" ≈ "showreel"
      for (i = 0; i + 1 < n; i++) { if (toks[i] + toks[i + 1] === t) { return 1; } }
    }
    // A word that is itself a keyword ("contact", "great") is never a typo of another one ("contract", "greet").
    var raws = toks.raw;
    for (i = 0; i < n; i++) {
      if (known && (known[toks[i]] || (raws && known[raws[i]]))) { continue; }
      if (isTypoOf(toks[i], t) || (raws && raws[i] !== toks[i] && isTypoOf(raws[i], t))) { return FUZZY_QUALITY; }
    }
    return 0;
  }

  function matchTerm(term, toks, known) {
    return term.tokens.length === 1 ? matchSingle(term, toks, known) : matchPhrase(term, toks);
  }

  var SPECIAL = { P: 1, HE: 1, YOU: 1 };

  /** Does phrase `a` contain all of `b` as consecutive words? ("is P good at" contains "good at") */
  function containsRun(a, b) {
    for (var i = 0; i + b.length <= a.length; i++) {
      var ok = true;
      for (var j = 0; j < b.length; j++) { if (a[i + j] !== b[j]) { ok = false; break; } }
      if (ok) { return true; }
    }
    return false;
  }

  function compileEntities(list) {
    return (list || []).map(function (e) {
      var terms = [];
      e.terms.forEach(function (t) { var c = compileTerm(t, ENTITY_WEIGHT); if (c) { terms.push(c); } });
      return { name: e.name, hint: e.hint, terms: terms };
    });
  }

  function matchEntity(entity, toks, known) {
    var best = 0;
    for (var i = 0; i < entity.terms.length; i++) {
      var q = matchTerm(entity.terms[i], toks, known);
      if (q > best) { best = q; }
    }
    return best;
  }

  function matchedEntities(list, toks, known) {
    return list.filter(function (e) { return matchEntity(e, toks, known) > 0; });
  }

  /** Identity of a term once word endings are ignored ('thanks' and 'thank' are the same term). */
  function termKey(t) { return (t.anchorStart ? '^' : '') + (t.strict ? '=' : '') + t.tokens.join(' ') + (t.anchorEnd ? '$' : ''); }

  function joinNames(names) {
    if (names.length <= 1) { return names[0] || ''; }
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /* ------------------------------------------------------------------ */
  /* Engine                                                              */
  /* ------------------------------------------------------------------ */

  function createEngine(kb, options) {
    options = options || {};
    var random = options.random || Math.random;
    var vars = kb.vars || {};
    var byId = {};
    var known = Object.create(null);     // every word that appears in any keyword (used to avoid false typo matches)
    function learn(term) { term.tokens.forEach(function (w) { if (!SPECIAL[w]) { known[w] = true; } }); }
    var topics = kb.topics.map(function (def, index) {
      var topic = {
        def: def, index: index, id: def.id, chip: def.chip, smalltalk: !!def.smalltalk,
        priority: def.priority == null ? 1 : def.priority,
        answer: def.answer, actions: def.actions || [], followUps: def.followUps || [],
        entityText: def.entityText,
        terms: [],
        entities: compileEntities(def.entities),
        unlisted: compileEntities(def.unlisted)
      };
      var seen = Object.create(null);
      (def.terms || []).forEach(function (group) {
        for (var i = 1; i < group.length; i++) {
          var c = compileTerm(group[i], group[0]);
          if (!c) { continue; }
          var key = termKey(c);
          if (seen[key]) { if (c.weight > seen[key].weight) { seen[key].weight = c.weight; } continue; }
          seen[key] = c;
          topic.terms.push(c);
        }
      });
      // A longer phrase that contains a shorter one makes the shorter one redundant ("is P good at" contains "good at").
      topic.terms.forEach(function (b) {
        b.coveredBy = [];
        if (b.anchorEnd || b.anchorStart) { return; }
        topic.terms.forEach(function (a) {
          if (a !== b && a.tokens.length > b.tokens.length && containsRun(a.tokens, b.tokens)) { b.coveredBy.push(a); }
        });
      });
      topic.terms.forEach(learn);
      topic.entities.concat(topic.unlisted).forEach(function (e) { e.terms.forEach(learn); });
      byId[topic.id] = topic;
      return topic;
    });

    var state = { asked: {} };

    function pick(value) {
      if (Array.isArray(value)) { return value[Math.min(value.length - 1, Math.floor(random() * value.length))]; }
      return value;
    }

    function fill(str) {
      return String(str).replace(/\{(\w+)\}/g, function (m, key) { return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m; });
    }

    function enc(s) { return encodeURIComponent(s); }

    /* ------------------------------ scoring ------------------------------ */

    function scoreTopic(topic, toks) {
      var score = 0, hits = [];
      var matched = topic.terms.map(function (term) { return matchTerm(term, toks, known); });
      topic.terms.forEach(function (term, i) {
        if (matched[i] <= 0) { return; }
        var covered = term.coveredBy.some(function (a) { return matched[topic.terms.indexOf(a)] > 0; });
        if (covered) { return; }
        score += term.weight * matched[i];
        hits.push(term.raw);
      });
      topic.entities.concat(topic.unlisted).forEach(function (entity) {
        var q = matchEntity(entity, toks, known);
        if (q > 0) { score += ENTITY_WEIGHT * q; hits.push(entity.name); }
      });
      return { score: score, hits: hits };
    }

    function rank(toks) {
      var scored = [];
      topics.forEach(function (topic) {
        var s = scoreTopic(topic, toks);
        if (s.score > 0) { scored.push({ topic: topic, score: s.score, hits: s.hits }); }
      });
      scored.sort(function (a, b) {
        return (b.score - a.score) || (b.topic.priority - a.topic.priority) || (a.topic.index - b.topic.index);
      });
      return scored;
    }

    /* ----------------------------- responses ----------------------------- */

    function entityLead(topic, toks) {
      if (!topic.entities.length && !topic.unlisted.length) { return ''; }
      var yes = matchedEntities(topic.entities, toks, known);
      var no = matchedEntities(topic.unlisted, toks, known);
      if (!yes.length && !no.length) { return ''; }
      var T = topic.entityText || {};
      var yesNames = joinNames(yes.map(function (e) { return e.name; }));
      var noNames = joinNames(no.map(function (e) { return e.name; }));
      var yesVerb = yes.length > 1 ? 'are' : 'is';
      var hint = no.length && no[0].hint ? ' ' + no[0].hint : '';
      if (yes.length && no.length) {
        return T.mixed.replace('{yes}', yesNames).replace('{yesVerb}', yesVerb).replace('{no}', noNames) + hint;
      }
      if (yes.length) {
        return (yes.length > 1 && T.yesMany ? T.yesMany : T.yes).replace('{names}', yesNames).replace('{verb}', yesVerb);
      }
      return T.no.replace('{names}', noNames) + hint;
    }

    function resolveActions(list, question) {
      var out = [];
      (list || []).forEach(function (item) {
        var spec = typeof item === 'string' ? { link: item } : item;
        var base = kb.links[spec.link];
        if (!base) { return; }
        var href = fill(base.href);
        if (/^mailto:/.test(href) && (spec.subject || spec.body)) {
          var q = [];
          if (spec.subject) { q.push('subject=' + enc(spec.subject)); }
          if (spec.body) { q.push('body=' + enc(spec.body)); }
          href += '?' + q.join('&');
        }
        out.push({ label: fill(spec.label || base.label), href: href, icon: base.icon, external: !!base.external });
      });
      return out;
    }

    function forwardAction(question) {
      var f = kb.fallback;
      return {
        label: f.emailLabel,
        href: fill('mailto:{email}') + '?subject=' + enc(f.emailSubject) + '&body=' + enc(question),
        icon: 'mail', external: false
      };
    }

    function chip(id) { return { label: byId[id].chip, topic: id }; }

    function suggest(current, extras) {
      var out = [];
      function add(id) {
        var t = byId[id];
        if (!t || !t.chip || (current && t.id === current.id) || out.indexOf(id) >= 0) { return; }
        out.push(id);
      }
      (extras || []).forEach(add);
      (current ? current.followUps : []).forEach(function (id) { if (!state.asked[id]) { add(id); } });
      (kb.suggestionOrder || []).forEach(function (id) { if (!state.asked[id]) { add(id); } });
      (current ? current.followUps : []).forEach(add);
      (kb.suggestionOrder || []).forEach(add);
      return out.slice(0, MAX_CHIPS).map(chip);
    }

    function markAsked(topic) {
      if (!topic.smalltalk && topic.id !== 'identity' && topic.id !== 'help') { state.asked[topic.id] = true; }
    }

    function answerResponse(best, ranked, toks, question) {
      var topic = best.topic;
      var lead = toks.length ? entityLead(topic, toks) : '';
      var body = fill(pick(topic.answer));
      var extras = ranked.filter(function (r) {
        return r.topic !== topic && !r.topic.smalltalk && r.topic.chip && r.score >= Math.max(2, best.score * 0.5);
      }).slice(0, 2).map(function (r) { return r.topic.id; });
      markAsked(topic);
      return {
        kind: 'answer', topic: topic.id, score: best.score,
        text: lead ? fill(lead) + '\n\n' + body : body,
        actions: resolveActions(topic.actions, question),
        suggestions: suggest(topic, extras)
      };
    }

    function fallbackResponse(question) {
      return {
        kind: 'fallback', topic: null, score: 0,
        text: fill(pick(kb.fallback.text)),
        actions: [forwardAction(question)],
        suggestions: suggest(null, [])
      };
    }

    function clarifyResponse(question, ranked) {
      var candidates = ranked.filter(function (r) { return !r.topic.smalltalk && r.topic.chip && r.score >= CLARIFY; }).slice(0, 3);
      if (!candidates.length) { return fallbackResponse(question); }
      return {
        kind: 'clarify', topic: null, score: candidates[0].score,
        text: fill(kb.fallback.clarify),
        actions: [forwardAction(question)],
        suggestions: candidates.map(function (r) { return chip(r.topic.id); })
      };
    }

    /* -------------------------------- API -------------------------------- */

    function reply(text) {
      var question = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT);
      if (!question) { return null; }
      var toks = tokenize(question);
      var ranked = rank(toks);
      var best = ranked[0];
      if (best && best.topic.smalltalk) {
        var real = ranked.filter(function (r) { return !r.topic.smalltalk; })[0];
        if (real && real.score >= Math.max(CONFIDENT, best.score * SMALLTALK_YIELD_RATIO)) { best = real; }
      }
      if (!best || best.score < CLARIFY) { return fallbackResponse(question); }
      if (best.score < CONFIDENT) { return clarifyResponse(question, ranked); }
      return answerResponse(best, ranked, toks, question);
    }

    /** Answer a topic directly (used by the suggestion buttons). */
    function replyToTopic(id) {
      var topic = byId[id];
      if (!topic) { return null; }
      return answerResponse({ topic: topic, score: Infinity }, [], [], topic.chip || '');
    }

    function welcome() {
      return {
        text: fill(kb.welcome),
        suggestions: (kb.starters || []).filter(function (id) { return byId[id] && byId[id].chip; }).map(chip)
      };
    }

    function reset() { state.asked = {}; }

    return {
      reply: reply,
      replyToTopic: replyToTopic,
      welcome: welcome,
      reset: reset,
      // exposed for tests / debugging
      rank: function (text) { return rank(tokenize(text)).map(function (r) { return { id: r.topic.id, score: r.score, hits: r.hits }; }); },
      topicIds: function () { return topics.map(function (t) { return t.id; }); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Knowledge-base sanity check (used by the tests)                     */
  /* ------------------------------------------------------------------ */

  function validateKnowledge(kb) {
    var problems = [], ids = {};
    var vars = kb.vars || {}, links = kb.links || {};
    function checkVars(where, str) {
      String(str).replace(/\{(\w+)\}/g, function (m, key) {
        if (!Object.prototype.hasOwnProperty.call(vars, key) && key !== 'names' && key !== 'verb' && key !== 'yes' &&
            key !== 'yesVerb' && key !== 'no') {
          problems.push(where + ': unknown placeholder {' + key + '}');
        }
        return m;
      });
    }
    (kb.topics || []).forEach(function (t) {
      if (!t.id) { problems.push('topic without id'); return; }
      if (ids[t.id]) { problems.push('duplicate topic id: ' + t.id); }
      ids[t.id] = t;
    });
    (kb.topics || []).forEach(function (t) {
      var at = 'topic "' + t.id + '"';
      if (!t.answer || (Array.isArray(t.answer) && !t.answer.length)) { problems.push(at + ': missing answer'); }
      [].concat(t.answer || []).forEach(function (a) { checkVars(at + ' answer', a); });
      if (!t.terms || !t.terms.length) { problems.push(at + ': no terms'); }
      (t.terms || []).forEach(function (g) {
        if (typeof g[0] !== 'number' || g.length < 2) { problems.push(at + ': term group must be [weight, ...phrases]'); return; }
        for (var i = 1; i < g.length; i++) { if (!compileTerm(g[i], g[0])) { problems.push(at + ': empty term "' + g[i] + '"'); } }
      });
      var seenTerms = {};
      (t.terms || []).forEach(function (g) {
        for (var i = 1; i < g.length; i++) {
          var c = compileTerm(g[i], g[0]);
          if (!c) { continue; }
          var key = termKey(c);
          if (seenTerms[key]) { problems.push(at + ': "' + g[i] + '" repeats "' + seenTerms[key] + '" (they match the same words, so one can go)'); }
          else { seenTerms[key] = g[i]; }
        }
      });
      (t.followUps || []).forEach(function (id) {
        if (!ids[id]) { problems.push(at + ': followUp "' + id + '" does not exist'); }
        else if (!ids[id].chip) { problems.push(at + ': followUp "' + id + '" has no chip label'); }
      });
      (t.actions || []).forEach(function (a) {
        var key = typeof a === 'string' ? a : a.link;
        if (!links[key]) { problems.push(at + ': action "' + key + '" is not in links'); }
      });
      if ((t.entities || t.unlisted) && !t.entityText) { problems.push(at + ': entities need entityText'); }
    });
    (kb.starters || []).concat(kb.suggestionOrder || []).forEach(function (id) {
      if (!ids[id]) { problems.push('suggestion "' + id + '" does not exist'); }
      else if (!ids[id].chip) { problems.push('suggestion "' + id + '" has no chip label'); }
    });
    Object.keys(links).forEach(function (k) {
      checkVars('link ' + k, links[k].href);
      checkVars('link ' + k, links[k].label);
    });
    return problems;
  }

  return {
    createEngine: createEngine,
    validateKnowledge: validateKnowledge,
    // exposed for tests
    tokenize: tokenize,
    stem: stem,
    editDistance: editDistance
  };
});

/*
 * Chat window for "Shadab's Assistant".
 *
 * Adds a floating "Ask about Shadab" button to the page. It opens a small chat
 * panel where visitors can ask about Shadab and get answers from knowledge.js.
 *
 * Load order in index.html:  knowledge.js → engine.js → widget.js
 * (Styles: widget.css.)  Nothing here needs editing to change the answers.
 *
 * Handy extras
 *   • Any element with  data-open-assistant  opens the chat when clicked, e.g.
 *       <a href="#" data-open-assistant>Ask my assistant</a>
 *   • From code:  ShadabAssistant.open()  /  .close()  /  .ask('what are his skills?')
 *
 * Safety: visitor text and answers are only ever added with textContent / DOM
 * nodes (never innerHTML), and links are limited to http(s), mailto, tel and
 * same-site files. Nothing typed into the chat is sent anywhere or stored.
 */
(function () {
  'use strict';

  var kb = window.PORTFOLIO_KB;
  var Engine = window.PortfolioBotEngine;
  if (!kb || !Engine) {
    if (window.console && console.warn) { console.warn('[assistant] knowledge.js and engine.js must load before widget.js'); }
    return;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var NUDGE_KEY = 'sb-nudge-seen';
  var NUDGE_DELAY = 5000;      // ms before the little "ask me" bubble appears
  var NUDGE_LIFETIME = 14000;  // ms before it fades away by itself
  var INTERACTIVE = 'a, button, input, [role="button"]';

  /* ------------------------------------------------------------------ */
  /* Tiny helpers                                                        */
  /* ------------------------------------------------------------------ */

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (attrs) { Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); }); }
    return node;
  }

  function text(node, str) { node.textContent = str; return node; }

  // Feather-style line icons, built node by node (no innerHTML).
  var ICONS = {
    chat:     [['path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' }]],
    close:    [['line', { x1: 18, y1: 6, x2: 6, y2: 18 }], ['line', { x1: 6, y1: 6, x2: 18, y2: 18 }]],
    send:     [['line', { x1: 22, y1: 2, x2: 11, y2: 13 }], ['polygon', { points: '22 2 15 22 11 13 2 9 22 2' }]],
    mail:     [['path', { d: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' }], ['polyline', { points: '22,6 12,13 2,6' }]],
    phone:    [['path', { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' }]],
    linkedin: [['path', { d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z' }], ['rect', { x: 2, y: 9, width: 4, height: 12 }], ['circle', { cx: 4, cy: 4, r: 2 }]],
    image:    [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }], ['circle', { cx: 8.5, cy: 8.5, r: 1.5 }], ['polyline', { points: '21 15 16 10 5 21' }]],
    layers:   [['polygon', { points: '12 2 2 7 12 12 22 7 12 2' }], ['polyline', { points: '2 17 12 22 22 17' }], ['polyline', { points: '2 12 12 17 22 12' }]],
    play:     [['circle', { cx: 12, cy: 12, r: 10 }], ['polygon', { points: '10 8 16 12 10 16 10 8' }]],
    file:     [['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }], ['polyline', { points: '14 2 14 8 20 8' }], ['line', { x1: 16, y1: 13, x2: 8, y2: 13 }], ['line', { x1: 16, y1: 17, x2: 8, y2: 17 }]]
  };

  function icon(name, size) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    var parts = ICONS[name] || [];
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    parts.forEach(function (p) {
      var shape = document.createElementNS(SVG_NS, p[0]);
      Object.keys(p[1]).forEach(function (k) { shape.setAttribute(k, p[1][k]); });
      svg.appendChild(shape);
    });
    return svg;
  }

  /* ------------------------------------------------------------------ */
  /* Answer text → DOM   (**bold**, [link](url), "- " bullets)           */
  /* ------------------------------------------------------------------ */

  // Only these destinations are ever turned into links.
  function safeHref(url) {
    if (/^(https?:|mailto:|tel:)/i.test(url)) { return url; }
    if (/^[\w][\w.\-\/]*$/.test(url)) { return url; }    // a file on this site, e.g. Resume.pdf
    return null;
  }

  function isExternal(url) { return /^https?:/i.test(url); }

  function inline(parent, str) {
    var re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g, last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) { parent.appendChild(document.createTextNode(str.slice(last, m.index))); }
      if (m[1] !== undefined) {
        parent.appendChild(text(el('strong'), m[1]));
      } else {
        var href = safeHref(m[3]);
        if (href) {
          var a = text(el('a', 'sb-link'), m[2]);
          a.setAttribute('href', href);
          if (isExternal(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
          parent.appendChild(a);
        } else {
          parent.appendChild(document.createTextNode(m[2]));
        }
      }
      last = re.lastIndex;
    }
    if (last < str.length) { parent.appendChild(document.createTextNode(str.slice(last))); }
  }

  function renderRich(container, str) {
    var block = null, kind = '';
    String(str).split('\n').forEach(function (line) {
      var bullet = /^\s*-\s+(.*)$/.exec(line);
      if (bullet) {
        if (kind !== 'ul') { block = el('ul', 'sb-list'); container.appendChild(block); kind = 'ul'; }
        var li = el('li'); inline(li, bullet[1]); block.appendChild(li);
      } else if (!line.trim()) {
        block = null; kind = '';
      } else {
        if (kind === 'p') { block.appendChild(el('br')); }
        else { block = el('p', 'sb-para'); container.appendChild(block); kind = 'p'; }
        inline(block, line);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Build the widget                                                    */
  /* ------------------------------------------------------------------ */

  function build() {
    if (document.getElementById('sb-root')) { return; }        // included twice by mistake — keep just one chat
    var engine = Engine.createEngine(kb);
    var ui = kb.ui || {};
    var doc = document.documentElement;
    var cursorDot = document.getElementById('cursor');           // the site's custom cursor (may be hidden on mobile)
    var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var phoneQuery = window.matchMedia ? window.matchMedia('(max-width: 600px)') : { matches: false };
    var finePointer = window.matchMedia ? window.matchMedia('(pointer: fine)') : { matches: true };

    var state = { open: false, started: false, typing: null, queue: [], busy: false, lastFocus: null };
    var nudgeTimers = [];

    /* ---- markup ---- */
    var root = el('div', 'sb-root', { id: 'sb-root' });

    // Decorative: the launcher already has a full label, so keep this out of the screen-reader and Tab order.
    var nudge = el('div', 'sb-nudge', { 'aria-hidden': 'true' });
    var nudgeText = text(el('span'), ui.nudge || 'Ask me about Shadab!');
    var nudgeClose = el('button', 'sb-nudge-close', { type: 'button', tabindex: '-1', 'aria-label': 'Dismiss suggestion' });
    nudgeClose.appendChild(icon('close', 14));
    nudge.appendChild(nudgeText);
    nudge.appendChild(nudgeClose);

    var launcher = el('button', 'sb-launcher', {
      type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'sb-panel',
      'aria-label': (ui.launcher || 'Ask about Shadab') + ' — open the chat assistant'
    });
    launcher.appendChild(icon('chat', 22));
    launcher.appendChild(text(el('span', 'sb-launcher-text'), ui.launcher || 'Ask about Shadab'));

    var panel = el('section', 'sb-panel', { id: 'sb-panel', role: 'dialog', 'aria-label': ui.title || 'Assistant', tabindex: '-1' });

    var head = el('header', 'sb-head');
    var avatar = text(el('span', 'sb-avatar', { 'aria-hidden': 'true' }), 'SR');
    var titles = el('div', 'sb-titles');
    titles.appendChild(text(el('strong', 'sb-title'), ui.title || 'Assistant'));
    var status = el('span', 'sb-status');
    status.appendChild(el('i', 'sb-dot', { 'aria-hidden': 'true' }));
    status.appendChild(document.createTextNode(ui.status || ''));
    titles.appendChild(status);
    var closeBtn = el('button', 'sb-close', { type: 'button', 'aria-label': 'Close chat' });
    closeBtn.appendChild(icon('close', 20));
    head.appendChild(avatar); head.appendChild(titles); head.appendChild(closeBtn);

    var log = el('div', 'sb-log', { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Conversation', tabindex: '0' });
    var chips = el('div', 'sb-chips', { role: 'group', 'aria-label': 'Suggested questions' });

    var form = el('form', 'sb-form', { autocomplete: 'off' });
    var input = el('input', 'sb-input', {
      type: 'text', name: 'question', maxlength: '300', placeholder: ui.placeholder || 'Type your question…',
      'aria-label': 'Type your question', enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'sentences'
    });
    var send = el('button', 'sb-send', { type: 'submit', 'aria-label': 'Send message', disabled: 'disabled' });
    send.appendChild(icon('send', 18));
    form.appendChild(input); form.appendChild(send);

    var foot = text(el('p', 'sb-foot'), ui.disclaimer || '');

    panel.appendChild(head); panel.appendChild(log); panel.appendChild(chips); panel.appendChild(form); panel.appendChild(foot);
    root.appendChild(nudge); root.appendChild(launcher); root.appendChild(panel);
    document.body.appendChild(root);

    /* ---- messages ---- */
    function scrollLog(toNode) {
      var behavior = reducedMotion.matches ? 'auto' : 'smooth';
      var top = log.scrollHeight;
      // A long answer should be read from its first line, not its last.
      if (toNode && toNode.offsetHeight > log.clientHeight - 32) { top = Math.max(0, toNode.offsetTop - 12); }
      if (log.scrollTo) { log.scrollTo({ top: top, behavior: behavior }); } else { log.scrollTop = top; }
    }

    function addMessage(who, fill) {
      var row = el('div', 'sb-msg sb-' + who);
      var bubble = el('div', 'sb-bubble');
      bubble.appendChild(text(el('span', 'sb-sr'), who === 'bot' ? 'Assistant: ' : 'You: '));
      fill(bubble);
      row.appendChild(bubble);
      log.appendChild(row);
      scrollLog(row);
      return row;
    }

    function addUser(str) { return addMessage('user', function (b) { b.appendChild(document.createTextNode(str)); }); }

    function addBot(response) {
      return addMessage('bot', function (b) {
        var body = el('div', 'sb-body');
        renderRich(body, response.text);
        b.appendChild(body);
        if (response.actions && response.actions.length) {
          var row = el('div', 'sb-actions');
          response.actions.forEach(function (a) {
            var href = safeHref(a.href);
            if (!href) { return; }
            var link = el('a', 'sb-action', { href: href });
            if (a.external) { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); }
            if (a.icon) { link.appendChild(icon(a.icon, 16)); }
            link.appendChild(text(el('span'), a.label));
            row.appendChild(link);
          });
          if (row.childNodes.length) { b.appendChild(row); }
        }
      });
    }

    function showTyping() {
      hideTyping();
      var row = el('div', 'sb-msg sb-bot sb-typing', { 'aria-hidden': 'true' });
      var bubble = el('div', 'sb-bubble');
      for (var i = 0; i < 3; i++) { bubble.appendChild(el('i')); }
      row.appendChild(bubble);
      log.appendChild(row);
      state.typing = row;
      scrollLog();
    }

    function hideTyping() {
      if (state.typing && state.typing.parentNode) { state.typing.parentNode.removeChild(state.typing); }
      state.typing = null;
    }

    // If the visitor is reading the latest message and the log's height changes (on-screen keyboard, rotation,
    // the suggestion row wrapping differently…), stay on the latest message instead of drifting up.
    var pinned = true;
    log.addEventListener('scroll', function () { pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48; }, { passive: true });
    if (window.ResizeObserver) {
      new window.ResizeObserver(function () { if (pinned && state.open) { log.scrollTop = log.scrollHeight; } }).observe(log);
    }

    /* ---- suggestion buttons ---- */
    function setChips(list) {
      // A hovered chip that gets removed can't send "mouseout", so the cursor ring would stay enlarged.
      if (chips.matches && chips.matches(':hover')) { ringOff(); }
      while (chips.firstChild) { chips.removeChild(chips.firstChild); }
      (list || []).forEach(function (s) {
        var b = text(el('button', 'sb-chip', { type: 'button' }), s.label);
        b.addEventListener('click', function () { chooseChip(s, b); });
        chips.appendChild(b);
      });
      chips.hidden = !chips.childNodes.length;
    }

    /* ---- conversation flow ---- */
    function delayFor(str) {
      if (reducedMotion.matches) { return 200; }
      return Math.min(900, 380 + String(str).length * 1.6);
    }

    function enqueue(job) { state.queue.push(job); if (!state.busy) { pump(); } }

    function pump() {
      var job = state.queue.shift();
      if (!job) { state.busy = false; return; }
      state.busy = true;
      var response = job();
      if (!response) { pump(); return; }
      showTyping();
      window.setTimeout(function () {
        hideTyping();
        setChips(response.suggestions);     // change the layout first, so the scroll below lands in the right place
        addBot(response);
        pump();
      }, delayFor(response.text));
    }

    function ask(question) {
      var q = String(question == null ? '' : question).replace(/\s+/g, ' ').trim();
      if (!q) { return; }
      setChips([]);
      addUser(q);
      enqueue(function () { return engine.reply(q); });
    }

    function chooseChip(suggestion, button) {
      var hadFocus = document.activeElement === button;
      setChips([]);
      addUser(suggestion.label);
      enqueue(function () { return engine.replyToTopic(suggestion.topic); });
      // The focused button is about to be replaced; keep keyboard users oriented.
      if (hadFocus) { (finePointer.matches ? input : log).focus({ preventScroll: true }); }
    }

    function startConversation() {
      if (state.started) { return; }
      state.started = true;
      var welcome = engine.welcome();
      setChips(welcome.suggestions);
      addBot({ text: welcome.text, actions: [] });
    }

    /* ---- open / close ---- */
    function isFullscreen() { return !!phoneQuery.matches; }

    function syncViewport() {
      // On phones the panel fills the screen; track the visible area so the on-screen keyboard never hides the input.
      var vv = window.visualViewport;
      if (vv && state.open && isFullscreen()) {
        panel.style.setProperty('--sb-height', Math.round(vv.height) + 'px');
        panel.style.setProperty('--sb-top', Math.round(vv.offsetTop) + 'px');
      } else {
        panel.style.removeProperty('--sb-height');
        panel.style.removeProperty('--sb-top');
      }
      var modal = state.open && isFullscreen();
      panel.setAttribute('aria-modal', modal ? 'true' : 'false');
      doc.classList.toggle('sb-lock', modal);
    }

    function open() {
      if (state.open) { return; }
      state.open = true;
      state.lastFocus = document.activeElement;
      hideNudge(true);
      root.classList.add('is-open');
      launcher.setAttribute('aria-expanded', 'true');
      startConversation();
      syncViewport();
      window.setTimeout(function () {
        // Don't pop the keyboard on phones; on desktop the cursor should be ready to type.
        (finePointer.matches && !isFullscreen() ? input : panel).focus({ preventScroll: true });
        scrollLog();
      }, reducedMotion.matches ? 0 : 60);
    }

    function close() {
      if (!state.open) { return; }
      state.open = false;
      root.classList.remove('is-open');
      launcher.setAttribute('aria-expanded', 'false');
      syncViewport();
      ringOff();
      var back = state.lastFocus && document.contains(state.lastFocus) && state.lastFocus !== document.body ? state.lastFocus : launcher;
      (back.focus ? back : launcher).focus({ preventScroll: true });
    }

    /* ---- the little "ask me" bubble ---- */
    function nudgeSeen() { try { return window.sessionStorage.getItem(NUDGE_KEY) === '1'; } catch (e) { return false; } }
    function rememberNudge() { try { window.sessionStorage.setItem(NUDGE_KEY, '1'); } catch (e) { /* private mode — fine */ } }

    function showNudge() {
      if (state.open || nudgeSeen()) { return; }
      root.classList.add('has-nudge');
      nudgeTimers.push(window.setTimeout(function () { hideNudge(true); }, NUDGE_LIFETIME));
    }

    function hideNudge(remember) {
      nudgeTimers.forEach(window.clearTimeout);
      nudgeTimers = [];
      root.classList.remove('has-nudge');
      if (remember) { rememberNudge(); }
    }

    if (!nudgeSeen()) { nudgeTimers.push(window.setTimeout(showNudge, NUDGE_DELAY)); }

    /* ---- the site's custom cursor ---- */
    // script.js only wires up links that exist when the page loads, so mirror its hover effect for the chat controls.
    function ringOn() {
      if (!cursorDot) { return; }
      cursorDot.style.width = '40px';
      cursorDot.style.height = '40px';
      cursorDot.style.backgroundColor = 'transparent';
      cursorDot.style.border = '2px solid var(--accent-color)';
    }

    function ringOff() {
      if (!cursorDot) { return; }
      cursorDot.style.width = '12px';
      cursorDot.style.height = '12px';
      cursorDot.style.backgroundColor = 'var(--accent-color)';
      cursorDot.style.border = 'none';
    }

    root.addEventListener('mouseover', function (e) { if (e.target.closest && e.target.closest(INTERACTIVE)) { ringOn(); } });
    root.addEventListener('mouseout', function (e) {
      var to = e.relatedTarget;
      if (!(to && to.closest && root.contains(to) && to.closest(INTERACTIVE))) { ringOff(); }
    });

    /* ---- events ---- */
    launcher.addEventListener('click', function () { if (state.open) { close(); } else { open(); } });
    closeBtn.addEventListener('click', close);
    nudgeClose.addEventListener('click', function () { hideNudge(true); });
    nudgeText.addEventListener('click', function () { open(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = input.value;
      if (!value.trim()) { return; }
      input.value = '';
      send.disabled = true;
      ask(value);
    });

    input.addEventListener('input', function () { send.disabled = !input.value.trim(); });

    document.addEventListener('keydown', function (e) {
      if (!state.open) { return; }
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !isFullscreen()) { return; }
      // Full-screen (phone) mode behaves like a modal: keep Tab inside the chat.
      var items = Array.prototype.filter.call(panel.querySelectorAll('a[href], button:not([disabled]), input, [tabindex="0"]'), function (n) {
        return n.offsetParent !== null;
      });
      if (!items.length) { return; }
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('[data-open-assistant]');
      if (trigger) { e.preventDefault(); open(); }
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport);
      window.visualViewport.addEventListener('scroll', syncViewport);
    }
    window.addEventListener('resize', syncViewport);

    window.ShadabAssistant = {
      open: open,
      close: close,
      ask: function (question) { open(); ask(question); }
    };
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', build); }
  else { build(); }
})();

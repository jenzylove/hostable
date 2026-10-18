(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { meta: null, rows: [], cities: new Set(), results: null };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function errMsg(e) { return (e && e.message) ? e.message : 'Something went wrong.'; }

  async function api(path, body) {
    var opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    var res;
    try { res = await fetch(path, opt); }
    catch (e) { throw new Error('Could not reach the server (' + path + ').'); }
    var data = null, txt = '';
    try { txt = await res.text(); data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
    if (!res.ok) {
      var m = data && (data.error || data.message || data.detail);
      throw new Error('Request failed (' + res.status + ')' + (m ? ': ' + (typeof m === 'string' ? m : JSON.stringify(m)) : (txt && !data ? ': ' + txt.slice(0, 200) : '')));
    }
    if (data == null) throw new Error('The server returned an empty response.');
    return data;
  }

  /* ---------- meta ---------- */
  async function loadMeta() {
    try {
      var m = await api('/api/meta');
      state.meta = m;
      var sel = $('preset');
      sel.textContent = '';
      var o0 = el('option', null, 'Choose a preset'); o0.value = ''; sel.appendChild(o0);
      (m.presets || []).forEach(function (p) { var o = el('option', null, p.label); o.value = p.id; sel.appendChild(o); });
      renderChips();
      renderRows();
      renderSources();
      if (m.presets && m.presets.length) { sel.value = m.presets[0].id; applyPreset(m.presets[0].id); }
    } catch (e) {
      var b = $('metaErr'); b.hidden = false; b.textContent = 'Could not load countries and cities. ' + errMsg(e);
      $('chips').textContent = '';
      $('preset').textContent = '';
      $('sources').textContent = '';
      $('sources').appendChild(el('li', 'muted', 'Sources unavailable: ' + errMsg(e)));
    }
  }

  function countryName(iso) {
    var c = ((state.meta && state.meta.countries) || []).find(function (c) { return c.iso3 === iso; });
    return c ? c.name : iso;
  }
  function resolveCountry(s) {
    s = String(s).trim(); if (!s) return null;
    var list = (state.meta && state.meta.countries) || [];
    var u = s.toUpperCase(), l = s.toLowerCase();
    var c = list.find(function (c) { return c.iso3 === u; }) || list.find(function (c) { return c.name.toLowerCase() === l; });
    return c ? c.iso3 : null;
  }

  /* ---------- community rows ---------- */
  function applyPreset(id) {
    var p = ((state.meta && state.meta.presets) || []).find(function (p) { return p.id === id; });
    if (!p) return;
    state.rows = Object.keys(p.counts).map(function (k) { return { iso3: k, count: p.counts[k] }; });
    renderRows();
  }
  function renderRows() {
    var box = $('rows'); box.textContent = '';
    var countries = (state.meta && state.meta.countries) || [];
    state.rows.forEach(function (r, i) {
      var row = el('div', 'crow');
      var sel = el('select'); sel.setAttribute('aria-label', 'Country');
      var blank = el('option', null, 'Select country'); blank.value = ''; sel.appendChild(blank);
      countries.forEach(function (c) { var o = el('option', null, c.name); o.value = c.iso3; sel.appendChild(o); });
      sel.value = r.iso3;
      sel.addEventListener('change', function () { r.iso3 = sel.value; });
      var num = el('input'); num.type = 'number'; num.min = '0'; num.step = '1'; num.value = r.count; num.setAttribute('aria-label', 'Number of members');
      num.addEventListener('input', function () { r.count = num.value; });
      var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove row');
      x.addEventListener('click', function () { state.rows.splice(i, 1); renderRows(); });
      row.append(sel, num, x); box.appendChild(row);
    });
  }
  $('addRow').addEventListener('click', function () { state.rows.push({ iso3: '', count: 10 }); renderRows(); });
  $('preset').addEventListener('change', function (e) { if (e.target.value) applyPreset(e.target.value); });
  $('toggleCsv').addEventListener('click', function () { var b = $('csvBox'); b.hidden = !b.hidden; });
  $('applyCsv').addEventListener('click', function () {
    var lines = $('csv').value.split(/\r?\n/), out = [], bad = [];
    lines.forEach(function (ln) {
      ln = ln.trim(); if (!ln) return;
      var idx = Math.max(ln.lastIndexOf(','), ln.lastIndexOf('\t'));
      var parts = idx > -1 ? [ln.slice(0, idx), ln.slice(idx + 1)] : ln.split(/\s+(?=\d+$)/);
      var iso = resolveCountry(parts[0] || ''), n = parseInt((parts[1] || '').trim(), 10);
      if (iso && n >= 0) out.push({ iso3: iso, count: n }); else bad.push(ln);
    });
    if (out.length) { state.rows = out; renderRows(); $('preset').value = ''; }
    $('csvMsg').textContent = out.length ? ('Loaded ' + out.length + ' countries.' + (bad.length ? ' Skipped: ' + bad.join('; ') : '')) : ('Nothing recognised. ' + (bad.length ? 'Check: ' + bad.join('; ') : ''));
  });

  /* ---------- cities ---------- */
  function renderChips() {
    var box = $('chips'); box.textContent = '';
    var cities = (state.meta && state.meta.cities) || [];
    if (!state.cities.size) cities.slice(0, 8).forEach(function (c) { state.cities.add(c.id); });
    cities.forEach(function (c) {
      var b = el('button', 'chip', c.name + ', ' + c.country); b.type = 'button';
      b.setAttribute('aria-pressed', state.cities.has(c.id) ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (state.cities.has(c.id)) state.cities.delete(c.id); else state.cities.add(c.id);
        b.setAttribute('aria-pressed', state.cities.has(c.id)); updCount();
      });
      box.appendChild(b);
    });
    updCount();
  }
  function updCount() { $('cityCount').textContent = state.cities.size + ' selected'; }

  /* ---------- sliders ---------- */
  ['us', 'sch'].forEach(function (id) {
    $(id).addEventListener('input', function () { $(id + 'Out').textContent = $(id).value + '%'; });
  });

  function payload() {
    var counts = {};
    state.rows.forEach(function (r) {
      var n = parseInt(r.count, 10);
      if (r.iso3 && n > 0) counts[r.iso3] = (counts[r.iso3] || 0) + n;
    });
    return {
      counts: counts,
      cities: Array.from(state.cities),
      holders: { us: $('us').value / 100, schengen: $('sch').value / 100 }
    };
  }

  /* ---------- split flap ---------- */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%.';
  function flapText(text, startDelay) {
    var wrap = el('span', 'cell');
    var chars = String(text).toUpperCase().split('');
    chars.forEach(function (ch, i) {
      var f = el('span', 'fl' + (ch === ' ' ? ' sp' : ''), ch === ' ' ? ' ' : ch);
      wrap.appendChild(f);
      if (reduce || ch === ' ') return;
      f.classList.add('spin');
      var end = startDelay + 350 + i * 55 + Math.random() * 250;
      var t0 = performance.now();
      f.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      var iv = setInterval(function () {
        if (performance.now() - t0 >= end) { clearInterval(iv); f.textContent = ch; f.classList.remove('spin'); }
        else f.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }, 70);
    });
    return wrap;
  }
  function num(n, d) { return (n == null || isNaN(n)) ? '?' : Number(n).toFixed(d == null ? 1 : d).replace(/\.0$/, ''); }

  function statusInfo(l) {
    var src = l.rateSource ? ' (' + l.rateSource + ')' : '';
    var rate = (l.refusalRate != null) ? num(l.refusalRate * 100, 1) + '% refused' + src : 'refusal rate unknown';
    switch (l.status) {
      case 'home': return { tag: 'Home', cls: 'ok', text: 'Lives in this country, no entry needed.' };
      case 'enters': return { tag: 'Enters', cls: 'ok', text: 'Can enter' + (l.requirement ? ': ' + l.requirement : ' without a visa') + '.' };
      case 'needs_visa': return { tag: 'Visa', cls: 'mid', text: 'Needs a visa, ' + rate + (l.requirement ? '. ' + l.requirement : '.') };
      case 'no_admission': return { tag: 'Barred', cls: 'bad', text: 'Not admitted' + (l.requirement ? ': ' + l.requirement : '') + '.' };
      case 'no_route': return { tag: 'No route', cls: 'bad', text: 'No legal flight connection from here.' };
      default: return { tag: String(l.status || 'Unknown'), cls: 'mid', text: l.requirement || '' };
    }
  }

  function renderBoard(data) {
    var board = $('board'); board.textContent = '';
    $('boardWrap').hidden = false;
    var total = data.results && data.results[0] ? data.results[0].total : 0;
    $('boardSub').textContent = total + ' members scored, ' + data.results.length + ' cities';
    data.results.forEach(function (r, i) {
      var d = i * 220;
      var btn = el('button', 'brow'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
      var keeps = el('span', 'keeps'); keeps.appendChild(flapText('Keeps ' + num(r.keepsPct, 0) + '%', d));
      btn.append(
        flapText(String(i + 1), d),
        flapText(r.city.name, d),
        flapText(r.city.country, d),
        keeps,
        flapText(num(r.expectedLost, 1), d),
        flapText(String(r.unknownRisk == null ? '?' : num(r.unknownRisk, 0)), d)
      );
      btn.setAttribute('aria-label', 'Rank ' + (i + 1) + ', ' + r.city.name + ', keeps ' + num(r.keepsPct, 0) + ' percent');
      var panel = null;
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        if (open) { panel.remove(); panel = null; btn.setAttribute('aria-expanded', 'false'); return; }
        panel = buildLost(r); btn.after(panel); btn.setAttribute('aria-expanded', 'true');
      });
      board.appendChild(btn);
    });
  }
  function buildLost(r) {
    var p = el('div', 'expand');
    p.appendChild(el('h4', null, 'Who you lose in ' + r.city.name + ', ' + r.city.country));
    var list = (r.lostBy || []).slice();
    if (!list.length) { p.appendChild(el('p', null, 'Nobody. Every member can get in.')); return p; }
    list.forEach(function (l) {
      var s = statusInfo(l);
      var row = el('div', 'lost-row');
      row.appendChild(el('span', 'n', l.name || l.iso3));
      row.appendChild(el('span', 'c', num(l.count, 0) + ' people'));
      var why = el('span', 'why');
      why.appendChild(el('span', 'tag ' + s.cls, s.tag));
      why.appendChild(document.createTextNode(s.text));
      if (l.route) why.appendChild(el('span', 'route', 'Route: ' + l.route));
      row.appendChild(why);
      row.appendChild(el('span', 'e', 'lose ' + num(l.expectedLost, 1)));
      p.appendChild(row);
    });
    return p;
  }

  /* ---------- score ---------- */
  $('inputs').addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = payload(), st = $('scoreStatus'), btn = $('go');
    st.className = 'status'; st.textContent = '';
    if (!Object.keys(body.counts).length) { st.className = 'status err'; st.textContent = 'Add at least one country with a count above zero.'; return; }
    if (!body.cities.length) { st.className = 'status err'; st.textContent = 'Select at least one candidate city.'; return; }
    btn.disabled = true; btn.textContent = 'Scoring';
    st.appendChild(el('div', 'loadbar')); st.appendChild(document.createTextNode('Querying the graph for every city'));
    $('score').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    try {
      var data = await api('/api/score', body);
      if (!data.results) throw new Error('The server response had no results.');
      state.results = data; st.textContent = '';
      renderBoard(data); renderQueries(data.meta);
    } catch (err) {
      $('boardWrap').hidden = true; st.className = 'status err'; st.textContent = 'Scoring failed. ' + errMsg(err);
    } finally { btn.disabled = false; btn.textContent = 'Score cities'; }
  });

  /* ---------- agent ---------- */
  async function ask(question) {
    var out = $('answer'), btn = $('askBtn'); out.textContent = '';
    question = (question || '').trim(); if (!question) return;
    var body = payload(); body.question = question;
    btn.disabled = true;
    out.appendChild(el('div', 'loadbar')); out.appendChild(el('p', 'muted', 'The agent is querying the graph'));
    try {
      var d = await api('/api/agent', body);
      out.textContent = '';
      out.appendChild(el('div', 'text', d.answer || ''));
      var calls = d.toolCalls || [];
      if (calls.length) {
        var det = el('details'); det.appendChild(el('summary', null, 'Show ' + calls.length + ' graph quer' + (calls.length === 1 ? 'y' : 'ies') + ' behind this answer'));
        calls.forEach(function (c) {
          var q = el('div', 'q'), h = el('div', 'q-head');
          h.appendChild(el('span', null, c.tool || 'tool')); h.appendChild(el('span', 'ms', (c.ms != null ? num(c.ms, 0) : '?') + ' ms'));
          q.appendChild(h);
          if (c.args) q.appendChild(el('pre', null, typeof c.args === 'string' ? c.args : JSON.stringify(c.args, null, 2)));
          if (c.cypher) q.appendChild(el('pre', null, c.cypher));
          det.appendChild(q);
        });
        out.appendChild(det);
      }
    } catch (err) {
      out.textContent = ''; out.appendChild(el('p', 'err', 'The agent could not answer. ' + errMsg(err)));
    } finally { btn.disabled = false; }
  }
  $('askForm').addEventListener('submit', function (e) { e.preventDefault(); ask($('q').value); });
  Array.prototype.forEach.call(document.querySelectorAll('#suggest .chip'), function (c) {
    c.addEventListener('click', function () { $('q').value = c.textContent; ask(c.textContent); });
  });

  /* ---------- proof ---------- */
  function renderQueries(meta) {
    var box = $('queries'); box.textContent = '';
    var qs = (meta && meta.queries) || [];
    if (!qs.length) { box.appendChild(el('p', 'muted', 'No queries reported.')); return; }
    if (meta.totalMs != null) box.appendChild(el('p', 'muted', qs.length + ' queries, ' + num(meta.totalMs, 0) + ' ms total.'));
    qs.forEach(function (q) {
      var d = el('div', 'q'), h = el('div', 'q-head');
      h.appendChild(el('span', null, q.label)); h.appendChild(el('span', 'ms', num(q.ms, 0) + ' ms'));
      d.appendChild(h); d.appendChild(el('pre', null, q.cypher)); box.appendChild(d);
    });
  }
  function renderSources() {
    var ul = $('sources'); ul.textContent = '';
    var s = (state.meta && state.meta.sources) || [];
    if (!s.length) { ul.appendChild(el('li', 'muted', 'No sources listed.')); return; }
    s.forEach(function (x) {
      var li = el('li'), a = el('a', null, x.label);
      if (/^https?:\/\//i.test(x.url || '')) { a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; }
      li.appendChild(a); ul.appendChild(li);
    });
  }

  loadMeta();
})();

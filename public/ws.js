// Organization workspace: a private key kept in this browser. Scores and agent questions are saved
// to the organization's part of the graph (its community, runs and decisions).
(function () {
  var KEY = 'hostable.ws';
  function get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function set(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {} }
  function el(t, c, txt) { var n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; }

  // Attach the workspace to score and agent calls.
  var f = window.fetch.bind(window);
  window.fetch = function (url, opt) {
    var ws = get();
    if (ws && opt && opt.body && /\/api\/(score|agent)$/.test(String(url))) {
      try { var b = JSON.parse(opt.body); b.workspace = { id: ws.id, key: ws.key }; opt = Object.assign({}, opt, { body: JSON.stringify(b) }); } catch (e) {}
    }
    return f(url, opt).then(function (r) { if (/\/api\/score$/.test(String(url))) setTimeout(refresh, 400); return r; });
  };

  var bar = el('div', 'wsbar');
  var grid = document.querySelector('.ws-grid');
  grid.parentNode.insertBefore(bar, grid);

  function post(body) {
    return f('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Failed'); return d; }); });
  }

  function renderNone() {
    bar.textContent = '';
    var t = el('div', 'ws-copy');
    t.appendChild(el('b', null, 'Private workspace'));
    t.appendChild(el('span', 'muted small', ' Keep your community, every run and the agent’s decisions in your organization’s graph.'));
    var form = el('form', 'ws-form');
    var name = el('input'); name.type = 'text'; name.placeholder = 'Organization name'; name.setAttribute('aria-label', 'Organization name');
    var go = el('button', 'ws-btn', 'Create'); go.type = 'submit';
    var msg = el('span', 'muted small');
    form.appendChild(name); form.appendChild(go);
    form.onsubmit = function (e) {
      e.preventDefault(); msg.textContent = 'Creating…';
      post({ action: 'create', name: name.value }).then(function (d) { set(d); refresh(); }).catch(function (er) { msg.textContent = er.message; });
    };
    bar.appendChild(t); bar.appendChild(form); bar.appendChild(msg);
  }

  function renderWs(ws, data) {
    bar.textContent = '';
    var head = el('div', 'ws-copy');
    head.appendChild(el('b', null, ws.name));
    head.appendChild(el('span', 'muted small', ' Private workspace. Key stays in this browser.'));
    var out = el('button', 'ws-link', 'Sign out'); out.type = 'button'; out.onclick = function () { set(null); renderNone(); };
    head.appendChild(out);
    bar.appendChild(head);
    var hist = el('div', 'ws-hist');
    var runs = (data && data.runs) || [], dec = (data && data.decisions) || [];
    if (!runs.length && !dec.length) hist.appendChild(el('span', 'muted small', 'No runs yet. Score cities and they are saved here.'));
    runs.slice(0, 3).forEach(function (r) { hist.appendChild(el('span', 'ws-pill', 'Run: best ' + r.best + ' ' + r.keepsPct + '%')); });
    dec.slice(0, 2).forEach(function (d) { hist.appendChild(el('span', 'ws-pill accent', 'Decided: ' + d.city)); });
    bar.appendChild(hist);
  }

  function refresh() {
    var ws = get();
    if (!ws) return renderNone();
    post({ workspace: { id: ws.id, key: ws.key } }).then(function (d) { renderWs(ws, d); }).catch(function () { set(null); renderNone(); });
  }
  refresh();
})();

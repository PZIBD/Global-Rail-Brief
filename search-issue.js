/* 站内搜索 —— 当期页面版（注入到统一 <script> 内） */
(function () {
  var root = document.getElementById('srch');
  if (!root || root.getAttribute('data-ready')) return;
  root.setAttribute('data-ready', '1');

  var input = root.querySelector('.srch-input');
  var panel = root.querySelector('.srch-panel');
  var clearBtn = root.querySelector('.srch-clear');
  var idx = [], hits = [], sel = -1, marks = [], parents = [], timer = null;

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function low(s) { return clean(s).toLowerCase(); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rxEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function terms(q) { return low(q).split(/\s+/).filter(Boolean).slice(0, 6); }

  /* ---------- 建立索引：条目卡片 + 一句话总览 + 舆情表行 ---------- */
  function buildIndex() {
    idx = [];
    var n = 0, k;
    var cards = document.querySelectorAll('.card[id]');
    for (k = 0; k < cards.length; k++) {
      var c = cards[k];
      var idEl = c.querySelector('.cid');
      var tEl = c.querySelector('.ctitle');
      var regEl = c.querySelector('.frow .fv');
      idx.push({
        el: c, n: n++,
        id: clean(idEl ? idEl.textContent : c.id),
        title: clean(tEl ? tEl.textContent : ''),
        sub: clean(regEl ? regEl.textContent : ''),
        type: '条目',
        raw: clean(c.textContent),
        text: low(c.textContent)
      });
    }
    var ov = document.querySelector('#overview .overview');
    if (ov) {
      idx.push({
        el: ov, n: n++, id: '', title: '一句话总览', sub: '本期摘要', type: '总览',
        raw: clean(ov.textContent), text: low(ov.textContent)
      });
    }
    var rows = document.querySelectorAll('#part07 table tr');
    for (k = 0; k < rows.length; k++) {
      var tr = rows[k];
      if (tr.querySelector('th')) continue;
      var td = tr.querySelectorAll('td');
      if (td.length < 4) continue;
      idx.push({
        el: tr, n: n++,
        id: clean(td[0].textContent),
        title: clean(td[1].textContent) + ' · ' + clean(td[2].textContent),
        sub: clean(td[4] ? td[4].textContent : '') + (td[5] ? ' · ' + clean(td[5].textContent) : ''),
        type: '舆情',
        raw: clean(tr.textContent), text: low(tr.textContent)
      });
    }
  }

  /* ---------- 打分 ---------- */
  function score(it, ts) {
    var i, t;
    for (i = 0; i < ts.length; i++) { if (it.text.indexOf(ts[i]) < 0) return -1; }
    var s = 10, idn = low(it.id), titn = low(it.title);
    for (i = 0; i < ts.length; i++) {
      t = ts[i];
      if (idn && idn === t) s += 140;
      else if (idn && idn.indexOf(t) === 0) s += 70;
      if (titn.indexOf(t) >= 0) s += 40;
    }
    if (it.type === '条目') s += 8;
    return s;
  }

  /* ---------- 片段与高亮文字 ---------- */
  function snippet(raw, ts) {
    var l = raw.toLowerCase(), pos = -1, i, p;
    for (i = 0; i < ts.length; i++) {
      p = l.indexOf(ts[i]);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
    if (pos < 0) pos = 0;
    var st = Math.max(0, pos - 34), en = Math.min(raw.length, pos + 96);
    return (st > 0 ? '…' : '') + raw.slice(st, en) + (en < raw.length ? '…' : '');
  }
  function emph(s, ts) {
    var out = esc(s), i, t;
    for (i = 0; i < ts.length; i++) {
      t = rxEsc(esc(ts[i]));
      if (!t) continue;
      out = out.replace(new RegExp('(' + t + ')', 'gi'), '<em>$1</em>');
    }
    return out;
  }

  /* ---------- 页面内命中词高亮 ---------- */
  function clearMarks() {
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i], p = m.parentNode;
      if (!p) continue;
      p.replaceChild(document.createTextNode(m.textContent), m);
      if (parents.indexOf(p) < 0) parents.push(p);
    }
    marks = [];
    for (var j = 0; j < parents.length; j++) { try { parents[j].normalize(); } catch (e) {} }
    parents = [];
  }
  function highlight(ts) {
    clearMarks();
    if (!ts.length) return;
    var scopes = document.querySelectorAll('.card, #part07 table, #overview');
    var nodes = [], s, w, n;
    for (s = 0; s < scopes.length; s++) {
      w = document.createTreeWalker(scopes[s], NodeFilter.SHOW_TEXT, null, false);
      while ((n = w.nextNode())) {
        var v = n.nodeValue;
        if (!v || !v.trim()) continue;
        var tag = n.parentNode && n.parentNode.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK') continue;
        var lv = v.toLowerCase(), hit = false;
        for (var i = 0; i < ts.length; i++) { if (lv.indexOf(ts[i]) >= 0) { hit = true; break; } }
        if (hit) nodes.push(n);
      }
    }
    for (var q = 0; q < nodes.length && marks.length < 400; q++) {
      var node = nodes[q], rest = node.nodeValue, frag = document.createDocumentFragment(), guard = 0;
      while (guard++ < 60) {
        var l2 = rest.toLowerCase(), best = -1, bl = 0;
        for (var t2 = 0; t2 < ts.length; t2++) {
          var pp = l2.indexOf(ts[t2]);
          if (pp >= 0 && (best < 0 || pp < best)) { best = pp; bl = ts[t2].length; }
        }
        if (best < 0) { frag.appendChild(document.createTextNode(rest)); break; }
        if (best > 0) frag.appendChild(document.createTextNode(rest.slice(0, best)));
        var mk = document.createElement('mark');
        mk.className = 'srch-mark';
        mk.textContent = rest.substr(best, bl);
        frag.appendChild(mk);
        marks.push(mk);
        rest = rest.slice(best + bl);
        if (!rest) break;
      }
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    }
  }

  /* ---------- 定位到结果 ---------- */
  function go(it) {
    if (!it || !it.el) return;
    var p = it.el;
    while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
    root.classList.remove('on');
    var el = it.el;
    requestAnimationFrame(function () {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('srch-flash');
      void el.offsetWidth;
      el.classList.add('srch-flash');
      setTimeout(function () { el.classList.remove('srch-flash'); }, 1900);
    });
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var q = input.value, ts = terms(q);
    hits = []; sel = -1;
    panel.innerHTML = '';
    if (!ts.length) { root.classList.remove('on'); clearMarks(); return; }

    for (var i = 0; i < idx.length; i++) {
      var s = score(idx[i], ts);
      if (s >= 0) hits.push({ it: idx[i], s: s });
    }
    hits.sort(function (a, b) { return b.s - a.s || a.it.n - b.it.n; });
    root.classList.add('on');

    if (!hits.length) {
      panel.innerHTML = '<div class="srch-empty">未找到与「' + esc(q) + '」相关的内容。<br>可尝试国家名、企业名或条目编号，如 <b>越南</b>、<b>中车</b>、<b>CT-44</b>。</div>';
      panel.classList.add('has');
      highlight(ts);
      return;
    }
    var top = hits.slice(0, 40), html = '';
    html += '<div class="srch-sum">共 ' + hits.length + ' 条命中' + (hits.length > 40 ? '（显示前 40 条）' : '') + ' · ↑↓ 选择 · Enter 定位 · Esc 关闭</div>';
    for (var k = 0; k < top.length; k++) {
      var it = top[k].it;
      html += '<a class="srch-item' + (k === 0 ? ' cur' : '') + '" href="javascript:void(0)" data-ix="' + k + '">' +
        '<div class="srch-meta"><span class="srch-tag">' + it.type + '</span>' +
        (it.id ? '<span class="srch-id">' + esc(it.id) + '</span>' : '') +
        (it.sub ? '<span class="srch-sub">' + esc(it.sub.slice(0, 34)) + '</span>' : '') + '</div>' +
        '<div class="srch-tit">' + emph(it.title, ts) + '</div>' +
        '<div class="srch-snip">' + emph(snippet(it.raw, ts), ts) + '</div></a>';
    }
    panel.innerHTML = html;
    panel.classList.add('has');
    sel = 0;
    highlight(ts);
  }

  /* ---------- 事件 ---------- */
  function setCur(i) {
    var items = panel.querySelectorAll('.srch-item');
    if (!items.length) return;
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    for (var k = 0; k < items.length; k++) items[k].classList.remove('cur');
    items[i].classList.add('cur');
    sel = i;
    items[i].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', function () {
    clearTimeout(timer);
    root.classList.toggle('on', !!input.value.trim());
    timer = setTimeout(render, 140);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(sel - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var cur = panel.querySelector('.srch-item.cur');
      if (cur) {
        var ix = parseInt(cur.getAttribute('data-ix'), 10);
        go(hits[ix].it);
      }
    } else if (e.key === 'Escape') {
      input.value = ''; root.classList.remove('on'); clearMarks(); input.blur();
    }
  });

  panel.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.srch-item');
    if (!a) return;
    e.preventDefault();
    var ix = parseInt(a.getAttribute('data-ix'), 10);
    if (hits[ix]) go(hits[ix].it);
  });

  clearBtn.addEventListener('click', function () {
    input.value = '';
    root.classList.remove('on');
    clearMarks();
    input.focus();
  });

  document.addEventListener('click', function (e) {
    if (!root.contains(e.target)) root.classList.remove('on');
  });

  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); input.focus(); input.select();
    } else if (e.key === '/' && !typing) {
      e.preventDefault(); input.focus();
    }
  });

  buildIndex();
})();

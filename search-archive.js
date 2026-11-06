/* 站内搜索 —— 往期归档页版（期次筛选 + 跳转检索汇总页） */
(function () {
  var root = document.getElementById('srch');
  if (!root || root.getAttribute('data-ready')) return;
  root.setAttribute('data-ready', '1');

  var input = root.querySelector('.srch-input');
  var panel = root.querySelector('.srch-panel');
  var clearBtn = root.querySelector('.srch-clear');
  var stat = root.querySelector('.srch-stat');

  var metas = [], entries = [], hits = [], sel = -1, timer = null;
  var loading = false, loaded = false, done = 0, failed = 0;
  var PREVIEW_N = 8;

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function low(s) { return clean(s).toLowerCase(); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function rxEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function terms(q) { return low(q).split(/\s+/).filter(Boolean).slice(0, 6); }
  function allMatch(hay, ts) {
    for (var i = 0; i < ts.length; i++) { if (hay.indexOf(ts[i]) < 0) return false; }
    return true;
  }
  function sumUrl(q, anchor) {
    return 'search.html?q=' + encodeURIComponent(q) + (anchor ? '#' + encodeURIComponent(anchor) : '');
  }

  /* ---------- 归档卡片元数据 ---------- */
  function readMetas() {
    metas = [];
    var cards = document.querySelectorAll('.wrap .card');
    for (var i = 0; i < cards.length; i++) {
      var a = cards[i];
      var no = a.querySelector('.no'), dt = a.querySelector('.dt');
      var h = a.querySelector('h2'), p = a.querySelector('p');
      metas.push({
        el: a,
        href: a.getAttribute('href') || '',
        no: clean(no ? no.textContent : ''),
        date: clean(dt ? dt.textContent : ''),
        title: clean(h ? h.textContent : ''),
        sum: clean(p ? p.textContent : '')
      });
    }
  }

  /* ---------- 跨期索引（用于预览摘要与计数） ---------- */
  function titleOf(el) {
    var t = el.querySelector('.ctitle');
    if (t) return clean(t.textContent);
    var trs = el.querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) {
      var th = trs[i].querySelector('th');
      if (th && /项目|资讯|标题|事件/.test(th.textContent)) {
        var td = trs[i].querySelector('td');
        if (td && clean(td.textContent)) return clean(td.textContent);
      }
    }
    var h = el.querySelector('h3, h4');
    if (h) return clean(h.textContent);
    return clean(el.textContent).slice(0, 46);
  }
  function anchorOf(el) {
    var p = el;
    while (p && p.nodeType === 1 && p.tagName !== 'BODY') {
      if (p.id) return p.id;
      p = p.parentElement;
    }
    return '';
  }
  function parseIssue(meta, html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var out = [], i, seen = {};
    var nodes = doc.querySelectorAll('.card[id], .rd-card, .item');
    for (i = 0; i < nodes.length; i++) {
      var eln = nodes[i];
      var raw = clean(eln.textContent);
      if (raw.length < 24) continue;
      var idEl = eln.querySelector('.cid, .rd-id');
      var id = clean(idEl ? idEl.textContent : '');
      var h3 = eln.querySelector('h3');
      var title = titleOf(eln);
      var key = (meta.no || '') + '|' + (id || title.slice(0, 30));
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({
        issue: meta.no, date: meta.date,
        id: id,
        title: title, text: low(raw), raw: raw
      });
    }
    for (i = 0; i < out.length; i++) entries.push(out[i]);
  }
  function indexFromJson(idx) {
    var its = idx && idx.items, i;
    if (!its || !its.length) return false;
    var seen = {};
    for (i = 0; i < its.length; i++) {
      var it = its[i];
      var raw = it.su || it.ti || '';
      var hay = low([it.no, it.d, it.id, it.p, it.reg, it.st, it.ti, it.su, it.pa, it.kw, it.pg, it.cp, it.s1, it.s2, it.cf].join(' '));
      var k = (it.no || '') + '|' + (it.id || low(it.ti).slice(0, 30));
      if (seen[k]) continue;
      seen[k] = 1;
      entries.push({
        issue: it.no, date: it.d, id: it.id || '',
        title: it.ti || raw.slice(0, 40),
        text: hay, raw: raw
      });
    }
    return entries.length > 0;
  }
  function loadIndex() {
    if (loading || loaded) return;
    loading = true; done = 0; failed = 0;
    fetch('search-index.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('no index');
      return r.json();
    }).then(function (idx) {
      if (!indexFromJson(idx)) throw new Error('empty index');
      loading = false; loaded = true; render();
    }).catch(function () {
      done = 0; failed = 0;
      renderStatus('正在载入往期全文… 0/' + metas.length);
      metas.forEach(function (m) {
        fetch(m.href, { cache: 'force-cache' })
          .then(function (r) { return r.text(); })
          .then(function (html) { parseIssue(m, html); })
          .catch(function () { failed++; })
          .then(function () {
            done++;
            if (done >= metas.length) { loading = false; loaded = true; render(); }
            else renderStatus('正在载入往期全文… ' + done + '/' + metas.length);
          });
      });
    });
  }

  /* ---------- 渲染 ---------- */
  function renderStatus(s) { if (stat) stat.textContent = s; }

  function snippet(raw, ts) {
    var l = raw.toLowerCase(), pos = -1, i, p;
    for (i = 0; i < ts.length; i++) {
      p = l.indexOf(ts[i]);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
    if (pos < 0) pos = 0;
    var st = Math.max(0, pos - 30), en = Math.min(raw.length, pos + 92);
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

  function render() {
    var q = input.value, ts = terms(q);
    hits = []; sel = -1;
    var i;
    if (loaded) {
      for (i = 0; i < entries.length; i++) {
        if (allMatch(entries[i].text, ts)) hits.push(entries[i]);
      }
    }

    if (!ts.length) {
      for (i = 0; i < metas.length; i++) metas[i].el.style.display = '';
      root.classList.remove('on');
      panel.innerHTML = ''; panel.classList.remove('has');
      renderStatus('');
      return;
    }

    var shown = 0;
    for (i = 0; i < metas.length; i++) {
      var m = metas[i], ok = allMatch(low(m.no + ' ' + m.date + ' ' + m.title + ' ' + m.sum), ts);
      m.el.style.display = ok ? '' : 'none';
      if (ok) shown++;
    }

    root.classList.add('on');
    var html = '';

    if (!loaded) {
      html = '<a class="srch-open" href="' + esc(sumUrl(q)) + '">打开汇总页「' + esc(q) + '」 →</a>' +
        '<div class="srch-sum">正在载入往期全文，稍候即可看到条目命中数…</div>';
    } else if (!hits.length) {
      html = '<div class="srch-empty">往期条目中未找到与「' + esc(q) + '」匹配的内容。</div>';
    } else {
      html = '<a class="srch-open" href="' + esc(sumUrl(q)) + '">打开汇总页：「' + esc(q) + '」共 ' + hits.length +
        ' 条命中，一页看完 →</a>' +
        '<div class="srch-sum">期次命中 ' + shown + '/' + metas.length + ' 期 · 条目命中 ' + hits.length +
        ' 条 · Enter 打开汇总页 · 下方为预览（前 ' + PREVIEW_N + ' 条）</div>';
      var top = hits.slice(0, PREVIEW_N);
      for (var k = 0; k < top.length; k++) {
        var e = top[k];
        html += '<a class="srch-item' + (k === 0 ? ' cur' : '') + '" href="' + esc(sumUrl(q, e.id)) + '" data-ix="' + k + '">' +
          '<div class="srch-meta"><span class="srch-issue">' + esc(e.issue || '往期') + '</span>' +
          '<span class="srch-date">' + esc(e.date) + '</span>' +
          (e.id ? '<span class="srch-id">' + esc(e.id) + '</span>' : '') + '</div>' +
          '<div class="srch-tit">' + emph(e.title, ts) + '</div>' +
          '<div class="srch-snip">' + emph(snippet(e.raw, ts), ts) + '</div></a>';
      }
    }
    panel.innerHTML = html;
    panel.classList.add('has');
    sel = hits.length ? 0 : -1;

    renderStatus('期次命中 ' + shown + '/' + metas.length + ' 期 · 条目命中 ' + (loaded ? hits.length : '…') + ' 条 · Enter 打开汇总页' + (failed ? '（' + failed + ' 期未能载入）' : ''));
  }

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
    timer = setTimeout(function () {
      var ts = terms(input.value);
      if (ts.length && !loaded && !loading) loadIndex();
      render();
    }, 220);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(sel - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var cur = panel.querySelector('.srch-item.cur');
      window.location.href = cur ? cur.getAttribute('href') : sumUrl(input.value);
    } else if (e.key === 'Escape') {
      input.value = ''; root.classList.remove('on'); render();
    }
  });

  panel.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.srch-item, .srch-open');
    if (!a) return;
    e.preventDefault();
    window.location.href = a.getAttribute('href');
  });

  clearBtn.addEventListener('click', function () {
    input.value = '';
    root.classList.remove('on');
    render();
    input.focus();
  });

  document.addEventListener('click', function (e) {
    if (!root.contains(e.target)) root.classList.remove('on');
  });

  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); input.focus(); input.select();
    } else if (e.key === '/' && !typing) {
      e.preventDefault(); input.focus();
    }
  });

  readMetas();
})();

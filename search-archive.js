/* 站内搜索 —— 往期归档页版（含跨期全文检索） */
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

  /* ---------- 跨期索引 ---------- */
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
    var out = [], i;
    var nodes = doc.querySelectorAll('.card[id], .rd-card');
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var txt = clean(el.textContent);
      if (txt.length < 24) continue;
      var idEl = el.querySelector('.cid, .rd-id');
      out.push({
        issue: meta.no, date: meta.date,
        id: clean(idEl ? idEl.textContent : ''),
        title: titleOf(el),
        text: low(txt), raw: txt,
        href: meta.href + (anchorOf(el) ? '#' + encodeURIComponent(anchorOf(el)) : '')
      });
    }
    if (!out.length) {
      var items = doc.querySelectorAll('.item');
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        var h3 = it.querySelector('h3');
        var d = it.querySelector('.d, p');
        var t2 = clean(d ? d.textContent : it.textContent);
        if (t2.length < 24) continue;
        out.push({
          issue: meta.no, date: meta.date, id: '',
          title: clean(h3 ? h3.textContent : '') || t2.slice(0, 40),
          text: low(t2), raw: t2,
          href: meta.href + (anchorOf(it) ? '#' + encodeURIComponent(anchorOf(it)) : '')
        });
      }
    }
    if (!out.length) {
      var body = clean(doc.body ? doc.body.textContent : '');
      if (body.length > 40) {
        out.push({
          issue: meta.no, date: meta.date, id: '', title: meta.title,
          text: low(body), raw: body.slice(0, 6000), href: meta.href
        });
      }
    }
    for (i = 0; i < out.length; i++) { out[i].d = out[i].date; entries.push(out[i]); }
  }
  function loadIndex() {
    if (loading || loaded) return;
    loading = true; done = 0; failed = 0;
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

    for (i = 0; i < entries.length; i++) {
      if (allMatch(entries[i].text, ts)) hits.push(entries[i]);
    }

    root.classList.add('on');
    var head = '';
    if (!loaded) {
      head = '<div class="srch-empty">正在载入往期全文，稍候即可跨期检索条目…</div>';
    } else if (!hits.length) {
      head = '<div class="srch-empty">往期条目中未找到与「' + esc(q) + '」匹配的内容。</div>';
    } else {
      head = '<div class="srch-sum">往期条目命中 ' + hits.length + ' 条' + (hits.length > 60 ? '（显示前 60 条）' : '') + ' · 点击跳转到该期 · Esc 关闭</div>';
    }

    var html = head, top = hits.slice(0, 60);
    for (var k = 0; k < top.length; k++) {
      var e = top[k];
      html += '<a class="srch-item' + (k === 0 ? ' cur' : '') + '" href="' + esc(e.href) + '" data-ix="' + k + '">' +
        '<div class="srch-meta"><span class="srch-issue">' + esc(e.issue || '往期') + '</span>' +
        '<span class="srch-date">' + esc(e.date) + '</span>' +
        (e.id ? '<span class="srch-id">' + esc(e.id) + '</span>' : '') + '</div>' +
        '<div class="srch-tit">' + emph(e.title, ts) + '</div>' +
        '<div class="srch-snip">' + emph(snippet(e.raw, ts), ts) + '</div></a>';
    }
    panel.innerHTML = html;
    panel.classList.add('has');
    sel = hits.length ? 0 : -1;

    renderStatus('期次命中 ' + shown + '/' + metas.length + ' 期 · 条目命中 ' + (loaded ? hits.length : '…') + ' 条' + (failed ? '（' + failed + ' 期未能载入）' : ''));
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
      var cur = panel.querySelector('.srch-item.cur');
      if (cur) { e.preventDefault(); window.location.href = cur.getAttribute('href'); }
    } else if (e.key === 'Escape') {
      input.value = ''; root.classList.remove('on'); render();
    }
  });

  panel.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.srch-item');
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

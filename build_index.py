# -*- coding: utf-8 -*-
"""把往期各期 HTML 抽成一份检索索引 search-index.json（供汇总检索页秒开）。

用法：
  python build_index.py [目录] [输出文件]
  # 默认扫 .tmp-issues/issue-*.html，输出 mirror/search-index.json

兼容三代版式：
  A 新版 11-05 起：div.card[id] > chead(cid/ccat/ctitle/cbadge) + cbody > div.frow(span.fl + span.fv)
  B 11-04       ：div.rd-card > rd-card-head + table.rd-itab 的 tr(th/td)
  C 10-26~11-03 ：div.item > h3 + div.d + div.src，按 section.section 分区
"""
import glob
import io
import json
import os
import re
import sys
from html import unescape

TAG_RE = re.compile(r'<[^>]+>')
PNID_RE = re.compile(r'<!--/?pnid:[^>]*?-->')


def txt(s):
    if not s:
        return ''
    s = PNID_RE.sub('', s)
    s = re.sub(r'<br\s*/?>', ' ', s, flags=re.I)
    s = TAG_RE.sub('', s)
    return re.sub(r'\s+', ' ', unescape(s)).strip()


def first_href(block):
    m = re.search(r'<a\s[^>]*href="([^"]+)"', block, re.I)
    if not m:
        return ''
    u = unescape(m.group(1)).strip()
    if not u or u.startswith('#') or u.endswith('.md'):
        return ''
    return u


def clean_part(s):
    s = txt(s)
    s = re.sub(r'^PART\s*\d*\s*[·:：]?\s*', '', s)
    s = re.sub(r'[（(][^）)]*(?:条|新增|结转)[^）)]*[)）]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def cut_part(h, pos):
    """取 pos 之前最近的分区标题（details.part 的 summary h2 或 section 的 h2）。"""
    head = h[:pos]
    best = ''
    for m in re.finditer(r'<summary[^>]*>.*?<h2[^>]*>(.*?)</h2>', head, re.S):
        best = clean_part(m.group(1))
    if best:
        return best
    for m in re.finditer(r'<(?:details|section)[^>]*class="(?:part|section)[^"]*"[^>]*>.*?<h2[^>]*>(.*?)</h2>', head, re.S):
        best = clean_part(m.group(1))
    return best


# ---------------- A 版（12 行卡片） ----------------
ROW_A = re.compile(
    r'<div class="frow[^"]*"[^>]*>\s*<span class="fl"[^>]*>(.*?)</span>\s*<span class="fv"[^>]*>(.*?)</span>\s*</div>',
    re.S)


def parse_a(h, meta, out):
    starts = [m.start() for m in re.finditer(r'<div class="card[^"]*"\s+id="', h)]
    if not starts:
        return 0
    n = 0
    for i, st in enumerate(starts):
        en = starts[i + 1] if i + 1 < len(starts) else h.find('</details>', st)
        if en < 0:
            en = len(h)
        blk = h[st:en]
        idm = re.search(r'<div class="card[^"]*"\s+id="([^"]+)"', blk)
        cid = idm.group(1) if idm else ''
        fields = {}
        for m in ROW_A.finditer(blk):
            k = txt(m.group(1))
            v = m.group(2)
            if k and k not in fields:
                fields[k] = v
        if '内容' not in fields and '资讯' not in fields:
            continue
        out.append({
            'no': meta['no'], 'd': meta['date'], 'href': meta['href'],
            'id': cid,
            'p': cut_part(h, st),
            'reg': txt(fields.get('区域/国家/城市', '')),
            'st': txt(fields.get('阶段', '')),
            'ti': txt(fields.get('资讯', '')),
            'su': txt(fields.get('内容', '')),
            'pa': txt(fields.get('相关方', '')),
            'kw': txt(fields.get('关键词', '')),
            'pg': txt(fields.get('进度/时间', '')),
            'cp': txt(fields.get('竞品/交叉', '')),
            's1': txt(fields.get('主源', '')),
            's2': txt(fields.get('佐证源', '')),
            'cf': txt(fields.get('置信度', '')),
            'u': first_href(fields.get('主源', '')) or first_href(blk),
        })
        n += 1
    return n


# ---------------- B 版（rd-card + rd-itab） ----------------
ROW_B = re.compile(r'<tr>\s*<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>\s*</tr>', re.S)


def parse_b(h, meta, out):
    starts = [m.start() for m in re.finditer(r'<div class="rd-card">', h)]
    if not starts:
        return 0
    n = 0
    for i, st in enumerate(starts):
        en = starts[i + 1] if i + 1 < len(starts) else st + 6000
        blk = h[st:en]
        fields = {}
        for m in ROW_B.finditer(blk):
            k = txt(m.group(1))
            if k and k not in fields:
                fields[k] = m.group(2)
        if '项目' not in fields:
            continue
        reg = txt(fields.get('区域/国家/城市', ''))
        out.append({
            'no': meta['no'], 'd': meta['date'], 'href': meta['href'],
            'id': txt(re.search(r'class="rd-id"[^>]*>(.*?)</span>', blk, re.S).group(1)) if 'rd-id' in blk else '',
            'p': (reg.split('/')[0].strip() if reg else cut_part(h, st)),
            'reg': reg,
            'st': txt(fields.get('阶段', '')),
            'ti': txt(fields.get('项目', '')),
            'su': txt(fields.get('相关方', '')) or txt(fields.get('项目', '')),
            'pa': txt(fields.get('相关方', '')),
            'kw': txt(fields.get('类型', '')),
            'pg': txt(fields.get('进度/时间', '')),
            'cp': txt(fields.get('竞品/交叉', '')),
            's1': txt(fields.get('主源', '')),
            's2': txt(fields.get('佐证源', '')),
            'cf': txt(fields.get('置信度', '')),
            'u': first_href(blk),
        })
        n += 1
    return n


# ---------------- C 版（item 段落） ----------------
ITEM_C = re.compile(r'<div class="item">(.*?)</div>\s*(?=<div class="item">|</section>|</main>|$)', re.S)


def parse_c(h, meta, out):
    n = 0
    for m in ITEM_C.finditer(h):
        blk = m.group(1)
        tm = re.search(r'<h3[^>]*>(.*?)</h3>', blk, re.S)
        dm = re.search(r'<div class="d"[^>]*>(.*?)</div>', blk, re.S)
        if not tm or not dm:
            continue
        sm = re.search(r'<div class="src"[^>]*>(.*?)</div>', blk, re.S)
        src_txt = txt(sm.group(1)) if sm else ''
        src_txt = re.sub(r'^🔗\s*(来源[:：])?\s*', '', src_txt).strip()
        out.append({
            'no': meta['no'], 'd': meta['date'], 'href': meta['href'],
            'id': '', 'p': cut_part(h, m.start()),
            'reg': '', 'st': '', 'ti': txt(tm.group(1)), 'su': txt(dm.group(1)),
            'pa': '', 'kw': '', 'pg': '', 'cp': '',
            's1': src_txt, 's2': '', 'cf': '', 'u': first_href(blk),
        })
        n += 1
    return n


def read_meta(h, fname):
    no = ''
    m = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
    if m:
        t = txt(m.group(1))
        mm = re.search(r'第\s*\d+\s*期', t)
        no = mm.group(0).replace(' ', '') if mm else ''
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})', fname)
    date = m.group(0) if m else ''
    if not no and date:
        import datetime
        d0 = datetime.date(2026, 10, 26)
        d1 = datetime.date(*[int(x) for x in date.split('-')])
        no = '第%d期' % ((d1 - d0).days + 1)
    return {'no': no, 'date': date, 'href': 'issue-%s.html' % date}


# 区域推断：仅用于早期版式（无结构化区域字段）的条目，按国家/城市关键词反查
REGION_MAP = {
    '东南亚': '越南 河内 胡志明 菲律宾 马尼拉 泰国 曼谷 中泰铁路 马来西亚 吉隆坡 印尼 印度尼西亚 雅万 雅加达 新加坡 柬埔寨 金边 老挝 万象 中老铁路 缅甸 仰光 文莱',
    '南亚·大洋洲': '孟加拉 达卡 印度 孟买 新德里 钦奈 班加罗尔 巴基斯坦 拉合尔 卡拉奇 斯里兰卡 科伦坡 尼泊尔 加德满都 马尔代夫 澳大利亚 悉尼 墨尔本 珀斯 新西兰 奥克兰',
    '中东·独联体': '沙特 利雅得 吉达 阿联酋 迪拜 阿布扎比 阿曼 马斯喀特 卡塔尔 多哈 科威特 巴林 伊朗 德黑兰 伊拉克 巴格达 土耳其 伊斯坦布尔 安卡拉 哈萨克斯坦 阿斯塔纳 乌兹别克 塔什干 阿塞拜疆 巴库 格鲁吉亚 第比利斯 亚美尼亚 俄罗斯 莫斯科 吉尔吉斯 中吉乌 蒙古 乌兰巴托 以色列 特拉维夫',
    '拉美': '巴西 圣保罗 智利 圣地亚哥 秘鲁 利马 墨西哥 阿根廷 布宜诺斯艾利斯 哥伦比亚 波哥大 委内瑞拉 加拉加斯 厄瓜多尔 基多 玻利维亚 巴拿马 古巴 多米尼加 乌拉圭 巴拉圭',
    '非洲': '埃及 开罗 阿尔及利亚 阿尔及尔 摩洛哥 卡萨布兰卡 埃塞俄比亚 亚的斯亚贝巴 亚吉铁路 肯尼亚 内罗毕 蒙内 坦桑尼亚 达累斯萨拉姆 尼日利亚 拉各斯 阿布贾 安哥拉 罗安达 南非 约翰内斯堡 加纳 阿克拉 科特迪瓦 塞内加尔 达喀尔 赞比亚 刚果 吉布提 苏丹 突尼斯 利比亚 几内亚 乌干达 喀麦隆 莫桑比克 津巴布韦',
}
REGION_KEYS = sorted(
    [(k.strip(), r) for r, ks in REGION_MAP.items() for k in ks.split(' ') if k.strip()],
    key=lambda x: -len(x[0]))
CAT_WORDS = ('中标', '签约', '交付', '企业', '政策', '招标', '趋势', '数据', '简评', '舆情', '总览')


def infer_region(text):
    for k, r in REGION_KEYS:
        if k in text:
            return r, k
    return '', ''


def dedupe(items):
    seen, out = {}, []
    for it in items:
        k = it.get('no') + '|' + (it.get('id') or txt(it.get('ti'))[:40])
        if k in seen:
            a = seen[k]
            for k2, v2 in it.items():
                if v2 and not a.get(k2):
                    a[k2] = v2
            continue
        seen[k] = it
        out.append(it)
    return out


def enrich(items):
    for it in items:
        if it.get('p') and not any(w in it['p'] for w in CAT_WORDS):
            continue
        blob = ' '.join([it.get('ti', ''), it.get('su', ''), it.get('pa', '')])
        r, c = infer_region(blob)
        if r:
            it['p'] = r
            if not it.get('reg'):
                it['reg'] = r
        elif it.get('p') and any(w in it['p'] for w in CAT_WORDS):
            it['p'] = '其他'


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '.tmp-issues'
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join('mirror', 'search-index.json')
    files = sorted(glob.glob(os.path.join(root, 'issue-*.html')))
    if not files:
        raise SystemExit('没找到 issue-*.html：%s' % root)
    issues, items = [], []
    for f in files:
        with io.open(f, encoding='utf-8') as fh:
            h = fh.read()
        meta = read_meta(h, os.path.basename(f))
        before = len(items)
        gen = 'A'
        if not parse_a(h, meta, items):
            gen = 'B'
            if not parse_b(h, meta, items):
                gen = 'C'
                parse_c(h, meta, items)
        issues.append({'no': meta['no'], 'date': meta['date'], 'href': meta['href'], 'n': len(items) - before})
        print('%-24s %-8s %2d 条  版式%s' % (meta['href'], meta['no'], len(items) - before, gen))
    issues.sort(key=lambda x: x['date'], reverse=True)
    items = dedupe(items)
    enrich(items)
    data = {'generated': issues[0]['date'] if issues else '', 'issues': issues, 'items': items}
    with io.open(dst, 'w', encoding='utf-8', newline='') as fh:
        fh.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print('\n共 %d 期 / %d 条 → %s (%.1f KB)' % (len(issues), len(items), dst, os.path.getsize(dst) / 1024.0))


if __name__ == '__main__':
    main()

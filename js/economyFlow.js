/**
 * economyFlow.js — Tab Economy: sơ đồ Source → Pool → Sink dòng tiền (Sankey).
 *
 * Xem theo toàn game / scene / batch. Node = HTML (icon + số), ribbon = SVG (dày ∝ flow).
 * Phụ thuộc: EconomyModel, window.GameData, ProcessedData.global.energyMap, TableUtils.
 */
const EconomyFlow = (() => {

    const { $, setText, fillSelect } = TableUtils;
    const { SOURCES, POOLS, SINKS } = EconomyModel;

    const W = 1000, NW = 200, NWP = 168;
    const xSrcR = NW, xPoolL = (W - NWP) / 2, xPoolR = (W - NWP) / 2 + NWP, xSinkL = W - NW;

    let _gd = null, _energyMap = null;

    const fmt = v => {
        const a = Math.abs(v);
        return a >= 1000 ? Math.round(v).toLocaleString() : a >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
    };

    // ── Layout ──────────────────────────────────────────────────────────────────

    const NH = 46, ROWGAP = 16, PADV = 16, SEG_GAP = 2, RIB_FILL = 0.58;

    function buildNodes(model) {
        const poolMax = {};
        model.balances.forEach(b => { poolMax[b.currency] = Math.max(b.in, b.out); });

        const srcVal = {}, sinkVal = {};
        model.links.forEach(l => {
            if (SOURCES[l.from]) srcVal[l.from] = (srcVal[l.from] || 0) + l.value;
            if (SINKS[l.to])     sinkVal[l.to] = (sinkVal[l.to] || 0) + l.value;
        });

        const mk = (id, reg, value, kind) => ({ id, kind, value, label: reg[id].label, icon: reg[id].icon, color: reg[id].color });
        const poolNodes = Object.keys(POOLS).filter(id => poolMax[id] > 0).map(id => mk(id, POOLS, poolMax[id], 'pool'));
        const poolIdx = {};
        poolNodes.forEach((n, i) => { poolIdx[n.id] = i; });

        // sắp xếp source/sink theo barycenter cột pool → giảm dây chéo
        const bary = (id, sideOf) => {
            let w = 0, s = 0;
            model.links.forEach(l => {
                const other = sideOf === 'src' ? (l.from === id ? l.to : null) : (l.to === id ? l.from : null);
                if (other != null && poolIdx[other] != null) { w += l.value; s += l.value * poolIdx[other]; }
            });
            return w ? s / w : 0;
        };
        const srcNodes = Object.keys(SOURCES).filter(id => srcVal[id] > 0)
            .map(id => mk(id, SOURCES, srcVal[id], 'src')).sort((a, b) => bary(a.id, 'src') - bary(b.id, 'src'));
        const sinkNodes = Object.keys(SINKS).filter(id => sinkVal[id] > 0)
            .map(id => mk(id, SINKS, sinkVal[id], 'sink')).sort((a, b) => bary(a.id, 'sink') - bary(b.id, 'sink'));
        return { srcNodes, poolNodes, sinkNodes };
    }

    // ── Ribbon path ───────────────────────────────────────────────────────────

    function ribbon(x0, y0t, y0b, x1, y1t, y1b) {
        const xm = (x0 + x1) / 2;
        return `M${x0},${y0t} C${xm},${y0t} ${xm},${y1t} ${x1},${y1t} `
             + `L${x1},${y1b} C${xm},${y1b} ${xm},${y0b} ${x0},${y0b} Z`;
    }

    function nodeHtml(n, x, w) {
        const accent = n.color || (n.kind === 'src' ? '#34d399' : '#f87171');
        return `<div class="eco-node eco-node-${n.kind}" data-id="${n.id}"
                style="left:${x}px;top:${n.y}px;width:${w}px;height:${n.h}px;--accent:${accent}">
            <span class="eco-node-ic">${n.icon}</span>
            <span class="eco-node-lb">${n.label}</span>
            <span class="eco-node-val mono">${fmt(n.value)}</span>
        </div>`;
    }

    // ── Tooltip (mô tả + breakdown dòng vào/ra) ──────────────────────────────────

    const reg = id => SOURCES[id] || POOLS[id] || SINKS[id];
    const curColor = c => (POOLS[c] && POOLS[c].color) || '#94a3b8';
    let _tip = null;

    function ensureTip() {
        if (!_tip) {
            _tip = document.createElement('div');
            _tip.className = 'eco-tooltip';
            document.body.appendChild(_tip);
        }
        return _tip;
    }

    function tipHtml(id, model) {
        const r = reg(id);
        if (!r) return '';
        const ins = model.links.filter(l => l.to === id);
        const outs = model.links.filter(l => l.from === id);
        const row = (lbl, val, cur, sign, cls) =>
            `<div class="eco-tt-row"><span>${sign} <span>${lbl}</span></span>`
            + `<span class="mono">${fmt(val)} <b style="color:${curColor(cur)}">${cur}</b></span></div>`;
        let h = `<div class="eco-tt-head">${r.icon} <span>${r.label}</span></div>`;
        if (r.desc) h += `<div class="eco-tt-desc">${r.desc}</div>`;
        if (ins.length) h += `<div class="eco-tt-sec">Vào</div>` + ins.map(l => row(reg(l.from).label, l.value, l.currency, '▲', 'pos')).join('');
        if (outs.length) h += `<div class="eco-tt-sec">Ra</div>` + outs.map(l => row(reg(l.to).label, l.value, l.currency, '▼', 'neg')).join('');
        return h;
    }

    function moveTip(e) {
        if (!_tip) return;
        const w = _tip.offsetWidth, h = _tip.offsetHeight;
        let x = e.clientX + 16, y = e.clientY + 16;
        if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
        if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
        _tip.style.left = Math.max(8, x) + 'px';
        _tip.style.top = Math.max(8, y) + 'px';
    }

    function highlight(host, id) {
        host.querySelectorAll('.eco-rib').forEach(p => {
            const on = p.dataset.a === id || p.dataset.b === id;
            p.classList.toggle('eco-rib-hl', on);
            p.classList.toggle('eco-rib-dim', !on);
        });
        host.querySelectorAll('.eco-node').forEach(n => n.classList.toggle('eco-node-dim', n.dataset.id !== id));
    }
    function clearHighlight(host) {
        host.querySelectorAll('.eco-rib').forEach(p => p.classList.remove('eco-rib-hl', 'eco-rib-dim'));
        host.querySelectorAll('.eco-node').forEach(n => n.classList.remove('eco-node-dim'));
    }

    function bindTooltips(host, model) {
        host.querySelectorAll('.eco-node').forEach(el => {
            el.addEventListener('mouseenter', e => {
                const t = ensureTip();
                t.innerHTML = tipHtml(el.dataset.id, model);
                t.style.display = 'block';
                moveTip(e);
                highlight(host, el.dataset.id);
            });
            el.addEventListener('mousemove', moveTip);
            el.addEventListener('mouseleave', () => { if (_tip) _tip.style.display = 'none'; clearHighlight(host); });
        });
    }

    // ── Render diagram ──────────────────────────────────────────────────────────

    function renderSankey(model) {
        const host = $('eco-sankey');
        if (!host) return;
        const { srcNodes, poolNodes, sinkNodes } = buildNodes(model);

        if (!srcNodes.length && !poolNodes.length) {
            host.innerHTML = `<div class="eco-empty">Không có dòng tiền nào trong phạm vi này.</div>`;
            return;
        }

        // Node đều nhau: cùng chiều cao NH, mỗi cột canh giữa theo chiều dọc.
        const cols = [srcNodes, poolNodes, sinkNodes];
        const colH = ns => ns.length * NH + (ns.length - 1) * ROWGAP;
        const H = Math.max(...cols.map(colH), 120) + PADV * 2;
        cols.forEach(ns => {
            let y = PADV + (H - PADV * 2 - colH(ns)) / 2;
            ns.forEach(n => { n.h = NH; n.y = y; y += NH + ROWGAP; });
        });

        // Mỗi mép node được "đóng gói" đầy: segment ∝ tỉ trọng link → dây thon (taper) gọn.
        const byId = {};
        [...srcNodes, ...poolNodes, ...sinkNodes].forEach(n => { byId[n.id] = n; n.outT = 0; n.inT = 0; n.outN = 0; n.inN = 0; });
        model.links.forEach(l => {
            if (byId[l.from]) { byId[l.from].outT += l.value; byId[l.from].outN++; }
            if (byId[l.to])   { byId[l.to].inT   += l.value; byId[l.to].inN++; }
        });
        // Dây chỉ chiếm RIB_FILL chiều cao mép node (căn giữa) → mảnh, thanh hơn.
        [...srcNodes, ...poolNodes, ...sinkNodes].forEach(n => {
            const off = n.h * (1 - RIB_FILL) / 2;
            n.outC = off; n.inC = off;
        });

        const paths = [];
        const draw = (l, x0, x1) => {
            const a = byId[l.from], b = byId[l.to];
            if (!a || !b) return;
            const aU = a.h * RIB_FILL - Math.max(0, a.outN - 1) * SEG_GAP;
            const bU = b.h * RIB_FILL - Math.max(0, b.inN - 1) * SEG_GAP;
            const sh = a.outT ? l.value / a.outT * aU : aU;
            const th = b.inT ? l.value / b.inT * bU : bU;
            const y0t = a.y + a.outC, y0b = y0t + sh; a.outC += sh + SEG_GAP;
            const y1t = b.y + b.inC, y1b = y1t + th; b.inC += th + SEG_GAP;
            const col = (POOLS[l.currency] && POOLS[l.currency].color) || '#94a3b8';
            const lbl = `${(SOURCES[l.from] || POOLS[l.from] || {}).label || l.from} → ${(SINKS[l.to] || POOLS[l.to] || {}).label || l.to}: ${fmt(l.value)} ${l.currency}`;
            paths.push(`<path class="eco-rib" data-a="${l.from}" data-b="${l.to}" d="${ribbon(x0, y0t, y0b, x1, y1t, y1b)}" fill="${col}"><title>${lbl}</title></path>`);
        };
        const byPos = (a, b) => (byId[a.from].y - byId[b.from].y) || (byId[a.to].y - byId[b.to].y);
        model.links.filter(l => SOURCES[l.from]).sort(byPos).forEach(l => draw(l, xSrcR, xPoolL));
        model.links.filter(l => SINKS[l.to]).sort(byPos).forEach(l => draw(l, xPoolR, xSinkL));

        host.style.height = H + 'px';
        host.innerHTML = `
            <svg class="eco-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">${paths.join('')}</svg>
            ${srcNodes.map(n => nodeHtml(n, 0, NW)).join('')}
            ${poolNodes.map(n => nodeHtml(n, xPoolL, NWP)).join('')}
            ${sinkNodes.map(n => nodeHtml(n, xSinkL, NW)).join('')}`;
        bindTooltips(host, model);
    }

    // ── Balance cards + summary ──────────────────────────────────────────────────

    function renderBalance(model) {
        const el = $('eco-balance');
        if (!el) return;
        el.innerHTML = model.balances.map(b => {
            const p = POOLS[b.currency] || {};
            const net = b.in - b.out;
            const netCls = net >= 0 ? 'pos' : 'neg';
            return `<div class="eco-bal glass" style="border-top:3px solid ${p.color || '#94a3b8'}">
                <div class="eco-bal-head"><span>${p.icon || ''}</span><span>${p.label || b.currency}</span></div>
                <div class="eco-bal-net mono ${netCls}">${net >= 0 ? '+' : ''}${fmt(net)}</div>
                <div class="eco-bal-io mono">
                    <span class="pos">▲ ${fmt(b.in)}</span>
                    <span class="neg">▼ ${fmt(b.out)}</span>
                </div>
            </div>`;
        }).join('') || `<div class="eco-empty">—</div>`;
    }

    // ── Sub-tab: liệt kê Source & Sink theo currency (tên feature/gói bán chính xác) ──

    function ssRowHtml(it) {
        const isSrc = it.role === 'source';
        const dcol = isSrc ? 'var(--success)' : 'var(--danger)';
        return `<tr>
            <td style="width:1%;text-align:center;color:${dcol}">${isSrc ? '▲' : '▼'}</td>
            <td><span class="eco-li-ic">${it.icon}</span> <span>${it.label}</span></td>
            <td class="mono" style="text-align:right;color:${dcol};font-weight:700">${fmt(it.value)}</td>
        </tr>`;
    }

    function currencyCardHtml(cur, list) {
        const p = POOLS[cur] || {}, c = p.color || '#94a3b8';
        const srcs = list.filter(i => i.role === 'source').sort((a, b) => b.value - a.value);
        const sinks = list.filter(i => i.role === 'sink').sort((a, b) => b.value - a.value);
        const net = srcs.reduce((s, i) => s + i.value, 0) - sinks.reduce((s, i) => s + i.value, 0);
        const netCol = net >= 0 ? 'var(--success)' : 'var(--danger)';
        return `<div class="data-table-card glass" style="margin-bottom:0;border-top:3px solid ${c}">
            <div class="table-header">
                <h3>${p.icon || ''} ${p.label || cur}</h3>
                <span class="result-count mono" style="color:${netCol}">Net: ${net >= 0 ? '+' : ''}${fmt(net)}</span>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th></th><th>Tên</th><th style="text-align:right">Giá trị</th></tr></thead>
                    <tbody>${[...srcs, ...sinks].map(ssRowHtml).join('')}</tbody>
                </table>
            </div>
        </div>`;
    }

    let _selCur = '';   // currency đang chọn ở tab liệt kê

    function renderSourcesSinks(model) {
        const tabs = $('eco-cur-tabs'), host = $('eco-breakdown');
        if (!tabs || !host) return;
        const items = EconomyModel.breakdown(model, _gd, currentScope());
        const byCur = {};
        items.forEach(it => { (byCur[it.currency] = byCur[it.currency] || []).push(it); });
        const curs = Object.keys(POOLS).filter(cur => byCur[cur] && byCur[cur].length);

        if (!curs.length) {
            tabs.innerHTML = '';
            host.innerHTML = `<div class="eco-empty">Không có dòng tiền nào trong phạm vi này.</div>`;
            return;
        }
        if (!curs.includes(_selCur)) _selCur = curs[0];

        tabs.innerHTML = curs.map(cur => {
            const p = POOLS[cur];
            return `<button class="encyc-sub-tab${cur === _selCur ? ' active' : ''}" data-cur="${cur}">${p.icon} ${p.label}</button>`;
        }).join('');
        tabs.querySelectorAll('[data-cur]').forEach(btn => btn.addEventListener('click', () => {
            _selCur = btn.dataset.cur;
            renderSourcesSinks(model);
        }));
        host.innerHTML = currencyCardHtml(_selCur, byCur[_selCur]);
    }

    function renderSummary(model) {
        const m = model.meta;
        const scope = m.batch ? `Batch #${m.batch}` : (m.scene || 'Toàn game');
        setText('eco-sum-scope', scope);
        setText('eco-sum-orders', m.orders.toLocaleString());
        setText('eco-sum-gold', fmt(m.goldIn).toLocaleString());
        setText('eco-sum-energy', fmt(m.energyDemand).toLocaleString());
        setText('eco-sum-build', fmt(m.buildCost).toLocaleString());
    }

    // ── Filters ──────────────────────────────────────────────────────────────────

    function currentScope() {
        return {
            scene: $('eco-filter-scene')?.value || '',
            batch: $('eco-filter-batch')?.value || '',
        };
    }

    function renderIOChart(model) {
        const ctx = document.getElementById('eco-io-chart');
        if (!ctx || typeof Chart === 'undefined') return;
        if (window._ecoIOChart) window._ecoIOChart.destroy();
        const bal = model.balances;
        const T = k => (typeof I18N !== 'undefined' ? I18N.t(k) : null);
        window._ecoIOChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bal.map(b => (POOLS[b.currency] || {}).label || b.currency),
                datasets: [
                    { label: T('eco.in') || 'Vào', data: bal.map(b => Math.round(b.in)), backgroundColor: '#22c55e', borderRadius: 4, borderSkipped: false },
                    { label: T('eco.out') || 'Ra', data: bal.map(b => Math.round(b.out)), backgroundColor: '#f87171', borderRadius: 4, borderSkipped: false },
                ],
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#cbd5e1', usePointStyle: true, pointStyle: 'rectRounded', padding: 16 } },
                    tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}` } },
                },
                scales: {
                    x: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { display: false } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                },
            },
        });
    }

    function render() {
        const model = EconomyModel.compute(_gd, _energyMap, currentScope());
        renderSourcesSinks(model);
        renderSummary(model);
        renderSankey(model);
        renderBalance(model);
        renderIOChart(model);
    }

    function updateBatchDropdown() {
        const scene = $('eco-filter-scene')?.value || '';
        const group = document.getElementById('eco-filter-batch-group');
        const sel = $('eco-filter-batch');
        if (!group || !sel) return;
        if (!scene) { group.style.display = 'none'; sel.value = ''; return; }
        group.style.display = '';
        const prev = sel.value;
        sel.innerHTML = '<option value="">Cả scene</option>';
        EconomyModel.batchesOf(_gd, scene).forEach(b => {
            const o = document.createElement('option');
            o.value = b.id; o.textContent = `Batch ${b.id}`;
            sel.appendChild(o);
        });
        sel.value = [...sel.options].some(o => o.value === prev) ? prev : '';
    }

    function init() {
        if (!window.GameData || typeof EconomyModel === 'undefined') return;
        _gd = window.GameData;
        _energyMap = window.ProcessedData?.global?.energyMap || {};

        fillSelect('eco-filter-scene', EconomyModel.scenes(_gd));
        $('eco-filter-scene')?.addEventListener('change', () => { updateBatchDropdown(); render(); });
        $('eco-filter-batch')?.addEventListener('change', render);
        render();
    }

    return { init };

})();

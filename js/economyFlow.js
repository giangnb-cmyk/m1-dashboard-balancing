/**
 * economyFlow.js — Tab Economy: sơ đồ Source → Pool → Sink dòng tiền (Sankey).
 *
 * Xem theo toàn game / scene / batch. Node = HTML (icon + số), ribbon = SVG (dày ∝ flow).
 * Phụ thuộc: EconomyModel, window.GameData, ProcessedData.global.energyMap, TableUtils.
 */
const EconomyFlow = (() => {

    const { $, setText, fillSelect } = TableUtils;
    const { SOURCES, POOLS, SINKS } = EconomyModel;

    const W = 980, NW = 196, NWP = 150, GAP = 14, PAD = 12, MINH = 26;
    const xSrcR = NW, xPoolL = (W - NWP) / 2, xPoolR = (W - NWP) / 2 + NWP, xSinkL = W - NW;

    let _gd = null, _energyMap = null;

    const fmt = v => {
        const a = Math.abs(v);
        return a >= 1000 ? Math.round(v).toLocaleString() : a >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
    };

    // ── Layout ──────────────────────────────────────────────────────────────────

    /** Gán {y,h} cho node mỗi cột, trả về scale + tổng chiều cao cần. */
    function layoutColumn(nodes, scale) {
        let y = PAD;
        nodes.forEach(n => {
            n.h = Math.max(n.value * scale, MINH);
            n.y = y;
            y += n.h + GAP;
        });
        return y - GAP + PAD;
    }

    function buildNodes(model) {
        const poolMax = {};
        model.balances.forEach(b => { poolMax[b.currency] = Math.max(b.in, b.out); });

        const srcVal = {}, sinkVal = {};
        model.links.forEach(l => {
            if (SOURCES[l.from]) srcVal[l.from] = (srcVal[l.from] || 0) + l.value;
            if (SINKS[l.to])     sinkVal[l.to] = (sinkVal[l.to] || 0) + l.value;
        });

        const mk = (id, reg, value, kind) => ({ id, kind, value, label: reg[id].label, icon: reg[id].icon, color: reg[id].color });
        const srcNodes  = Object.keys(SOURCES).filter(id => srcVal[id] > 0).map(id => mk(id, SOURCES, srcVal[id], 'src'));
        const poolNodes = Object.keys(POOLS).filter(id => poolMax[id] > 0).map(id => mk(id, POOLS, poolMax[id], 'pool'));
        const sinkNodes = Object.keys(SINKS).filter(id => sinkVal[id] > 0).map(id => mk(id, SINKS, sinkVal[id], 'sink'));
        return { srcNodes, poolNodes, sinkNodes };
    }

    // ── Ribbon path ───────────────────────────────────────────────────────────

    function ribbon(x0, y0t, y0b, x1, y1t, y1b) {
        const xm = (x0 + x1) / 2;
        return `M${x0},${y0t} C${xm},${y0t} ${xm},${y1t} ${x1},${y1t} `
             + `L${x1},${y1b} C${xm},${y1b} ${xm},${y0b} ${x0},${y0b} Z`;
    }

    function nodeHtml(n, x, w) {
        const cls = n.kind === 'pool' ? 'eco-node eco-node-pool' : `eco-node eco-node-${n.kind}`;
        const bar = n.color ? `border-left:3px solid ${n.color}` : '';
        return `<div class="${cls}" data-id="${n.id}" style="left:${x}px;top:${n.y}px;width:${w}px;height:${n.h}px;${bar}">
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
            `<div class="eco-tt-row"><span>${sign} ${lbl}</span>`
            + `<span class="mono">${fmt(val)} <b style="color:${curColor(cur)}">${cur}</b></span></div>`;
        let h = `<div class="eco-tt-head">${r.icon} ${r.label}</div>`;
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

    function bindTooltips(host, model) {
        host.querySelectorAll('.eco-node').forEach(el => {
            el.addEventListener('mouseenter', e => {
                const t = ensureTip();
                t.innerHTML = tipHtml(el.dataset.id, model);
                t.style.display = 'block';
                moveTip(e);
            });
            el.addEventListener('mousemove', moveTip);
            el.addEventListener('mouseleave', () => { if (_tip) _tip.style.display = 'none'; });
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

        // scale: cột nào cũng vừa chiều cao khả dụng
        const H_BASE = 480, avail = H_BASE - PAD * 2;
        const colTotal = ns => ns.reduce((s, n) => s + n.value, 0) || 1;
        const cols = [srcNodes, poolNodes, sinkNodes];
        const scale = Math.min(...cols.map(ns => (avail - (ns.length - 1) * GAP) / colTotal(ns)));

        const h1 = layoutColumn(srcNodes, scale);
        const h2 = layoutColumn(poolNodes, scale);
        const h3 = layoutColumn(sinkNodes, scale);
        const H = Math.max(h1, h2, h3, 160);

        const byId = {};
        [...srcNodes, ...poolNodes, ...sinkNodes].forEach(n => { byId[n.id] = n; n.outY = n.y; n.inY = n.y; });

        // ribbons: source→pool rồi pool→sink (cùng scale với node height)
        const paths = [];
        const draw = (l, x0, x1) => {
            const a = byId[l.from], b = byId[l.to];
            if (!a || !b) return;
            const hh = l.value * scale;
            const y0t = a.outY, y0b = a.outY + hh; a.outY += hh;
            const y1t = b.inY,  y1b = b.inY + hh;  b.inY += hh;
            const col = (POOLS[l.currency] && POOLS[l.currency].color) || '#94a3b8';
            paths.push(`<path d="${ribbon(x0, y0t, y0b, x1, y1t, y1b)}" fill="${col}" fill-opacity="0.34"><title>${l.from} → ${l.to}: ${fmt(l.value)} ${l.currency}</title></path>`);
        };
        model.links.filter(l => SOURCES[l.from]).forEach(l => draw(l, xSrcR, xPoolL));
        model.links.filter(l => SINKS[l.to]).forEach(l => draw(l, xPoolR, xSinkL));

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
        return { scene: $('eco-filter-scene')?.value || '', batch: $('eco-filter-batch')?.value || '' };
    }

    function render() {
        const model = EconomyModel.compute(_gd, _energyMap, currentScope());
        renderSummary(model);
        renderSankey(model);
        renderBalance(model);
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

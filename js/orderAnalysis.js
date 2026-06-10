/**
 * orderAnalysis.js — Tab: Order Analysis
 *
 * Visualize orders theo scene: difficulty curve chart + batch/order cards.
 * Phụ thuộc: TableUtils, window.GameData
 */
const OrderAnalysis = (() => {

    const { $, setText, fillSelect, bindFilters, sortByKey, bindSort, renderRows } = TableUtils;

    const BATCH_PALETTE = [
        '#38bdf8','#818cf8','#4ade80','#fbbf24','#f472b6',
        '#34d399','#fb923c','#a78bfa','#60a5fa','#f87171',
        '#e879f9','#2dd4bf',
    ];

    let _chartView = 'order';
    let _lastRenderArgs = null;

    // ── Helpers ───────────────────────────────────────────────────────────────

    function buildOrderMap(orderDetail) {
        const map = {};
        orderDetail.forEach(o => { map[o.orderId] = o; });
        return map;
    }

    function getOrderGold(order) {
        return parseInt(order.gold) || 0;
    }

    function getOrderEnergy(order, energyMap) {
        let total = 0;
        for (let i = 1; i <= 2; i++) {
            const id  = order[`item${i}_id`];
            const amt = parseInt(order[`item${i}_amount`]) || 0;
            if (!id || amt === 0) continue;
            const entry = energyMap[id];
            total += (entry ? (entry.energy ?? entry) : 0) * amt;
        }
        return Math.round(total * 10) / 10;
    }



    function getBatchOrderIds(batch) {
        const ids = [];
        for (let i = 1; i <= 7; i++) {
            const oid = batch[`order${i}_idOrder`];
            if (oid !== '' && oid !== undefined) ids.push(oid);
        }
        return ids;
    }

    function buildOrderItemsHtml(order) {
        const parts = [];
        for (let i = 1; i <= 2; i++) {
            const id   = order[`item${i}_id`];
            const name = order[`item${i}_name`] || id;
            const amt  = parseInt(order[`item${i}_amount`]) || 0;
            if (!id) continue;
            parts.push(
                `<span class="mono" style="color:var(--energy);font-size:0.75rem">${id}</span> `
                + `<span style="font-size:0.8rem">${name}</span>`
                + (amt > 1 ? ` <span style="color:var(--gold)">×${amt}</span>` : '')
            );
        }
        return parts.join('<br>');
    }

    // ── Chart ─────────────────────────────────────────────────────────────────

    function _setToggleStyle(activeView) {
        const btnOrder = document.getElementById('oa-view-order');
        const btnBatch = document.getElementById('oa-view-batch');
        if (!btnOrder || !btnBatch) return;
        btnOrder.style.borderColor = activeView === 'order' ? 'rgba(56,189,248,0.5)' : 'rgba(148,163,184,0.2)';
        btnOrder.style.background  = activeView === 'order' ? 'rgba(56,189,248,0.15)' : 'transparent';
        btnOrder.style.color       = activeView === 'order' ? '#38bdf8' : '#94a3b8';
        btnBatch.style.borderColor = activeView === 'batch' ? 'rgba(56,189,248,0.5)' : 'rgba(148,163,184,0.2)';
        btnBatch.style.background  = activeView === 'batch' ? 'rgba(56,189,248,0.15)' : 'transparent';
        btnBatch.style.color       = activeView === 'batch' ? '#38bdf8' : '#94a3b8';
    }

    function renderChartLegend() {
        const el = document.getElementById('oa-chart-legend');
        if (!el) return;
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:1.5rem;justify-content:center;
                        padding:0.5rem 0 0.75rem;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:18px;height:12px;border-radius:3px;background:#38bdf8;flex-shrink:0"></div>
                    <span style="color:#f8fafc;font-size:0.85rem;font-weight:600;font-family:Inter,sans-serif">Energy Cost / Order</span>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:24px;height:3px;background:rgba(251,191,36,0.9);border-radius:2px;flex-shrink:0"></div>
                    <span style="color:#f8fafc;font-size:0.85rem;font-weight:600;font-family:Inter,sans-serif">Trend <span style="color:#94a3b8;font-weight:400">(trung bình 3 orders)</span></span>
                </div>
            </div>`;
    }

    function renderDifficultyChart(batches, orderMap, energyMap) {
        const ctx = $('oa-difficulty-chart');
        if (!ctx) return;
        if (window._oaChart) window._oaChart.destroy();
        renderChartLegend();

        const labels = [], dataEnergy = [], dataGold = [], colors = [], batchLabels = [];

        batches.forEach((batch, bi) => {
            const color = BATCH_PALETTE[bi % BATCH_PALETTE.length];
            getBatchOrderIds(batch).forEach(oid => {
                const order = orderMap[oid];
                if (!order) return;
                labels.push(`O${oid}`);
                dataEnergy.push(getOrderEnergy(order, energyMap));
                dataGold.push(getOrderGold(order));
                colors.push(color);
                batchLabels.push(`Batch ${batch.id} (${batch.themeType})`);
            });
        });

        // Trendline: rolling average window 3
        const trend = dataEnergy.map((_, i) => {
            const slice = dataEnergy.slice(Math.max(0, i - 1), i + 2);
            return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(1);
        });

        window._oaChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Energy Cost',
                        data: dataEnergy,
                        backgroundColor: colors,
                        borderRadius: 4,
                        borderWidth: 0,
                        order: 2,
                    },
                    {
                        label: 'Trend',
                        data: trend,
                        type: 'line',
                        borderColor: 'rgba(251,191,36,0.7)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false,
                        order: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: items => `${batchLabels[items[0].dataIndex]} · Order ${items[0].label}`,
                            label: c => {
                                const idx = c.dataIndex;
                                if (c.dataset.label === 'Trend') return ` Trend avg: ${c.parsed.y} ⚡`;
                                return ` Energy: ${c.parsed.y} ⚡  ·  Gold: ${dataGold[idx]} 💰`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: '#cbd5e1', font: { size: 9 }, maxRotation: 0 },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    },
                    y: {
                        ticks: { color: '#cbd5e1' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        title: { display: true, text: 'Energy Cost (difficulty proxy)', color: '#94a3b8', font: { size: 11 } },
                    },
                },
            },
        });
    }

    function renderBatchChartLegend() {
        const el = document.getElementById('oa-chart-legend');
        if (!el) return;
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:1.5rem;justify-content:center;
                        padding:0.5rem 0 0.75rem;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:18px;height:12px;border-radius:3px;background:#38bdf8;flex-shrink:0"></div>
                    <span style="color:#f8fafc;font-size:0.85rem;font-weight:600;font-family:Inter,sans-serif">Avg Energy / Order</span>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:24px;height:3px;background:rgba(251,191,36,0.9);border-radius:2px;flex-shrink:0"></div>
                    <span style="color:#f8fafc;font-size:0.85rem;font-weight:600;font-family:Inter,sans-serif">Total Batch Energy <span style="color:#94a3b8;font-weight:400">(trục phải)</span></span>
                </div>
            </div>`;
    }

    function renderBatchChart(batches, orderMap, energyMap) {
        const ctx = $('oa-difficulty-chart');
        if (!ctx) return;
        if (window._oaChart) window._oaChart.destroy();
        renderBatchChartLegend();

        const labels = [], dataAvg = [], dataTotal = [], colors = [], tooltipData = [];

        batches.forEach((batch, bi) => {
            const color = BATCH_PALETTE[bi % BATCH_PALETTE.length];
            const oids  = getBatchOrderIds(batch);
            const energies = oids.map(oid => orderMap[oid] ? getOrderEnergy(orderMap[oid], energyMap) : 0);
            const total    = Math.round(energies.reduce((a, b) => a + b, 0) * 10) / 10;
            const avg      = energies.length ? +(total / energies.length).toFixed(1) : 0;

            labels.push(`B${batch.id}`);
            dataAvg.push(avg);
            dataTotal.push(total);
            colors.push(color);
            tooltipData.push({ id: batch.id, theme: batch.themeType, count: oids.length, avg, total });
        });

        window._oaChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Avg Energy/Order',
                        data: dataAvg,
                        backgroundColor: colors.map(c => c + 'bb'),
                        borderColor: colors,
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 2,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Total Energy',
                        data: dataTotal,
                        type: 'line',
                        borderColor: 'rgba(251,191,36,0.85)',
                        backgroundColor: 'rgba(251,191,36,0.08)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: 'rgba(251,191,36,0.9)',
                        tension: 0.3,
                        fill: false,
                        order: 1,
                        yAxisID: 'y2',
                    },
                ],
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: items => {
                                const d = tooltipData[items[0].dataIndex];
                                return `Batch ${d.id} · ${d.theme}`;
                            },
                            label: c => {
                                const d = tooltipData[c.dataIndex];
                                if (c.dataset.label === 'Total Energy')
                                    return ` Total: ${d.total} ⚡`;
                                return ` Avg/Order: ${d.avg} ⚡  ·  ${d.count} orders`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: '#cbd5e1', font: { size: 10 }, maxRotation: 0 },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    },
                    y: {
                        position: 'left',
                        ticks: { color: '#cbd5e1' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        title: { display: true, text: 'Avg Energy / Order', color: '#94a3b8', font: { size: 11 } },
                    },
                    y2: {
                        position: 'right',
                        ticks: { color: 'rgba(251,191,36,0.65)' },
                        grid: { display: false },
                        title: { display: true, text: 'Total Batch Energy', color: 'rgba(251,191,36,0.65)', font: { size: 11 } },
                    },
                },
            },
        });
    }

    // ── Batch cards ───────────────────────────────────────────────────────────

    function renderBatchCards(batches, orderMap, energyMap) {
        const container = $('oa-batches-container');
        if (!container) return;

        // compute per-batch max energy for relative bar scaling
        const batchMaxEnergy = batches.map(batch =>
            getBatchOrderIds(batch).reduce((mx, oid) => {
                const o = orderMap[oid];
                return o ? Math.max(mx, getOrderEnergy(o, energyMap)) : mx;
            }, 1)
        );

        container.innerHTML = batches.map((batch, bi) => {
            const color = BATCH_PALETTE[bi % BATCH_PALETTE.length];
            const maxEnergy = batchMaxEnergy[bi];
            const oids = getBatchOrderIds(batch);

            const orderRows = oids.map((oid, idx) => {
                const order = orderMap[oid];
                if (!order) return '';
                const energy = getOrderEnergy(order, energyMap);
                const gold   = getOrderGold(order);
                const pct    = maxEnergy > 0 ? Math.round((energy / maxEnergy) * 100) : 0;
                const npc    = order.idNPC ? `NPC ${order.idNPC}` : '';

                const itemParts = [];
                for (let i = 1; i <= 2; i++) {
                    const id   = order[`item${i}_id`];
                    const name = order[`item${i}_name`] || id;
                    const amt  = parseInt(order[`item${i}_amount`]) || 0;
                    if (!id) continue;
                    itemParts.push(
                        `<span class="mono" style="color:var(--energy);font-size:0.75rem">${id}</span>`
                        + ` <span style="color:#e2e8f0">${name}</span>`
                        + (amt > 1 ? ` <span style="color:var(--gold)">×${amt}</span>` : '')
                    );
                }

                return `
                    <div style="display:grid;grid-template-columns:3rem 1fr auto;
                                padding:0.55rem 1rem;gap:0.75rem;align-items:center;
                                border-bottom:1px solid rgba(255,255,255,0.04);
                                background:${idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}">
                        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">
                            <span class="mono" style="color:var(--text-muted);font-size:0.78rem;font-weight:600">#${oid}</span>
                            ${npc ? `<span style="font-size:0.68rem;color:#818cf8;white-space:nowrap">${npc}</span>` : ''}
                        </div>
                        <div style="display:flex;flex-direction:column;gap:2px;font-size:0.82rem;line-height:1.4">
                            ${itemParts.join('<div style="height:2px"></div>')}
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;min-width:5.5rem">
                            <span class="mono" style="color:var(--energy);font-weight:700;font-size:0.88rem">${energy > 0 ? energy + ' ⚡' : '—'}</span>
                            <span class="mono" style="color:var(--gold);font-size:0.75rem">${gold > 0 ? gold + ' 💰' : ''}</span>
                            <div style="width:60px;height:3px;border-radius:2px;background:rgba(255,255,255,0.07)">
                                <div style="height:3px;border-radius:2px;background:${color};width:${pct}%"></div>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            const canRew = batch.canReceiveReward === '1'
                ? `<span style="color:#4ade80;font-size:0.72rem;font-weight:500">✓ Reward</span>`
                : `<span style="color:#475569;font-size:0.72rem">✗ No reward</span>`;

            const batchEnergies = oids.map(oid => orderMap[oid] ? getOrderEnergy(orderMap[oid], energyMap) : 0);
            const avgEnergy = batchEnergies.length
                ? +(batchEnergies.reduce((a, b) => a + b, 0) / batchEnergies.length).toFixed(1)
                : 0;

            return `
                <div class="data-table-card glass" style="margin-bottom:1rem;padding:0;overflow:hidden">
                    <div style="padding:0.75rem 1rem;display:flex;align-items:center;gap:0.75rem;
                                border-bottom:3px solid ${color}22;background:rgba(255,255,255,0.02)">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
                        <span class="mono" style="color:var(--text-muted);font-size:0.73rem">#${batch.id}</span>
                        <span style="font-size:0.82rem;font-weight:600;color:${color}">${batch.themeType}</span>
                        ${canRew}
                        <span style="margin-left:auto;font-size:0.73rem;color:var(--text-muted)">
                            ${oids.length} orders &nbsp;·&nbsp; avg <span class="mono" style="color:var(--energy)">${avgEnergy} ⚡</span>
                        </span>
                    </div>
                    ${orderRows}
                </div>`;
        }).join('');
    }

    // ── Main render ───────────────────────────────────────────────────────────

    function updateBatchDropdown(orderSystem) {
        const sceneF = $('oa-filter-scene')?.value || '';
        const group  = document.getElementById('oa-filter-batch-group');
        const sel    = $('oa-filter-batch');
        if (!group || !sel) return;

        if (!sceneF) {
            group.style.display = 'none';
            sel.value = '';
            return;
        }

        group.style.display = '';
        const batches = orderSystem.filter(b => b.themeType === sceneF);
        const prev = sel.value;
        sel.innerHTML = '<option value="">Tất cả</option>';
        batches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = `Batch ${b.id}`;
            sel.appendChild(opt);
        });
        sel.value = prev && batches.some(b => b.id === prev) ? prev : '';
    }

    function renderSceneEnergySummary(orderSystem, orderMap, energyMap, activeScene) {
        const el = document.getElementById('oa-scene-energy-summary');
        if (!el) return;

        const sceneMap = {};
        let maxTotal = 0;
        orderSystem.forEach(batch => {
            const scene = batch.themeType;
            if (!scene) return;
            if (!sceneMap[scene]) sceneMap[scene] = { total: 0, count: 0 };
            getBatchOrderIds(batch).forEach(oid => {
                const order = orderMap[oid];
                if (!order) return;
                sceneMap[scene].total += getOrderEnergy(order, energyMap);
                sceneMap[scene].count++;
            });
        });
        Object.values(sceneMap).forEach(d => { if (d.total > maxTotal) maxTotal = d.total; });

        const rows = Object.entries(sceneMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([scene, data]) => {
                const isActive = activeScene === scene;
                const total    = Math.round(data.total);
                const avg      = data.count > 0 ? (data.total / data.count).toFixed(1) : '0';
                const barPct   = maxTotal > 0 ? (data.total / maxTotal * 100).toFixed(1) : 0;
                const rowBg    = isActive ? 'rgba(56,189,248,0.1)' : 'transparent';
                return `<tr class="oa-scene-row${isActive ? ' oa-scene-row-active' : ''}"
                    style="cursor:pointer;background:${rowBg};transition:background .12s"
                    onclick="document.getElementById('oa-filter-scene').value='${scene}';document.getElementById('oa-filter-scene').dispatchEvent(new Event('change'))"
                    onmouseenter="this.style.background='rgba(56,189,248,0.07)'"
                    onmouseleave="this.style.background='${rowBg}'">
                  <td style="padding:.45rem .75rem;white-space:nowrap;font-size:.8rem;font-weight:${isActive?700:500};color:${isActive?'var(--accent)':'var(--text-primary)'}">
                    ${isActive ? '▶ ' : ''}${scene}
                  </td>
                  <td style="padding:.45rem .75rem;text-align:right;font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:var(--accent);white-space:nowrap">
                    ${total.toLocaleString()} ⚡
                  </td>
                  <td style="padding:.45rem .75rem;width:40%;min-width:120px">
                    <div style="background:rgba(148,163,184,.12);border-radius:3px;height:6px;overflow:hidden">
                      <div style="background:var(--accent);width:${barPct}%;height:100%;border-radius:3px;transition:width .3s"></div>
                    </div>
                  </td>
                  <td style="padding:.45rem .75rem;text-align:right;font-size:.75rem;color:var(--text-muted);white-space:nowrap">${data.count} orders</td>
                  <td style="padding:.45rem .75rem;text-align:right;font-size:.75rem;color:var(--text-muted);white-space:nowrap">${avg} ⚡/order</td>
                </tr>`;
            }).join('');

        el.innerHTML = `
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid rgba(148,163,184,.15)">
                <th style="padding:.35rem .75rem;text-align:left;font-size:.7rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;text-transform:uppercase">Scene</th>
                <th style="padding:.35rem .75rem;text-align:right;font-size:.7rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;text-transform:uppercase">Total Energy</th>
                <th></th>
                <th style="padding:.35rem .75rem;text-align:right;font-size:.7rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;text-transform:uppercase">Orders</th>
                <th style="padding:.35rem .75rem;text-align:right;font-size:.7rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;text-transform:uppercase">Avg / Order</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`;
    }

    function render(orderSystem, orderMap, energyMap) {
        _lastRenderArgs = [orderSystem, orderMap, energyMap];

        const sceneF = $('oa-filter-scene')?.value || '';
        const batchF = $('oa-filter-batch')?.value  || '';
        const batches = orderSystem.filter(b =>
            (!sceneF || b.themeType === sceneF) &&
            (!batchF || b.id === batchF)
        );

        const orderIds = new Set();
        batches.forEach(b => getBatchOrderIds(b).forEach(oid => orderIds.add(oid)));

        const allEnergies = [...orderIds].map(oid => orderMap[oid] ? getOrderEnergy(orderMap[oid], energyMap) : 0);
        const avgEnergy   = allEnergies.length
            ? +(allEnergies.reduce((a, b) => a + b, 0) / allEnergies.length).toFixed(1)
            : 0;

        setText('oa-filter-stat-batches', batches.length.toLocaleString());
        setText('oa-filter-stat-orders',  orderIds.size.toLocaleString());
        setText('oa-stat-avg-gold', avgEnergy.toLocaleString());

        renderSceneEnergySummary(orderSystem, orderMap, energyMap, sceneF);
        if (_chartView === 'batch') {
            renderBatchChart(batches, orderMap, energyMap);
        } else {
            renderDifficultyChart(batches, orderMap, energyMap);
        }
        renderBatchCards(batches, orderMap, energyMap);
    }

    function setChartView(view) {
        _chartView = view;
        _setToggleStyle(view);
        const title = document.getElementById('oa-chart-title');
        if (title) title.textContent = view === 'batch'
            ? 'Energy per Batch — Avg & Total'
            : 'Difficulty Curve — Energy Cost per Order';
        if (_lastRenderArgs) render(..._lastRenderArgs);
    }

    // ── Top Demand ────────────────────────────────────────────────────────────

    function calcDemand(orderDetail) {
        const demand = {};
        orderDetail.forEach(row => {
            for (let i = 1; i <= 2; i++) {
                const id   = row[`item${i}_id`];
                const name = row[`item${i}_name`] || id;
                const amt  = parseInt(row[`item${i}_amount`]) || 0;
                if (!id || amt === 0) continue;
                if (!demand[id]) demand[id] = { id, name, count: 0, totalAmt: 0 };
                demand[id].count++;
                demand[id].totalAmt += amt;
            }
        });
        return Object.values(demand).sort((a, b) => b.count - a.count);
    }

    function renderDemandChart(demand) {
        const ctx = $('oa-demand-chart');
        if (!ctx) return;
        if (window._oaDemandChart) window._oaDemandChart.destroy();
        const top15 = demand.slice(0, 15);
        window._oaDemandChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top15.map(d => d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name),
                datasets: [{
                    label: 'Order Count',
                    data: top15.map(d => d.count),
                    backgroundColor: top15.map((_, i) => `hsl(${200 + i * 8}, 70%, 58%)`),
                    borderRadius: 6, borderWidth: 0,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: items => top15[items[0].dataIndex].name,
                            label: c => ` ${c.parsed.x} orders  ·  ID: ${top15[c.dataIndex].id}`,
                        },
                    },
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
                },
            },
        });
    }

    function initTopDemand(orderDetail) {
        const demand = calcDemand(orderDetail);

        setText('oa-demand-total', demand.length.toLocaleString());

        const allRows = demand.map((d, i) => ({
            rank: i + 1, count: d.count, totalAmt: d.totalAmt,
            name: d.name, id: d.id,
            html: `<tr>
                <td class="mono" style="color:var(--text-muted);text-align:center">${i + 1}</td>
                <td>${d.name}</td>
                <td class="mono" style="color:var(--energy);font-size:0.8rem">${d.id}</td>
                <td class="mono" style="color:var(--energy);font-weight:700">${d.count}</td>
                <td class="mono" style="color:var(--gold)">${d.totalAmt}</td>
            </tr>`,
        }));

        let sortKey = 'rank', sortAsc = true;

        function render() {
            const search = ($('oa-demand-search')?.value || '').toLowerCase().trim();
            const filtered = allRows.filter(r => {
                if (search && !r.name.toLowerCase().includes(search)
                           && !r.id.includes(search)) return false;
                return true;
            }).sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            renderRows('oa-demand-body', filtered, 5);
        }

        bindSort('oa-demand-table', () => ({ key: sortKey, asc: sortAsc }),
            (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['oa-demand-search'], render);
        render();
        renderDemandChart(demand);

        window.ProcessedData.orders.demandMap = Object.fromEntries(
            demand.map(d => [d.id, { name: d.name, count: d.count, totalAmt: d.totalAmt }])
        );
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    function init() {
        if (!window.GameData) return;
        const gd          = window.GameData;
        const orderDetail = gd.orderDetail  || [];
        const orderSystem = gd.orderSystem  || [];
        const orderMap  = buildOrderMap(orderDetail);
        const energyMap = window.ProcessedData?.global?.energyMap || {};

        const scenes = [...new Set(orderSystem.map(r => r.themeType).filter(Boolean))].sort();
        fillSelect('oa-filter-scene', scenes);

        const orderIds = new Set();
        orderSystem.forEach(b => getBatchOrderIds(b).forEach(oid => orderIds.add(oid)));

        setText('oa-stat-scenes',  scenes.length.toLocaleString());
        setText('oa-stat-batches', orderSystem.length.toLocaleString());
        setText('oa-stat-orders',  orderIds.size.toLocaleString());

        $('oa-filter-scene')?.addEventListener('change', () => {
            updateBatchDropdown(orderSystem);
            render(orderSystem, orderMap, energyMap);
        });
        $('oa-filter-batch')?.addEventListener('change', () => {
            render(orderSystem, orderMap, energyMap);
        });
        render(orderSystem, orderMap, energyMap);

        initTopDemand(orderDetail);

        // scope inner sub-tabs to this section
        TableUtils.initSubTabs(document.getElementById('order-analysis'));
    }

    return { init, setChartView };

})();

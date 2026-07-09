/**
 * liveOps.js — Tab Live Ops: lịch loop event live-ops.
 *
 * Data snapshot từ docs/M1_LiveOps_Loop.xlsx (sheet "Loop Config" + "Rotation Preview").
 * Event chạy loop theo chu kỳ (không gắn ngày cố định): chu kỳ = thời lượng + cooldown.
 * Rotation là ảnh chụp 30 ngày để thấy nhịp — hết 30 ngày lặp lại.
 */
const LiveOps = (() => {

    const { $ } = TableUtils;

    // Màu theo loại event (hex vì dùng cho cả cell gantt)
    const TYPE_COLOR = {
        'Collection': '#fbbf24',
        'Mini Game':  '#38bdf8',
        'Race':       '#f87171',
        'Event':      '#a78bfa',
    };

    // ── Data: docs/M1_LiveOps_Loop.xlsx ─────────────────────────────────────────
    // rotation: chuỗi 30 ký tự (1 = event mở ngày đó) — sheet "Rotation Preview".
    // Lưu ý 2 event Race: trong xlsx mọi cell đều =1, ngày mở/đóng mã hoá bằng MÀU nền
    // (xanh = mở, xám nhạt = đóng) — không phải bằng giá trị. 2 Race không bao giờ mở trùng ngày.
    const EVENTS = [
        { name: 'Event Collection',    type: 'Collection', dur: 720, cd: 0,   cycle: 720, perMonth: 1,
          reward: '108 thẻ → Grand Reward; thưởng mỗi bộ 9 thẻ', monetize: 'Gián tiếp — pack từ gameplay', status: 'Active',
          note: 'Reset album theo mùa/30 ngày. Gom thẻ từ chính các event bên dưới.',
          rotation: '111111111111111111111111111111' },
        { name: 'Fortune Meets Cookie', type: 'Mini Game', dur: 72,  cd: 288, cycle: 360, perMonth: 2,
          reward: 'Quà theo 8 màn (item + money)', monetize: 'Gói bán thêm token để người chơi chơi event', status: 'Active',
          note: 'Hidden object: gắp bánh quy tìm Mũ đầu bếp. Đũa từ order; đũa dư đổi skip-time.',
          rotation: '000000000001110000000000001110' },
        { name: 'Petal Plate Party',   type: 'Mini Game',  dur: 96,  cd: 264, cycle: 360, perMonth: 2,
          reward: 'Quà theo 10 stage (item + money)', monetize: 'Gói bán Smash All', status: 'Active',
          note: 'Grid hidden object: dùng Búa phá băng tìm nguyên liệu nấu 10 món, grid 3x3→6x6. Búa từ order. Smash All bán trong gói event.',
          rotation: '000000011110000000000011110000' },
        { name: "Dora's Toy Party",    type: 'Mini Game',  dur: 168, cd: 192, cycle: 360, perMonth: 2,
          reward: 'Gold/booster/gem theo cấp merge; hộp collection', monetize: 'Gói bán Bonus Gift', status: 'Active',
          note: 'Merge board 6x8 riêng, 12 cấp vật phẩm chính. Rate rơi lv1 70%/lv2 20%/lv3 10%. Art: trang sức đá quý, búp bê.',
          rotation: '111111100000000111111100000000' },
        { name: 'Sandwich Tower Race', type: 'Race',       dur: 72,  cd: 96,  cycle: 168, perMonth: 4,
          reward: 'Booster + quà random (top 3)', monetize: '', status: 'Active',
          note: 'Đua 5 người, 5 round token tăng dần (4/5/9/14/16). Có bot.',
          rotation: '111000011100001110000111000000' },
        { name: 'Speed Feast Race',    type: 'Race',       dur: 72,  cd: 96,  cycle: 168, perMonth: 4,
          reward: 'Booster + quà random (top 3 mỗi round)', monetize: '', status: 'Active',
          note: 'Đua 5 người, 5 round token tăng dần. Có bot.',
          rotation: '000011100001110000111000011100' },
        { name: 'Clash of Cakes',      type: 'Event',      dur: 72,  cd: 120, cycle: 192, perMonth: 4,
          reward: 'Booster + quà top rank', monetize: '', status: 'Draft',
          note: '',
          rotation: '000001100000110000011000001100' },
    ];

    const badge = (text, color) =>
        `<span class="badge" style="background:${color}1a;border:1px solid ${color}55;color:${color};white-space:nowrap">${text}</span>`;

    // ── Stats ────────────────────────────────────────────────────────────────────
    function renderStats() {
        const active = EVENTS.filter(e => e.status === 'Active');
        TableUtils.setText('lo-stat-total', String(EVENTS.length));
        TableUtils.setText('lo-stat-active', String(active.length));
        TableUtils.setText('lo-stat-types', String(new Set(EVENTS.map(e => e.type)).size));
        TableUtils.setText('lo-stat-rounds', String(EVENTS.reduce((s, e) => s + e.perMonth, 0)));
    }

    // ── Loop config table ────────────────────────────────────────────────────────
    function renderTable() {
        const body = $('lo-table-body');
        if (!body) return;
        body.innerHTML = EVENTS.map(e => `<tr>
            <td style="white-space:nowrap"><strong>${e.name}</strong></td>
            <td>${badge(e.type, TYPE_COLOR[e.type] || '#94a3b8')}</td>
            <td class="mono" style="text-align:right">${e.dur}</td>
            <td class="mono" style="text-align:right">${e.cd}</td>
            <td class="mono" style="text-align:right">${e.cycle}</td>
            <td class="mono" style="text-align:right">${e.perMonth}</td>
            <td>${e.reward}</td>
            <td>${e.monetize || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${e.status === 'Active' ? '<span class="badge ok">Active</span>' : '<span class="badge warn">Draft</span>'}</td>
            <td style="min-width:220px;color:var(--text-muted);font-size:.8rem">${e.note || ''}</td>
        </tr>`).join('');
    }

    // ── Rotation timeline (30 ngày) — bar liền theo khoảng ngày mở, kiểu Office Timeline ──
    const DAYS = 30;

    /** Chuỗi '1'/'0' 30 ký tự → các khoảng [start,end] 0-based của ngày mở liên tiếp. */
    function activeRuns(rotation) {
        const runs = [];
        let s = -1;
        for (let d = 0; d < DAYS; d++) {
            const on = rotation[d] === '1';
            if (on && s < 0) s = d;
            if (s >= 0 && (!on || d === DAYS - 1)) {
                runs.push([s, on ? d : d - 1]);
                s = -1;
            }
        }
        return runs;
    }

    function renderRotation() {
        const host = $('lo-rotation');
        if (!host) return;
        const rows = EVENTS.map(e => {
            const c = TYPE_COLOR[e.type] || '#94a3b8';
            const bars = activeRuns(e.rotation).map(([a, b]) => {
                const n = b - a + 1;
                return `<div class="lo-tl-bar" style="left:${a / DAYS * 100}%;width:${n / DAYS * 100}%;--c:${c}"
                    title="${e.name}: D${a + 1}–D${b + 1} (${n} ngày)"><span>${n} ngày</span></div>`;
            }).join('');
            return `<div class="lo-tl-row">
                <div class="lo-tl-label" title="${e.name}">${e.name}</div>
                <div class="lo-tl-track">${bars}</div>
            </div>`;
        }).join('');
        const ticks = [1, 5, 10, 15, 20, 25, 30].map(d =>
            `<span class="lo-tl-tick" style="left:${(d - 1) / DAYS * 100}%">D${d}</span>`).join('');
        const axis = `<div class="lo-tl-row lo-tl-axis-row">
            <div class="lo-tl-label"></div>
            <div class="lo-tl-axis">${ticks}</div>
        </div>`;
        const legend = Object.keys(TYPE_COLOR).map(t =>
            `<span class="lo-legend-item"><span class="lo-legend-dot" style="background:${TYPE_COLOR[t]}"></span>${t}</span>`).join('');
        host.innerHTML = rows + axis + `<div class="lo-legend">${legend}</div>`;
    }

    function init() {
        renderStats();
        renderTable();
        renderRotation();
    }

    return { init };

})();

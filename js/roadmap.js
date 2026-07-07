/**
 * roadmap.js — Tab Lộ Trình: content-release roadmap cho user.
 *
 * 1) Feature unlock theo account level (UnlockFeature.csv) — timeline Gantt theo nhóm.
 * 2) Onboarding sequence (FeatureSequence.csv) — thứ tự lộ diện phiên đầu.
 * 3) Mốc mở rộng kho (LevelUnlockInventory.csv) — vạch milestone trên timeline.
 * Phụ thuộc: window.GameData, TableUtils.
 */
const Roadmap = (() => {

    const { setText } = TableUtils;

    // Phân nhóm feature → {category}. Category meta: nhãn + màu.
    const CATS = {
        core:   { label: 'Core Gameplay',       color: '#6366f1' },
        events: { label: 'Events / Live-ops',   color: '#38bdf8' },
        monet:  { label: 'Monetization / Packs', color: '#fbbf24' },
    };
    const FEATURE_CAT = {
        Inventory: 'core', DailyReward: 'core', Shop: 'core', GiftCode: 'core', ChefsBook: 'core', ItemBubble: 'core',
        BattlePass: 'events', VideoBonuses: 'events', PetalPlateParty: 'events', SpeedFeastRace: 'events',
        PizzaTowerRace: 'events', FortuneMeetsCookie: 'events', DorasToyParty: 'events', HappinessExpress: 'events', DailyOffer1: 'events',
        EnergyPack: 'monet', EnergyTrilogy: 'monet', InfinityPack: 'monet', StarterPack: 'monet',
        PiggyBank: 'monet', DiscountGemRaw: 'monet', SpeedPackage: 'monet', ChainPack: 'monet',
    };
    const ICON = {
        Inventory: '🎒', DailyReward: '📅', Shop: '🛒', GiftCode: '🎟️', ChefsBook: '📖', ItemBubble: '💬',
        BattlePass: '🎖️', VideoBonuses: '📹', PetalPlateParty: '🌸', SpeedFeastRace: '🏁', PizzaTowerRace: '🍕',
        FortuneMeetsCookie: '🥠', DorasToyParty: '🧸', HappinessExpress: '🚂', DailyOffer1: '🏷️',
        EnergyPack: '⚡', EnergyTrilogy: '⚡', InfinityPack: '♾️', StarterPack: '🎁', PiggyBank: '🐷',
        DiscountGemRaw: '💎', SpeedPackage: '⏩', ChainPack: '🔗',
        OpenningPack: '📦', SpeedFeastRacePreview: '🏁', PiggyBankConfirm: '🐷', Rating: '⭐',
    };

    const humanize = s => String(s || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    const catOf  = f => FEATURE_CAT[f] || 'core';
    const iconOf = f => ICON[f] || '✨';

    let _gd = null, _maxLevel = 30;

    // ── Feature unlock timeline ─────────────────────────────────────────────────

    function pct(level) { return (level / _maxLevel) * 100; }

    function renderTimeline() {
        const host = document.getElementById('rm-timeline');
        if (!host) return;
        const feats = (_gd.unlockFeature || []).map(r => ({
            name: r.feature,
            level: parseInt(r.unlock_value) || 0,
            byBoard: r.unlock_type === 'Level',
            popup: String(r.show_when_open).toUpperCase() === 'TRUE',
            cat: catOf(r.feature),
        }));
        const invLevels = (_gd.levelUnlockInventory || []).map(r => parseInt(r.level)).filter(Boolean);
        _maxLevel = Math.max(_maxLevel, ...feats.map(f => f.level), ...invLevels);

        // axis ticks mỗi 5 level
        const ticks = [];
        for (let l = 0; l <= _maxLevel; l += 5) ticks.push(l);

        const gridLines = ticks.map(l =>
            `<div class="rm-gline" style="left:${pct(l)}%"></div>`).join('');
        const milestones = invLevels.map(l =>
            `<div class="rm-milestone" style="left:${pct(l)}%">
                <span class="rm-mlabel">🎒 Lv${l}</span>
             </div>`).join('');
        const overlay = `<div class="rm-overlay">${gridLines}${milestones}</div>`;

        const axis = `<div class="rm-axis"><div class="rm-axis-pad"></div>
            <div class="rm-axis-track">${ticks.map(l =>
                `<span class="rm-tick" style="left:${pct(l)}%">Lv${l}</span>`).join('')}</div></div>`;

        const rowHtml = f => {
            const color = CATS[f.cat].color;
            const popup = f.popup ? `<span class="rm-badge" title="Có popup thông báo khi mở">🔔</span>` : '';
            const cond = f.byBoard ? `Board Lv${f.level}` : `Account Lv${f.level}`;
            return `<div class="rm-row" data-tip="${humanize(f.name)} — mở ở ${cond}${f.popup ? ' · có popup' : ''}">
                <div class="rm-label"><span class="rm-ic">${iconOf(f.name)}</span><span>${humanize(f.name)}</span>${popup}</div>
                <div class="rm-track">
                    <div class="rm-bar" style="left:${pct(f.level)}%;width:${100 - pct(f.level)}%;background:linear-gradient(90deg,${color}44,${color}14)"></div>
                    <div class="rm-dot" style="left:${pct(f.level)}%;background:${color};box-shadow:0 0 0 3px ${color}33">
                        <span class="rm-lvl mono">${f.level}</span>
                    </div>
                </div>
            </div>`;
        };

        const groups = Object.keys(CATS).map(cat => {
            const rows = feats.filter(f => f.cat === cat).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
            if (!rows.length) return '';
            return `<div class="rm-cat" style="color:${CATS[cat].color}">
                    <span class="rm-cat-dot" style="background:${CATS[cat].color}"></span>${CATS[cat].label}
                    <span class="rm-cat-n">${rows.length}</span></div>
                ${rows.map(rowHtml).join('')}`;
        }).join('');

        host.innerHTML = `<div class="rm-chart">${overlay}${axis}${groups}</div>`;
    }

    // ── Onboarding sequence ─────────────────────────────────────────────────────

    function renderOnboarding() {
        const host = document.getElementById('rm-onboarding');
        if (!host) return;
        const rows = (_gd.featureSequence || []).filter(r => r.feature);

        // Nhóm theo cluster; slot của cluster = priority preview (max), trong cluster: preview trước feature (pri 0).
        const groups = {};
        rows.forEach(r => {
            const key = r.cluster || `_${r.feature}`;
            (groups[key] = groups[key] || []).push({ name: r.feature, pri: parseInt(r.priority) || 0, cluster: r.cluster });
        });
        const ordered = Object.values(groups)
            .map(items => {
                const mx = Math.max(...items.map(i => i.pri));
                // preview (priority cao) hiện trước feature (priority 0); single priority-0 (Rating) xuống cuối
                return { items: items.sort((a, b) => b.pri - a.pri), key: mx === 0 ? Infinity : mx };
            })
            .sort((a, b) => a.key - b.key);

        let step = 0;
        const html = ordered.map(g => {
            const clustered = g.items.length > 1;
            const chips = g.items.map(it => {
                step++;
                return `<div class="rm-step" data-tip="Bước ${step}: ${humanize(it.name)}${it.cluster ? ' · cụm ' + it.cluster : ''}">
                    <span class="rm-step-no mono">${step}</span>
                    <span class="rm-step-ic">${iconOf(it.name)}</span>
                    <span class="rm-step-lb">${humanize(it.name)}</span>
                </div>`;
            }).join('<span class="rm-arrow">→</span>');
            return clustered
                ? `<div class="rm-cluster" title="Cụm ${g.items[0].cluster}">${chips}</div>`
                : chips;
        }).join('<span class="rm-arrow">→</span>');

        host.innerHTML = `<div class="rm-onb">${html}</div>`;
    }

    // ── Summary ──────────────────────────────────────────────────────────────────

    function renderSummary() {
        const feats = (_gd.unlockFeature || []);
        const levels = feats.map(r => parseInt(r.unlock_value) || 0);
        const byLevel = {};
        levels.forEach(l => { byLevel[l] = (byLevel[l] || 0) + 1; });
        const waveLevel = Object.entries(byLevel).sort((a, b) => b[1] - a[1])[0] || [0, 0];

        setText('rm-stat-features', feats.length);
        setText('rm-stat-range', `0–${Math.max(...levels)}`);
        setText('rm-stat-wave', `Lv${waveLevel[0]} (${waveLevel[1]})`);
        setText('rm-stat-onb', (_gd.featureSequence || []).filter(r => r.feature).length);
    }

    // ── Tooltip (dùng chung, đơn giản) ──────────────────────────────────────────

    let _tip = null;
    function bindTips(root) {
        if (!_tip) { _tip = document.createElement('div'); _tip.className = 'rm-tooltip'; document.body.appendChild(_tip); }
        root.querySelectorAll('[data-tip]').forEach(el => {
            el.addEventListener('mouseenter', e => { _tip.textContent = el.dataset.tip; _tip.style.display = 'block'; move(e); });
            el.addEventListener('mousemove', move);
            el.addEventListener('mouseleave', () => { _tip.style.display = 'none'; });
        });
        function move(e) {
            let x = e.clientX + 14, y = e.clientY + 14;
            if (x + _tip.offsetWidth > window.innerWidth - 8) x = e.clientX - _tip.offsetWidth - 14;
            _tip.style.left = Math.max(8, x) + 'px';
            _tip.style.top = y + 'px';
        }
    }

    function init() {
        if (!window.GameData) return;
        _gd = window.GameData;
        renderSummary();
        renderTimeline();
        renderOnboarding();
        bindTips(document.getElementById('roadmap'));
    }

    return { init };

})();

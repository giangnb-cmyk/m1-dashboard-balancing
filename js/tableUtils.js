/**
 * tableUtils.js — Shared helpers dùng chung cho tất cả sub-tabs.
 *
 * Exposed as global object: window.TableUtils
 */

const TableUtils = (() => {

    // ── DOM ───────────────────────────────────────────────────────────────────

    /** @param {string} id */
    function $(id) { return document.getElementById(id); }

    /** @param {string} id @param {string|number} val */
    function setText(id, val) {
        const el = $(id);
        if (el) el.textContent = val;
    }

    // ── UI Components ─────────────────────────────────────────────────────────

    /**
     * Tạo inline badge HTML.
     * @param {string} text
     * @param {string} bg   — background color
     * @param {string} border
     * @param {string} color — text color
     */
    function badge(text, bg, border, color) {
        return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:500;background:${bg};border:1px solid ${border};color:${color};">${text}</span>`;
    }

    /**
     * Format seconds thành chuỗi dễ đọc (s / m / h / d).
     * @param {string|number} sec
     */
    function formatTime(sec) {
        sec = Math.round(parseFloat(sec) || 0);
        if (!sec)        return '—';
        if (sec < 60)    return sec + 's';
        if (sec < 3600)  return Math.round(sec / 60) + 'm';
        if (sec < 86400) return (sec / 3600).toFixed(1) + 'h';
        return (sec / 86400).toFixed(1) + 'd';
    }

    // ── Select / Filter ───────────────────────────────────────────────────────

    /**
     * Đổ danh sách option vào <select>, giữ lại option đầu tiên ("Tất cả").
     * @param {string} id
     * @param {string[]} values
     */
    function fillSelect(id, values) {
        const sel = $(id);
        if (!sel) return;
        while (sel.options.length > 1) sel.remove(1);
        values.forEach(v => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = v;
            sel.appendChild(opt);
        });
    }

    /**
     * Gắn sự kiện input/change cho nhiều element ID cùng lúc.
     * @param {string[]} ids
     * @param {Function} handler
     */
    function bindFilters(ids, handler) {
        ids.forEach(id => {
            $(id)?.addEventListener('input', handler);
            $(id)?.addEventListener('change', handler);
        });
    }

    // ── Sorting ───────────────────────────────────────────────────────────────

    const NUMERIC_COLS = new Set([
        'id', 'merge_to', 'sell_price', 'sum_merge',
        'chain', 'energy', 'time', 'cost_energy', 'time_cooldown',
    ]);

    /**
     * Comparator dùng cho Array.sort — hỗ trợ cả numeric lẫn string.
     * @param {object} a @param {object} b
     * @param {string} key @param {boolean} asc
     */
    function sortByKey(a, b, key, asc) {
        let va = a[key] ?? '', vb = b[key] ?? '';
        if (NUMERIC_COLS.has(key)) {
            va = parseFloat(va) || 0;
            vb = parseFloat(vb) || 0;
            return asc ? va - vb : vb - va;
        }
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    }

    /**
     * Gắn click handler cho các <th data-sort> trong một table.
     * Cập nhật ký hiệu ↑↓ tự động.
     *
     * @param {string}   tableId
     * @param {Function} getSortState — () => { key, asc }
     * @param {Function} setSortState — (key, asc) => void
     * @param {Function} renderFn
     */
    function bindSort(tableId, getSortState, setSortState, renderFn) {
        const headers = document.querySelectorAll(`#${tableId} thead th[data-sort]`);
        headers.forEach(th => {
            th.addEventListener('click', () => {
                const { key } = getSortState();
                const newKey = th.getAttribute('data-sort');
                const newAsc = (key === newKey) ? !getSortState().asc : true;
                setSortState(newKey, newAsc);
                headers.forEach(h => { h.textContent = h.textContent.replace(/ [↑↓]$/, ''); });
                th.textContent += newAsc ? ' ↑' : ' ↓';
                renderFn();
            });
        });
    }

    // ── Table Render ──────────────────────────────────────────────────────────

    const MAX_ROWS = 2000;

    /**
     * Render tbody từ mảng rows đã có .html cache.
     * Giới hạn MAX_ROWS để tránh DOM quá lớn — hiển thị thông báo phía dưới.
     *
     * @param {string}   tbodyId
     * @param {object[]} rows   — mỗi phần tử phải có thuộc tính .html
     * @param {number}   colSpan
     */
    function renderRows(tbodyId, rows, colSpan) {
        const tbody = $(tbodyId);
        if (!tbody) return;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty">Không tìm thấy.</td></tr>`;
            return;
        }

        const slice = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows;
        let html = slice.map(r => r.html).join('');

        if (rows.length > MAX_ROWS) {
            html += `<tr><td colspan="${colSpan}" class="table-overflow-msg">... và ${(rows.length - MAX_ROWS).toLocaleString()} items nữa — thu hẹp bộ lọc.</td></tr>`;
        }

        tbody.innerHTML = html;
    }

    // ── Sub-tab Navigation ────────────────────────────────────────────────────

    /**
     * Khởi tạo sub-tab navigation cho .encyc-sub-tab / .encyc-subtab-content.
     */
    function initSubTabs() {
        document.querySelectorAll('.encyc-sub-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.encyc-sub-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.encyc-subtab-content').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById(btn.getAttribute('data-subtab'));
                if (panel) panel.classList.add('active');
            });
        });
    }

    // ── Chain counter ─────────────────────────────────────────────────────────

    /**
     * Factory tạo chain counter — tăng chain khi type thay đổi.
     * Dùng khi map() qua rows theo thứ tự CSV (fill-down đã áp dụng).
     *
     * @returns {{ count: (type: string) => number }}
     */
    function createChainCounter() {
        let chain = 0, lastType = '';
        return {
            count(type) {
                if (type && type !== lastType) { chain++; lastType = type; }
                return chain;
            },
        };
    }

    // ── Sell badge ────────────────────────────────────────────────────────────

    /**
     * Render ký hiệu ✓ / ✗ cho cột "Bán được".
     * @param {string} rawVal — giá trị can_sell từ CSV
     */
    function sellBadge(rawVal) {
        if (!rawVal) return '';
        return (rawVal).toUpperCase() === 'TRUE'
            ? `<span style="color:var(--success)">✓</span>`
            : `<span style="color:var(--danger)">✗</span>`;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {
        $, setText,
        badge, formatTime,
        fillSelect, bindFilters,
        sortByKey, bindSort,
        renderRows,
        initSubTabs,
        createChainCounter,
        sellBadge,
    };

})();

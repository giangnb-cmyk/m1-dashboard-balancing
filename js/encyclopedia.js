/**
 * encyclopedia.js — Tab 8: Item Encyclopedia
 * Searchable, filterable table của toàn bộ items từ ItemIdentify.
 */
const Encyclopedia = (() => {

  const ITEM_SOURCES = [
    { key: 'itemMerge',     label: 'Merge Items',  tag: 'tag-blue'  },
    { key: 'itemGenerator', label: 'Generator',    tag: 'tag-green' },
    { key: 'itemTool',      label: 'Tool',         tag: 'tag-gold'  },
    { key: 'itemBooster',   label: 'Booster',      tag: 'tag-gem'   },
    { key: 'itemFood',      label: 'Food / Drink', tag: 'tag-green' },
    { key: 'itemCurrency',  label: 'Currency',     tag: 'tag-gold'  },
    { key: 'itemChest',     label: 'Chest',        tag: 'tag-gray'  },
  ];

  let allItems = [];
  let filteredItems = [];
  let currentPage = 0;
  const PAGE_SIZE = 50;

  // --- Build unified item list ---

  function buildItemList(db) {
    const items = [];
    ITEM_SOURCES.forEach(src => {
      const rows = db[src.key] || [];
      rows.forEach(row => {
        if (!row.id) return;
        items.push({
          id:        row.id,
          name:      row.name_item || '—',
          type:      row.type || '—',
          source:    src.label,
          sourceTag: src.tag,
          mergeTo:   row.merge_to || '',
          initTime:  row.init_time || '',
          sellPrice: row.sell_price || '',
          sumMerge:  row.sum_merge || '',
          canSell:   row.can_sell || '',
        });
      });
    });
    return items.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  }

  // --- Filter logic ---

  function applyFilter(query, typeFilter, sourceFilter) {
    const q = query.toLowerCase().trim();
    filteredItems = allItems.filter(item => {
      const matchQuery = !q
        || item.name.toLowerCase().includes(q)
        || item.id.includes(q)
        || item.type.toLowerCase().includes(q);
      const matchType   = !typeFilter   || item.type === typeFilter;
      const matchSource = !sourceFilter || item.source === sourceFilter;
      return matchQuery && matchType && matchSource;
    });
    currentPage = 0;
    renderTable();
    renderPagination();
  }

  // --- Render ---

  function renderTable() {
    const tbody = document.getElementById('encyclopedia-tbody');
    if (!tbody) return;

    const start = currentPage * PAGE_SIZE;
    const page  = filteredItems.slice(start, start + PAGE_SIZE);

    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#475569">No items found</td></tr>`;
      return;
    }

    tbody.innerHTML = page.map(item => `
      <tr>
        <td class="mono" style="color:#475569">${item.id}</td>
        <td class="primary">${item.name}</td>
        <td class="text-secondary text-sm">${item.type}</td>
        <td><span class="tag ${item.sourceTag}">${item.source}</span></td>
        <td class="mono text-xs">${item.mergeTo || '—'}</td>
        <td class="mono text-xs">${item.sumMerge || '—'}</td>
        <td class="mono text-xs">${item.initTime ? item.initTime + 's' : '—'}</td>
        <td class="mono accent-gold text-xs">${item.sellPrice || '—'}</td>
      </tr>
    `).join('');
  }

  function renderPagination() {
    const wrap = document.getElementById('encyclopedia-pagination');
    if (!wrap) return;

    const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
    const info = document.getElementById('encyclopedia-count');
    if (info) info.textContent = `${filteredItems.length.toLocaleString()} items`;

    wrap.innerHTML = '';
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-secondary btn-sm';
    prevBtn.textContent = '← Prev';
    prevBtn.disabled = currentPage === 0;
    prevBtn.addEventListener('click', () => { currentPage--; renderTable(); renderPagination(); });

    const pageInfo = document.createElement('span');
    pageInfo.style.cssText = 'font-family:var(--font-mono);font-size:11px;color:#475569;padding:0 12px';
    pageInfo.textContent = `${currentPage + 1} / ${totalPages}`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-secondary btn-sm';
    nextBtn.textContent = 'Next →';
    nextBtn.disabled = currentPage >= totalPages - 1;
    nextBtn.addEventListener('click', () => { currentPage++; renderTable(); renderPagination(); });

    wrap.append(prevBtn, pageInfo, nextBtn);
  }

  function populateTypeFilter(db) {
    const sel = document.getElementById('filter-type');
    if (!sel) return;
    const types = [...new Set(allItems.map(i => i.type))].sort();
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      sel.appendChild(opt);
    });
  }

  function populateSourceFilter() {
    const sel = document.getElementById('filter-source');
    if (!sel) return;
    ITEM_SOURCES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.label; opt.textContent = s.label;
      sel.appendChild(opt);
    });
  }

  function bindEvents() {
    const search  = document.getElementById('encyclopedia-search');
    const fType   = document.getElementById('filter-type');
    const fSource = document.getElementById('filter-source');

    const refresh = () => applyFilter(
      search?.value || '',
      fType?.value || '',
      fSource?.value || '',
    );

    search?.addEventListener('input', refresh);
    fType?.addEventListener('change', refresh);
    fSource?.addEventListener('change', refresh);
  }

  function renderSummaryStats() {
    const bySource = {};
    allItems.forEach(i => { bySource[i.source] = (bySource[i.source] || 0) + 1; });
    const el = document.getElementById('stat-total-items');
    if (el) el.textContent = allItems.length.toLocaleString();
  }

  function init(db) {
    allItems     = buildItemList(db);
    filteredItems = [...allItems];

    populateTypeFilter(db);
    populateSourceFilter();
    bindEvents();
    renderSummaryStats();
    renderTable();
    renderPagination();
  }

  return { init };
})();

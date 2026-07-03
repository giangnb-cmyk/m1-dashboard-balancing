---
name: dashboard-design-system
description: >-
  Design system của Merge Cooking Balance Dashboard — design tokens, typography scale,
  component recipes (glass card, stat card, data table, sub-tabs, badge, filter bar),
  quy trình thêm tab mới, và convention Chart.js. BẮT BUỘC dùng skill này mỗi khi
  làm bất kỳ việc gì đụng tới UI của dashboard: thêm tab/sub-tab mới, thêm bảng,
  chart, panel, form, nút bấm, sửa layout, sửa CSS, hay khi user nói "làm tab",
  "thêm màn", "hiển thị", "vẽ chart", "đồng bộ style", "cho giống các tab khác".
  Kể cả khi chỉ thêm một cột vào bảng có sẵn — đọc skill để dùng đúng class thay vì
  viết CSS/inline style mới.
---

# Dashboard Design System — Merge Cooking Balance

Premium Dark Theme + Glassmorphism. Mọi giá trị dưới đây lấy từ `styles.css` (nguồn sự thật).
Nguyên tắc số 1: **tái dùng class có sẵn, không phát minh style mới**. `styles.css` đã ~4800 dòng
với đầy đủ utility class — trước khi viết CSS mới, grep `styles.css` xem class tương tự đã tồn tại chưa.

## 1. Design Tokens (CSS variables — LUÔN dùng var, không hardcode hex)

| Variable | Giá trị | Dùng cho |
|---|---|---|
| `--primary` | `#6366f1` (indigo) | Active states, primary buttons, focus, highlight |
| `--primary-dark` | `#4f46e5` | Hover của primary |
| `--accent` | `#f59e0b` (amber) | Version tag, điểm nhấn phụ |
| `--bg-dark` | `#0f172a` | Body background |
| `--bg-darker` | `#020617` | Lớp sâu nhất (modal backdrop…) |
| `--card-bg` | `rgba(30,41,59,0.7)` | Glass card — **0.7, không phải 0.45** |
| `--sidebar-bg` | `#1e293b` | Sidebar, sticky table header |
| `--text-main` | `#f8fafc` | Text chính |
| `--text-muted` | `#94a3b8` | Label, subtitle, th |
| `--border` | `rgba(255,255,255,0.1)` | Mọi đường viền |
| `--glass` | `rgba(255,255,255,0.05)` | Hover bg, nút phụ, input bg |
| `--gold` | `#fbbf24` | Tiền / gold |
| `--energy` | `#38bdf8` | Energy (sky blue — KHÔNG phải primary) |
| `--exp` | `#c084fc` | EXP / purple |
| `--success` | `#22c55e` | OK / dương |
| `--warning` | `#f59e0b` | Cảnh báo |
| `--danger` | `#ef4444` | Lỗi / âm |

Lưu ý hay nhầm: màu active/primary của dashboard là **indigo `#6366f1`**, không phải xanh da trời.
`#38bdf8` chỉ dành cho energy và data series.

## 2. Typography

Fonts load qua Google Fonts CDN trong `index.html`:
- **Outfit** — headings (h1–h4), `.nav-text`, nút sub-tab. Weight 500–800.
- **Inter** — body mặc định (set ở `*`). Weight 400–500.
- **JetBrains Mono** — MỌI con số, item ID, metric. Thêm class `mono` cho span số liệu
  (vd `<span class="stat-value mono">`). Đừng để số render bằng Inter.

### Font-size scale (rem — đúng giá trị trong styles.css)

| Element | Size | Ghi chú |
|---|---|---|
| `.view-header h1` | `1.8rem` | Kèm emoji đầu dòng: `🗃️ Game Data Hub` |
| `.view-header p` | `0.95rem` | muted |
| Section title `h3` (`.table-header h3`) | `1.1rem` | |
| `.main-sub-tab` | `0.95rem` | Outfit 500 |
| `.encyc-sub-tab` / `.nav-item` | `0.9rem` | |
| `.stat-value` | `1.5rem` | bold 700, Mono |
| Big metric (`.pacing-value`) | `2.5rem` | 800, Mono, màu primary |
| `td` / `.inline-edit` / label | `0.85rem` | |
| `th` | `0.75rem` | **uppercase**, muted |
| `.stat-label`, `.btn-sm`, msg phụ | `0.8rem` | |
| `.filter-group`, `.result-count` | `0.82rem` | |
| Hint / version tag | `0.7rem` | |

Không dùng px cho font. Không đặt size ngoài scale này nếu không có lý do.

## 3. Component Recipes

### Glass card — khối nội dung mặc định
```html
<div class="glass"> ... </div>
```
`.glass` = `--card-bg` + `backdrop-filter: blur(10px)` + border `--border` + radius `16px` + padding `1.5rem`.
Mọi panel/table/chart đều bọc trong `.glass`. Card bảng dùng `class="data-table-card glass"` (có margin-bottom 2rem).

### Stats row + stat card
```html
<div class="stats-row"> <!-- mặc định repeat(4,1fr); đổi số cột bằng style="grid-template-columns:repeat(5,1fr)" -->
  <div class="stat-card glass">
    <span class="stat-icon">💰</span>
    <div class="stat-info">
      <span class="stat-value mono" id="stat-x">0</span>
      <span class="stat-label">Total Cost</span>
    </div>
  </div>
</div>
```
Icon = emoji `2rem`. Variant màu: `.stat-card.highlight-gold/-exp/-energy/-gem` đã có sẵn.

### Data table
```html
<div class="data-table-card glass">
  <div class="table-header">
    <h3>📋 Tên bảng</h3>
    <div class="table-actions"><button class="btn-sm">Export</button></div>
  </div>
  <div class="table-container">   <!-- max-height 400px + overflow-y -->
    <table class="data-table" id="my-table">
      <thead><tr><th data-sort="name">Name</th>...</tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>
```
- `th` sticky sẵn (background `--sidebar-bg`). Chỉ kẻ ngang, không kẻ dọc.
- `th[data-sort]` → cursor pointer + hover primary (sort logic ở `js/tableUtils.js`).
- Hàng tổng: `<tr class="total-row">`. Trống: `<tr><td class="table-empty" colspan=N>`.
- Số trong cell: bọc `<span class="mono">`.

### Sub-tabs (2 cấp)
- **Cấp 1 trong tab** — `.main-sub-tabs` > `.main-sub-tab` (`data-panel="panel-x"`) + `.main-subtab-content`.
  Active = tint `rgba(99,102,241,0.2)` + border primary. Wiring sẵn trong `TableUtils.initMainSubTabs()`.
- **Cấp 2** — `.encyc-sub-tabs` > `.encyc-sub-tab` (`data-subtab="subtab-x"`) + `.encyc-subtab-content`.
  Active = **solid** `--primary`.
- Nút sub-tab luôn có emoji đầu label.

### Buttons
| Class | Dùng khi |
|---|---|
| `.btn-primary` | Hành động chính (solid indigo, radius 8px, hover translateY(-1px)) |
| `.btn-sm` | Hành động phụ trên bảng/toolbar (glass bg, radius 6px, 0.8rem) |
| `.btn-action` (+`.primary`) | Nút full-width ở sidebar footer |
| `.btn-icon-sm` | Nút chỉ icon |

### Badge & tip
```html
<span class="badge ok">OK</span> <span class="badge warn">Thiếu</span>
<div class="tip-item warning">…</div>  <!-- success / warning / info: left-border 3px màu tương ứng -->
```
Badge = tint 10% màu + text màu đó, radius 4px, `0.75rem`.

### Filter bar
```html
<div class="filter-bar glass">
  <div class="filter-group"><label>Tìm kiếm</label><input ...></div>
  <span class="result-count">169 items</span>  <!-- margin-left:auto -->
</div>
```

## 4. Thêm tab mới — checklist đầy đủ

1. **Nav button** trong `index.html` sidebar (`.side-nav`):
   ```html
   <button class="nav-item" data-tab="my-tab">
     <span class="nav-icon">🧮</span><span class="nav-text">Tên Tab</span>
   </button>
   ```
2. **Section** trong `.tab-scroller` — `id` PHẢI trùng `data-tab`:
   ```html
   <section id="my-tab" class="tab-view">
     <div class="view-header">
       <h1>🧮 Tên Tab</h1>
       <p>Một câu mô tả tab làm gì (tiếng Việt, muted).</p>
     </div>
     ...
   </section>
   ```
3. **JS module** `js/myTab.js` theo module pattern của project:
   ```js
   const MyTab = (() => {
     function init() { /* đọc window.GameData / ProcessedData, render */ }
     return { init };
   })();
   ```
   Tái dùng helper trong `js/tableUtils.js` (global `TableUtils`) thay vì viết lại:
   `setText`, `badge(text,bg,border,color)`, `formatTime`, `fillSelect`, `bindFilters`,
   `sortByKey`, `bindSort`, `renderRows`, `sellBadge`. Sort bảng = `th[data-sort]` + `bindSort`.
4. **Đăng ký**: thêm `<script src="js/myTab.js">` vào `index.html` (sau các file data)
   và thêm dòng `if (typeof MyTab !== 'undefined') MyTab.init();` vào `initModules()` trong `js/app.js`
   (để tab hoạt động lại sau khi user Import CSV → `reloadGameData`).
5. **CSS mới (nếu thật sự cần)**: append cuối `styles.css` với comment kiểu
   `/* ── My Tab ───────────────────────── */`, chỉ dùng var tokens, prefix class theo tab
   (vd `.mytab-…`) để tránh đụng tên.
6. Nav switching + fadeIn (`translateY 8px→0, 0.3s`) tự chạy — KHÔNG viết lại logic tab.

Text UI: tiếng Việt cho mô tả/label nghiệp vụ, giữ tiếng Anh cho thuật ngữ game (Generator, Order, Batch, Energy). Tiêu đề luôn có emoji.

## 5. Chart.js conventions

- Defaults đã set trong `app.js`: `Chart.defaults.color='#f1f5f9'`, `borderColor='rgba(255,255,255,0.06)'` — không set lại grid màu sáng.
- Canvas bọc trong `.glass`; đặt height bằng wrapper div, không hardcode attribute.
- Palette data series (thứ tự ưu tiên): `#38bdf8`, `#f87171`, `#a78bfa`, `#34d399` (profile colors của Player Sim); mở rộng: `#fbbf24`, `#60a5fa`, `#c084fc`, `#fb923c`.
- Series gắn nghĩa tiền tệ dùng đúng token: gold=`#fbbf24`, energy=`#38bdf8`, exp=`#c084fc`, gem/danger=`#ef4444`.
- Fill dưới line: màu series + alpha hex `'22'`/`'18'` (vd `color + '22'`).
- Destroy chart cũ trước khi vẽ lại canvas (xem `reloadGameData` trong app.js) — tránh lỗi "Canvas is already in use".

## 6. Do / Don't

- ✅ Dùng class có sẵn + var tokens; grep styles.css trước khi thêm CSS.
- ✅ Số liệu = Mono (`.mono`); th = uppercase 0.75rem; emoji ở heading & nút.
- ✅ Bảng dài: bọc `.table-container`, giữ sticky header.
- ✅ Trong HTML sinh từ JS (template string, tham số `badge()`…), màu cũng phải là `var(--token)` —
  đừng gõ lại hex (`'#38bdf8'` → `'var(--energy)'`). Chỉ chart dataset (Chart.js cần hex thật) mới dùng hex palette.
- ❌ Không hardcode hex đã có token; không dùng `#38bdf8` làm màu active/primary.
- ❌ Không inline style layout/size trừ 2 lệ có sẵn: override số cột grid (`grid-template-columns`)
  và wrapper `height` cho canvas chart. Inline `color:var(--…)` một-lần trong cell JS-generated là chấp nhận được;
  inline font-size ngoài scale thì không.
- ❌ Không thêm framework/CSS lib — project là vanilla thuần, không bundler.
- ❌ Không đổi opacity glass (0.7) hay đổi active nav thành tint — active nav là **solid indigo + glow** `0 4px 15px rgba(99,102,241,0.3)`.

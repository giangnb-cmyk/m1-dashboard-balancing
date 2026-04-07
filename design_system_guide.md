# Merge Cooking Dashboard - Design System & Style Guide

This document defines the complete design style (UI/UX) of the current Dashboard. You can use this document as **Prompt Context** for AI or as a Guideline for Developers to build other websites with the exact same style.

---

## 1. Design Philosophy
- **Style:** Premium Dark Theme, Modern, Tech-driven.
- **Key Characteristics:** Glassmorphism (frosted glass effect), Mesh Gradient background, Glow shadow interactions, ultra-thin borders.
- **Vibe:** Premium, Professional, Futuristic, Crystal clear data readability.
- **Reference implementation:** `D:\Project\m1-balancing\dashboard-v3`

---

## 2. Color Palette

### Core Backgrounds
- **Primary Background (Body):** `#0f172a` (Slate 900)
- **Darker Background:** `#020617` (for deepest layers)
- **Sidebar / Card Background:** `#1e293b` (Slate 800)
- **Glass Card Background:** `rgba(30, 41, 59, 0.7)` — slightly opaque dark slate
- **Mesh Gradient (Dynamic Background):** Indigo (`#6366f1` at 8%), Amber (`#f59e0b` at 6%) — subtle radial gradients at corners

### Accent Colors
- **Primary / Indigo:** `#6366f1` — Active states, primary buttons, focus borders, highlights
- **Primary Dark:** `#4f46e5` — Hover state of primary
- **Gold / Currency:** `#fbbf24`
- **Energy / Sky Blue:** `#38bdf8`
- **Exp / Purple:** `#c084fc`
- **Success / Green:** `#22c55e`
- **Warning / Amber:** `#f59e0b`
- **Danger / Red:** `#ef4444`

### Text Colors
- **Primary Text:** `#f8fafc` — Bright white, high contrast
- **Muted Text:** `#94a3b8` — Slate blue-gray, for labels, subtitles, table headers

### Border
- **Standard Border:** `rgba(255, 255, 255, 0.1)` — ultra-thin white
- **Glass Border (lighter):** `rgba(255, 255, 255, 0.08)`

---

## 3. Typography

- **Headings (h1–h4, nav labels):** `Outfit`, sans-serif — Weights: 600, 700, 800. Rounded, modern, futuristic feel.
- **Body Content:** `Inter`, sans-serif — Weights: 400, 500. Optimal readability at `0.85rem`–`1rem`.
- **Numbers / IDs / Code:** `JetBrains Mono`, monospace — Always use for digits, item IDs, metric values.

### Font Size Scale (rem-based)
| Element | Size |
|---|---|
| View header h1 | `1.8rem` |
| View header description | `0.95rem` |
| Sidebar nav item | `0.9rem` |
| Section title (h3) | `1.1rem` |
| Stat value | `1.5rem` (bold, Mono) |
| Stat label | `0.8rem` |
| Table cell | `0.85rem` |
| Table header (th) | `0.75rem` uppercase |
| Badge / tag | `0.75rem`–`0.8rem` |
| Config label / hint | `0.85rem` / `0.7rem` |

---

## 4. UI Components & CSS

### Glass Card `.glass`
Every content block (Card, Table, Panel) uses frosted glass on dark background:
```css
background: rgba(30, 41, 59, 0.7);
backdrop-filter: blur(10px);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 16px;
padding: 1.5rem;
```

### Mesh Gradient Background
```css
.bg-premium {
    position: fixed; top: 0; left: 0;
    width: 100%; height: 100%; z-index: -1;
    background:
        radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(245, 158, 11, 0.06) 0%, transparent 40%),
        #0f172a;
}
```

### Tab Fade-In Animation
Every tab view animates in on switch:
```css
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
.tab-view.active { animation: fadeIn 0.3s ease; }
```

### Sidebar Navigation
- Width: `280px`, background `#1e293b`, fixed position
- Nav item: `padding: 0.9rem 1rem`, `border-radius: 10px`, `font-size: 0.9rem`
- **Hover:** `background: rgba(255,255,255,0.05)` + text white
- **Active:** `background: #6366f1` (solid indigo) + `color: white` + `box-shadow: 0 4px 15px rgba(99,102,241,0.3)` — **NOT a tint, full solid fill**

```css
.nav-item.active {
    background: var(--primary);   /* #6366f1 */
    color: white;
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
}
```

### Primary Button `.btn-primary`
```css
background: #6366f1;
border: none;
color: white;
padding: 0.75rem 1.5rem;
border-radius: 8px;
font-weight: 600;
transition: all 0.2s;
/* hover: background: #4f46e5; transform: translateY(-1px); */
```

### Small Button `.btn-sm`
```css
background: rgba(255,255,255,0.05);
border: 1px solid rgba(255,255,255,0.1);
color: #f8fafc;
padding: 0.4rem 0.8rem;
border-radius: 6px;
font-size: 0.8rem;
```

### Stat Cards
```html
<div class="stat-card glass">
    <span class="stat-icon">💰</span>   <!-- font-size: 2rem -->
    <div class="stat-info">
        <span class="stat-value">5,000</span>   <!-- 1.5rem, JetBrains Mono, bold -->
        <span class="stat-label">Total Cost</span>  <!-- 0.8rem, muted -->
    </div>
</div>
```
- Grid: `repeat(4, 1fr)` at `1.25rem` gap
- Card hover: slight translateY up (optional)

### Data Tables `.data-table`
```css
th { font-size: 0.75rem; text-transform: uppercase; color: #94a3b8;
     padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1);
     position: sticky; top: 0; background: #1e293b; }
td { font-size: 0.85rem; padding: 0.75rem;
     border-bottom: 1px solid rgba(255,255,255,0.1); }
tr:hover { background: rgba(255,255,255,0.02); }
```
- Wrap in `.table-container` with `max-height` + `overflow-y: auto`
- No vertical borders — only horizontal row separators

### Badges
```css
.badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
.badge.ok   { background: rgba(34,197,94,0.1);  color: #22c55e; }
.badge.warn { background: rgba(245,158,11,0.1); color: #f59e0b; }
```

### Inline Editable Fields `.inline-edit`
```css
background: transparent;
border: 1px solid transparent;
color: #f8fafc;
padding: 0.25rem 0.5rem;
border-radius: 4px;
/* hover: border-color: rgba(255,255,255,0.1) */
/* focus: border-color: #6366f1; background: rgba(99,102,241,0.1) */
```

### Alert / Tip Items
Left-border colored strip on dark card:
```css
.tip-item { padding: 1rem; border-radius: 8px; background: rgba(0,0,0,0.2); }
.tip-item.success { border-left: 3px solid #22c55e; }
.tip-item.warning { border-left: 3px solid #f59e0b; }
.tip-item.info    { border-left: 3px solid #38bdf8; }
```

### Pacing / Metric Cards
```css
.pacing-card { text-align: center; padding: 1.5rem; background: rgba(0,0,0,0.2); border-radius: 12px; }
.pacing-card.primary {
    background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05));
    border: 1px solid rgba(99,102,241,0.3);
}
.pacing-value { font-size: 2.5rem; font-weight: 800; font-family: 'JetBrains Mono'; color: #6366f1; }
```

---

## 5. Layout Pattern

### Standard View Layout
1. **Sidebar (Left):** Fixed, `280px` wide — Logo header + Tab Nav + optional Footer actions
2. **Top Bar:** `65px` tall, sticky, `backdrop-filter: blur(10px)` — Context selector + status indicator
3. **Main Content (`.tab-scroller`):** `flex:1`, `padding: 2rem`, `overflow-y: auto`
4. Each tab view has a **`.view-header`** with `h1` (`1.8rem`) and description `p` (`0.95rem`, muted)

### Grid & Spacing
- Stats row: `repeat(4, 1fr)` at `gap: 1.25rem`
- Config / distribution grids: `repeat(4, 1fr)` at `gap: 1rem`–`1.5rem`
- Section margin-bottom: `2rem`
- Panel padding: `1.5rem`

### Scrollbar
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
```

---

## 6. How to Reuse

When prompting an AI or briefing a developer, provide this document and state:

> *"Design the XYZ page following the Design System below exactly. Use the color palette, typography scale (rem-based), component CSS, and layout pattern as specified. The active nav item must use solid `#6366f1` indigo fill with glow shadow — not a tint."*

Attach `styles.css` for exact values. Key things to enforce:
- **Active nav = solid indigo**, not a blue tint
- **Glassmorphism opacity = 0.7** (not 0.45 — needs to be readable on dark bg)
- **Font sizes in `rem`**, base body ~`0.9rem`–`1rem`
- **Tab switch = fadeIn + translateY(8px→0) animation**

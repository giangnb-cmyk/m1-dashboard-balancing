# Tech Stack

## Overview

A single-page web dashboard for game balance analysis. No build tools, no framework — plain browser-native stack deployed on Vercel.

---

## Frontend

| Layer | Technology | Notes |
|-------|-----------|-------|
| Markup | HTML5 | `index.html`, `lang="vi"` |
| Styling | CSS3 (vanilla) | `styles.css` — custom properties, flexbox/grid, glassmorphism |
| Logic | JavaScript ES6+ (vanilla) | Module pattern via global objects (`const SimulationEngine = {...}`) |
| Charts | [Chart.js](https://www.chartjs.org/) (CDN) | `cdn.jsdelivr.net/npm/chart.js` |
| Fonts | Google Fonts (CDN) | Outfit, Inter, JetBrains Mono |

**No framework, no bundler, no transpiler.** All JS files are loaded via `<script>` tags in `index.html`.

---

## Architecture

### File Roles

```
index.html            Entry point + UI markup (tabs, forms, tables)
styles.css            All visual styling
app.js                Main controller: state, navigation, event listeners, EC calculation
```

## Browser Compatibility

Targets modern evergreen browsers (Chrome, Firefox, Edge). Uses:
- `const` / `let`, arrow functions, template literals, destructuring (ES6+)
- `Set`, `Map` (ES6)
- `fetch` API (for any async operations)
- CSS custom properties (`var(--*)`)
- CSS Grid + Flexbox

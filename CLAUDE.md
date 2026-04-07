# CLAUDE.md

## Project Context

Plain HTML5 + CSS3 (vanilla) + JavaScript ES6+ (vanilla). No framework, no bundler, no transpiler.
Single-page game balance dashboard for a merge cooking mobile game. Loads CSV data from `Csv/` folder via `fetch`. Deployed as static files.

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Markup | HTML5 | `index.html`, entry point + all tab markup |
| Styling | CSS3 (vanilla) | `styles.css` — glassmorphism dark theme, CSS custom properties |
| Logic | JavaScript ES6+ (vanilla) | Module pattern via global objects (`const Engine = {...}`) |
| Charts | Chart.js (CDN) | `cdn.jsdelivr.net/npm/chart.js` |
| Fonts | Google Fonts (CDN) | Outfit, Inter, JetBrains Mono |

### File Structure

```
index.html          Entry point + UI markup (tabs, tables, charts)
styles.css          All visual styling (glassmorphism dark theme)
app.js              Main controller: state, navigation, tab routing
js/
├── csv-loader.js   CSV fetch + parse utilities
├── pacing.js       Tab 2: Progression Pacing engine
├── economy.js      Tab 5: Economy Flow / Source-Sink
├── encyclopedia.js Tab 8: Item Encyclopedia search/filter
└── [tab].js        One file per tab
Csv/                Game data (CSV files, never modified by dashboard)
```

### Design System

Premium Dark Theme — Glassmorphism. Full spec in `design_system_guide.md`.
- Background: `#0f172a` | Glass cards: `rgba(30,41,59,0.45)` + `backdrop-filter:blur(12px)`
- Accent Blue: `#38bdf8` | Gold: `#fbbf24` | Text: `#f8fafc` / `#94a3b8`
- Fonts: Outfit (headings) · Inter (body) · JetBrains Mono (numbers/IDs)

### Player Profiles (for pacing calculations)

| Profile | Sessions/day | Use case |
|---------|-------------|----------|
| Hardcore | 8 | Upper bound |
| Mid-core | 4 | Target |
| Casual | 1.5 | Lower bound |

---

## Coding Standards

### SOLID Principles

**Single Responsibility** — One class/function, one job. If a file exceeds ~200 lines, split it. Names must reflect exact purpose.

**Open/Closed** — Open for extension, closed for modification. Add new behavior by creating new classes/hooks, not editing existing ones.

**Liskov Substitution** — Subtypes must be substitutable for their base. Prefer composition over inheritance.

**Interface Segregation** — Small, focused interfaces (3–5 methods max). Don't force a class to implement what it doesn't use.

**Dependency Inversion** — Depend on abstractions, not concretions. Inject dependencies via constructor or props; never hardcode.

### Design Patterns

Use patterns when they solve a real problem, not by default.

| Pattern | When to use |
|---------|------------|
| **Factory** | Creating objects without exposing init logic |
| **Builder** | Objects with >4 optional params |
| **Singleton** | Only for truly global resources (DB, logger) |
| **Adapter** | Integrating 3rd-party or legacy code |
| **Facade** | Simplifying a complex subsystem |
| **Repository** | Separating data access from business logic |
| **Strategy** | Swappable algorithms |
| **Observer** | Event-driven / reactive patterns |
| **State** | Object behavior changes based on internal state |

### Functions

- Max **20–30 lines** per function
- Max **3–4 parameters** — use an options object if more are needed
- Single level of abstraction per function
- **Early return** / guard clauses at the top to avoid deep nesting
- Pure logic separated from side effects (makes testing easy)

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Components / Classes | PascalCase, noun | `ProjectSelector`, `TaskRepository` |
| Functions / methods | camelCase, verb | `getTasksByWeek`, `handleImport` |
| Variables | camelCase, descriptive | `activeProjectId`, `taskCount` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_BATCH_SIZE` |
| Booleans | `is/has/can/should` prefix | `isLoading`, `hasPermission` |

### File Structure

```
src/
├── contexts/       # AuthContext, ProjectContext
├── hooks/          # useProjects, useFeatures, useTasks
├── components/     # UI components (one component per file)
├── types.ts        # All TypeScript interfaces/types
├── firebase.ts     # Firebase init and exports
└── App.tsx         # Routing/provider shell only
```

### Comments

- Comment **why**, not what — code should be self-documenting
- JSDoc for exported functions and hooks
- TODO comments must include a ticket/phase reference: `// TODO(Phase 3): add image deletion`

---

## Performance

- **No object creation inside loops** — extract outside or memoize
- **Cleanup `onSnapshot` listeners** — always `return unsub` in `useEffect`; missing cleanup = Firestore cost leak
- **`useMemo`/`useCallback`** for derived state and stable callbacks passed to children
- **Batch Firestore writes** — use `writeBatch` for bulk operations; max 499 ops per batch
- **Pagination** for lists that can grow unboundedly

---

## Error Handling

- Validate inputs early (fail fast)
- Never silently swallow errors — log with full context
- Custom error types for domain errors (import failure, permission denied)
- Show user-facing messages for expected failures; log full stack for unexpected ones

---

## Firebase-Specific Rules

- **Never expose API keys** (Notion, Gemini) in client bundle — use server-side routes for sensitive keys
- **Security rules deploy with code** — never ship subcollection queries without updated Firestore rules
- **Store `storagePath`** alongside `downloadUrl` for every uploaded file (needed for deletion)
- **Reset state to `[]`** synchronously when `activeProjectId` changes before new listeners attach

---

## Response Format

When implementing:
1. State the chosen approach and pattern briefly
2. Highlight important decisions in code comments
3. Call out performance concerns if any
4. Suggest alternatives when a simpler solution exists

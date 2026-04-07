# Merge Cooking Dashboard - Design System & Style Guide

This document defines the complete design style (UI/UX) of the current Dashboard. You can use this document as **Prompt Context** for AI or as a Guideline for Developers to build other websites with the exact same style.

---

## 1. Design Philosophy
- **Style:** Premium Dark Theme, Modern, Tech-driven.
- **Key Characteristics:** Glassmorphism (frosted glass effect), Mesh Gradient (dynamic animated background), Glow shadow interactions, Borderless or ultra-thin borders.
- **Vibe:** Premium, Professional, Futuristic, Crystal clear data readability.

---

## 2. Color Palette

### 🔴 Core Backgrounds
- **Primary Background (Body):** Deep dark - `#0f172a` (Slate 900)
- **Secondary Background (Sidebar/Header):** `#1e293b` (Slate 800) with adjusted opacity
- **Mesh Gradient (Dynamic Background):** Blue (`#38bdf8`), Purple (`#818cf8`), and Pink (`#f472b6`) at very low opacity (5-15%).

### 🟢 Accent Colors & Highlights (For Metrics/Buttons)
- **Primary / Accent Blue:** `#38bdf8` (For Active states, Primary buttons, Focus borders).
- **Gold / Currency:** `#fbbf24` (For Gold highlights, Warnings).
- **Energy:** `#60a5fa` (For Energy highlights).
- **Exp / Experience:** `#a78bfa` (For Exp/Level highlights).
- **Gem / Premium:** `#818cf8` or `#c084fc`.

### ⚪ Text Colors
- **Primary Text:** `#f8fafc` (Bright white, high contrast).
- **Secondary Text:** `#94a3b8` (Slate blue gray, for descriptions, subtitles).

---

## 3. Typography

- **Headings:** `Outfit`, sans-serif (Font Weights: 500, 600, 700). Creates a rounded, modern, and futuristic look.
- **Body Content:** `Inter`, sans-serif (Font Weights: 400, 500). The standard system font for optimal readability of texts and data.
- **Numbers / ID / Code:** `JetBrains Mono`, monospace. Always use for digits, Item IDs, and metric data to ensure professional alignment and readability.

---

## 4. UI Components & CSS System

### 🪟 Glassmorphism Background
Any content block (Card, Table, Panel) must be wrapped in a frosted glass effect on a dark background.
- **Required Class:** `.glass`
- **CSS Definition:** 
  ```css
  background: rgba(30, 41, 59, 0.45);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
  border-radius: 16px;
  ```

### 🔲 Buttons
Use smooth transitions (translateY) on mouse hover. Avoid sharp borders.
- **Primary Button:** `.btn-primary` (Blue background `#38bdf8`, dark text `#0f172a`, with a glowing box-shadow).
- **Secondary Button:** `.btn-secondary` (Transparent background, thin border).
- **Small/Tab Button:** `.btn-sm`. On `.active` state, switches to a blue border and light blue translucent background.

### 📊 Stat Cards
Layout for important metrics (Total stats, Balances).
- Must include a large Emoji/Icon wrapped in a square module with rounded corners on the left.
- On the right: The numeric value (using JetBrains Mono) and the Metric Name (small gray text).
- **Interaction:** Shifts up slightly (`transform: translateY(-4px)`) on hover.
- *Example:*
  ```html
  <div class="stat-card glass highlight-gold">
      <span class="stat-icon">💰</span>
      <div class="stat-info">
          <span class="stat-value">5,000</span>
          <span class="stat-label">Total Cost</span>
      </div>
  </div>
  ```

### 📋 Data Tables
Standard format for all game data tables.
- **Main Class:** `.data-table` wrapped inside a `.table-container` div.
- **Table Headers (`<th>`):** Sticky header with `backdrop-filter: blur(8px)`, small uppercase text with letter-spacing.
- **Row Hover Effect (`<tr>`):** Light up slightly with `background: rgba(255, 255, 255, 0.03);`.
- Remove all vertical borders, keep only subtle horizontal borders to separate rows.

### 🏷️ Badges & Alerts
- **Counter Badge:** Translucent white background, fully rounded `border-radius: 20px`, using Mono font. Positioned next to H3 Headings.
- **Warning Banner:** `.warning-banner` Light yellow/orange background with colored warning text (`rgba(234, 179, 8, 0.1)`).

---

## 5. Layout Pattern

### Standard View Layout
1. **Sidebar Navigation (Left):** Around 260px width, containing a prominent logo and Tab Navigation (`.nav-item`).
2. **Top Bar (Top Content Area):** Contains global search/selectors and account/settings features.
3. **Main Content Area (Scroller):** Occupies the remaining space. Breathing room (Padding) should be 32px.
4. Each Tab must have a large **Section Header (`.view-header`)** containing the Title (H1) and feature descriptions below it.

### Grid & Spacing
- Gap between cards/panels: `20px` or `24px`.
- Grid for metrics (Stats Row): Flexible CSS Grid `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));`.

---

## How to Reuse

When sending a Prompt request to an AI (like ChatGPT, Claude, Cursor, etc.) to design a website with a similar UI, or when handing off to a Front-end Developer, provide this text and state:

> *"Please design the XYZ Website for me. Its appearance, CSS structure, and UI/UX layout must strictly follow the **Design System Guideline** below: [Paste the entire content of this document]"*

Also, attach the `styles.css` file so the AI or Developer can directly copy the exact hex colors and CSS classes. This ensures the newly generated website will possess the exact same premium Glassmorphism aesthetic, Dark Theme, and Typography as the current Dashboard.

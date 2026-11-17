---
name: Lexora Legal Practice Management
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271900'
  on-tertiary-container: '#a07f42'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#ffdea8'
  tertiary-fixed-dim: '#e8c17d'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5c4209'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  tabular-mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The design system establishes a high-density, authoritative, and frictionless operating environment for legal practitioners and law firms. It communicates gravitas, discretion, and technical precision without bureaucratic clutter.

Drawing from modern high-craft enterprise product design (Linear, Stripe Dashboard), the aesthetic relies on:
- **Structural Minimalism:** Visual order derived from strict alignment, tabular grids, and typography rather than decorative ornamentation.
- **Atmospheric Restraint:** A cool, neutral background paired with crisp surfaces, separated by hairline borders instead of heavy drop shadows.
- **Prestige Accents:** Restrained applications of muted brass/gold for verified tiers, high-value litigation markers, and focal milestones, tempered by deep naval authority.
- **Multilingual Equal-Citizenship:** Flawless visual cadence between Latin and Arabic scripts across RTL/LTR contexts without jarring typographic weight discrepancies.

## Colors

The palette balances deep institutional sovereignty with functional clarity.

- **Foundations:** 
  - Canvas: `#F8FAFC` (Cool Off-White)
  - Surface: `#FFFFFF` (Crisp Paper)
  - Surface Muted: `#F1F5F9` (Data table headers, inactive tracks)
  - Dark Nav/Sidebar Base: `#0F172A` with nested interactive layers at `#1E293B`
- **Hairline Dividers:** `#E2E8F0` for light surface bounding; `#334155` for dark sidebar divisions.
- **Primary Brand:** `#0F172A` (Deep Slate-Navy) for primary buttons, dominant headings, and active state indicators. Secondary action anchors use `#475569`.
- **Prestige Accent:** `#B89556` (Deep Muted Gold) reserved for premium milestones, seal badges, key accounts, and solemn verification markers. Hover states deepen to `#9A7B3E`.
- **Functional Semantics:**
  - Success: `#16A34A` (Background `#DCFCE7`, Border `#BBF7D0`) — *Jugement rendu, Encaissé*
  - Warning: `#D97706` (Background `#FEF3C7`, Border `#FDE68A`) — *En délibéré, Délai de recours*
  - Danger: `#DC2626` (Background `#FEE2E2`, Border `#FECACA`) — *Prescription imminente, Audience ajournée*
  - Info: `#0284C7` (Background `#E0F2FE`, Border `#BAE6FD`) — *Audience fixée, Expertise en cours*

## Typography

The typographic hierarchy prioritizes legibility in data-dense layouts.

- **Font Stacks:** 
  - Primary Western: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Arabic Fallback / Multilingual: `'IBM Plex Sans Arabic', 'Inter', sans-serif`
- **Data & Numbers:** All numeric columns, monetary sums (TND, EUR, USD), procedural case codes, and docket numbers must enforce `font-feature-settings: "tnum" 1, "cv05" 1`.
- **Micro-Labels & Meta:** Courtroom indicators, jurisdiction identifiers, and table headers use `label-sm` with uppercase transformation and extended tracking (`+0.04em`).
- **Bilingual RTL Sync:** When rendering Arabic alongside French, avoid simulated italics. Line heights for Arabic elements increase automatically by +2px to accommodate ascenders and decenders without clipping diacritics.

## Layout & Spacing

The viewport architecture comprises a structural two-axis frame:
- **Left Navigation:** Fixed 260px width (`#0F172A`), collapsible to a 64px icon-only rail on screens below 1280px.
- **Top Utility Bar:** 56px height, containing the jurisdictional context selector ("Tunis Tribunal de Première Instance"), global omnibox search (`Cmd+K`), quick filing action, and notification center.
- **Main Canvas:** Liquid container with maximum utility width (`1600px`), centered, bounded by dynamic gutters (`1rem` on mobile/tablet, `1.5rem` to `2rem` on desktop).
- **Rhythm Scale:** Strict 4px/8px modular base. Row heights in standard data tables are capped at 44px (compact) or 52px (standard) to maximize screen real estate for case dossiers.

## Elevation & Depth

Visual hierarchy avoids heavy drop shadows, relying on layered surface tones, precise 1px borders, and micro-diffused ambient light.

- **Level 0 (Canvas):** `#F8FAFC`, flat.
- **Level 1 (Cards & Data Grids):** Surface `#FFFFFF`, border `1px solid #E2E8F0`, shadow `0 1px 2px 0 rgba(15, 23, 42, 0.04)`.
- **Level 2 (Popovers, Dropdowns, Omnisearch):** Surface `#FFFFFF`, border `1px solid #CBD5E1`, shadow `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modals, Sliding Dossier Drawers):** Surface `#FFFFFF`, border `1px solid #94A3B8`, shadow `0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)`.
- **Focus Rings:** Non-offset, double-stroke ring: `0 0 0 2px #FFFFFF, 0 0 0 4px #0F172A`.

## Shapes

The geometry reflects surgical corporate software:
- **Base Components:** Radius set to `0.5rem` (8px) for buttons, text inputs, status chips, and table overlays.
- **Structural Containers:** Radius set to `0.625rem` (10px) to `0.75rem` (12px) for cards, analytical dashboards, and flyout side sheets.
- **Data Tags & Indicators:** Courtroom badges, pill filters, and jurisdiction tokens utilize full pill geometry (`9999px`) to immediately separate metadata tags from actionable button shapes.

## Components

### Buttons
- **Primary:** Background `#0F172A`, text `#FFFFFF`, hover `#1E293B`, subtle active press transition (`scale(0.99)`). 36px height (standard), 32px height (dense).
- **Secondary:** Background `#FFFFFF`, border `1px solid #E2E8F0`, text `#1E293B`, hover `#F8FAFC`.
- **Luxe / Accent:** Background `#B89556`, text `#FFFFFF`, hover `#9A7B3E`. Used exclusively for fee approvals, case settlements, and priority filings.

### Data Tables
- Header: `#F8FAFC`, uppercase `label-sm` tracking, height 36px, bottom border `1px solid #E2E8F0`.
- Cells: Vertical alignment center, height 48px, horizontal borders `1px solid #F1F5F9`. Hover row highlights with `#F8FAFC`.
- Monetary / Date Columns: Right-aligned with tabular numerals (`tabular-mono`).

### Status Badges & Chips
- **Structural Anatomy:** 22px height, 8px horizontal padding, 6px border radius, font-size 11px, weight 500.
- **Variants:**
  - *En délibéré / En attente:* Light amber background `#FEF3C7`, text `#B45309`, border `1px solid #FDE68A`.
  - *Audience fixée:* Light sky background `#E0F2FE`, text `#0369A1`, border `1px solid #BAE6FD`.
  - *Jugement rendu:* Light emerald background `#DCFCE7`, text `#15803D`, border `1px solid #BBF7D0`.
  - *Affaire N° (Dossier Tag):* Light slate background `#F1F5F9`, text `#334155`, border `1px solid #CBD5E1`, monospace digit rendering.

### Inputs & Global Search (`Cmd+K`)
- **Text Inputs:** Height 38px, background `#FFFFFF`, border `1px solid #CBD5E1`, active border `#0F172A` with 1px outline.
- **Omnibox:** 44px height, integrated shortcut glyph badge (`⌘K` / `Ctrl+K`), backdrop blur modal backing (`rgba(15, 23, 42, 0.4)`), instant filter facets by Dossiers, Clients, Actes, and Jurisprudences.

### Timeline Tracker (Procédure Judiciaire)
- Vertical hairline node graph (`2px solid #E2E8F0`). Completed stages illuminated in `#0F172A`, active stage pulsing with `#B89556` accent, pending stages hollow `#CBD5E1`.
---
name: Greenmech
description: Forest & Flare, a warm technical fieldbook for a school chain-reaction machine
colors:
  canvas: "#e6dfcf"
  surface: "#f0ebdd"
  text: "#242620"
  text-2: "#5c6257"
  brand: "#294e42"
  on-brand: "#f1f4ec"
  brand-hover: "#203c31"
  separator: "#c6c1b4"
  control-edge: "#6b7566"
  selected: "#d3dec8"
  pale: "#ece6d8"
  flare: "#df3e31"
  flare-text: "#ac3026"
  success: "#17645f"
  warning: "#7a5c0c"
  error: "#8e1f1a"
  band: "#294e42"
  on-band: "#f1f4ec"
  on-band-2: "#c9d7c0"
  dark-canvas: "#141e19"
  dark-surface: "#20352b"
  dark-text: "#e6dfcf"
  dark-text-2: "#b3bdae"
  dark-brand: "#a9c0a6"
  dark-control-edge: "#8a9a88"
  dark-flare: "#f17c6f"
typography:
  display:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "clamp(28px, 4.2vw, 44px)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  slug:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontWeight: 500
  small:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
rounded:
  media: "0px"
  control: "4px"
  float: "8px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.control}"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "44px"
  chip-pressed:
    backgroundColor: "{colors.selected}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
  bay:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.media}"
    width: "164px"
  bay-done:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  toast:
    backgroundColor: "{colors.band}"
    textColor: "{colors.on-band}"
    rounded: "{rounded.float}"
---

# Design System: Greenmech

## Overview

A warm technical fieldbook: unbleached paper, forest ink, and one small red observation. The machine and its modules carry the complexity; the interface recedes into rules, labels and a front-elevation drawing of the tower. Mode is Operate: scanability and certainty over expression. Brand shows in precise details: mono slugs, drafting patterns for status, a single red dot for doubts.

Tokens live only in `src/styles/tokens.css` (light and `[data-theme='dark']`). No other file holds a hex value in CSS; stylelint enforces it.

## Colors

### Primary
- **Forest** (`brand`, #294e42 light / #a9c0a6 dark): primary buttons, the Done fill, the active nav underline, the attention band and toasts (`band`).

### Neutral
- **Canvas** (#e6dfcf) is the page; **Surface** (#f0ebdd) is anything you can press or read in a panel. **Text** #242620, secondary **Text-2** #5c6257 (also every placeholder, 4.5:1 or better).
- **Separator** for rules between entries; **Control edge** (#6b7566, 3:1) outlines every control.
- **Pale** (#ece6d8) fills bays filtered out by the legend. Text on it stays full-contrast.

### Tertiary: Flare
- **Flare** (#df3e31) is a graphic mark only: the flag dot. Never text. Text that needs that hue uses **Flare text** (#ac3026).

### Named rules
- **One red observation.** Red appears only as flag dots and the error-toast outline. Status never uses red.
- **Never colour alone.** Every status carries a word, an icon and a pattern.
- **No opacity on text.** Filtering changes fills, not text.

## Typography

Geist for everything, Geist Mono for slugs, ports, initials and units. Both self-hosted via @fontsource.

### Hierarchy
- Display h1: clamp(28px, 4.2vw, 44px), 600, -0.02em. The Modules headline is a live sentence, not a title.
- h2 24px 600; h3 19px 600; body 17px, 1.55; small labels 14px 500. Nothing real below 14px.
- Measure 60 to 68ch for prose.

### Named rules
- **Slugs are mono 500, everywhere**: headline, body, chips, lists, inputs that edit them.
- Sentence case. No eyebrows above headings. No section numbers.

## Layout

Spacing scale 4, 8, 12, 16, 24, 32, 48, 64. Pages max 1320px, reading pages 820px. Rules and separators come before boxes; list entries have no card shells.

- **768px and up:** the elevation drawing. Tiers stack with the widest at the bottom, 56px gutters for connection lines, a vertical mono tier label on the left.
- **Below 768px:** a list grouped by tier is the default; "Drawing" opens the drawing in a horizontal scroller with an edge fade and a hint. The header wraps to brand, sync and account on one line, then nav, then search.
- **Side sheet:** a column beside the drawing from 1024px; a bottom sheet below that.

## Elevation & Depth

Flat. Depth exists only for things that genuinely float: the search results, the account menu, the help panel, the phone bottom sheet and toasts (`0 8px 24px rgb(0 0 0 / 18%)`). No shadows on bays, cards or buttons.

## Shapes

- Media and bays: 0 radius (drafting).
- Controls: 4px. Floating overlays: 8px. Pills only for legend chips and the account button.

## Components

### Bays (signature)
Real `<button>` elements, 164px wide, slug wraps and never truncates. Pattern by status: Idea dotted edge, Planning dashed, Building solid edge with a 45° hatch (SVG pattern), Done solid forest fill. Top row: box glyph and leader initials ("no lead" when unled). Bottom row: status badge and up to three flag dots. Selected bays get a 3px text-colour outline; focus is the global 2px ring at 3px offset. When a module becomes Done, a surface-coloured cover wipes off left to right in 240ms.

### Status and connection badges
4px radius, 1px edge, word and icon always. Connection states: Locked (lock), Ready (play, success colour), In progress (loader), Connected (check). "Adapter needed" is a separate dashed amber badge and never replaces the state icon.

### Buttons
44px minimum height and width. Secondary: surface fill, control edge. Primary: forest fill. Quiet: transparent with edge. Danger: error text and edge. Disabled: canvas fill, dashed edge, text-2 (never dimmed by opacity).

### Chips (legend filter)
Pill, 44px, swatch + icon + word. Pressed: selected fill, 2px edge, 600 weight.

### Inputs
Surface fill, control edge, 4px. Invalid: 2px error edge plus an inline sentence below. Slug inputs are mono with a visible "n of 32" counter; nothing is truncated silently.

### Navigation
Text links with a 2px forest underline for the current route; 44px targets.

### Toasts
Sticky at the bottom centre of the viewport, respecting the safe area. Band colours. Undo for 10 seconds, paused on hover or focus.

## Do's and Don'ts

- Do show status as word + icon + pattern together.
- Do put the legend above the drawing, at 14px or larger, and make it the filter.
- Do keep connection labels off the bays: show a label only for the hovered or selected line, and always list every connection beside the drawing.
- Don't use gradients, glow, glass, drop shadows on non-floating things, hero-metric tiles or uniform card grids.
- Don't use red for anything but flag dots and the error outline.
- Don't dim text with opacity. Don't grey out controls a role cannot use: remove them.
- Don't use emoji or unicode glyphs as icons; use the Tabler sprite in `src/icons/icons.ts`.

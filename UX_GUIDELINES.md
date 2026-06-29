# UX Guidelines — Inspired to Move Video Manager

These are the design patterns the app follows. Read this before adding UI so new
work feels like part of the same product. The goal is a **clean, consumer-grade**
experience that reflects the Inspired to Move brand and makes managing many videos
faster than Google Drive itself.

All values below already live in `styles.css` (mostly as CSS custom properties) and
`app.js`. Reuse the tokens and helpers — don't hardcode new colors, fonts, or date
formats.

---

## Brand & color

Colors are sampled from the Inspired to Move logo and site. They're defined once in
`:root` in `styles.css`; reference the variables, never raw hex.

| Token | Value | Use |
|---|---|---|
| `--pico-primary` | `#0050a0` | Primary blue: links, primary buttons, focus rings, headings |
| `--brand-teal` | `#14a0c8` | Secondary accent |
| `--brand-purple` | `#7b4bc4` | Secondary accent |
| `--pico-muted-color` | (Pico default) | Secondary text, metadata, placeholder/empty states |

- **Background:** a soft branded radial gradient on `body` (light blues). Don't put
  content directly on flat white except inside cards.
- **Accent usage:** teal and purple are *accents*, not primary actions. The header's
  bottom border uses a `blue → teal → purple` gradient — that's the one place the full
  palette appears at once. Keep primary actions blue so hierarchy stays clear.

## Typography

- **Headings / titles:** `--heading-font` → **Poppins** (`h1–h3`, `.app-title`,
  `.file-name`, the welcome heading).
- **Body / UI text:** `--pico-font-family` → **Nunito Sans**.
- Both load from Google Fonts in `index.html`. If you add a heading-like element, give
  it `font-family: var(--heading-font)`.

## Tag colors

Tags have **stable, curated colors** — a tag is always the same color everywhere
(row chip *and* filter pill).

- Source of truth is `TAG_COLORS` (known tags) with a `PALETTE` fallback for new tags,
  in `app.js`. Use the `tagColor(tag)` helper; **never** hash a color inline.
- Chips: light tint background + dark text of the same hue. Filter pills: outlined when
  inactive, solid when active.
- To add a new "official" tag color, add an entry to `TAG_COLORS`. Anything not listed
  still gets a designed color from `PALETTE` (so it never looks random).

---

## Layout

- **Working width:** the list/toolbar area (`#file-section`) is capped at **~980px and
  centered**. Keep content at a comfortable reading width — don't let rows stretch the
  full width of large monitors. Metadata should sit near the content it describes.
- **Cards:** use rounded corners (`16–20px`) and a soft shadow
  (`0 20px 60px rgba(0,80,160,0.12)`) for focal surfaces like the sign-in card.
- **Rows / chips / inputs:** rounded — `8px` for fields and rows, `999px` (pill) for
  chips, filter buttons, and the search box.

## Affordances reveal on hover (don't clutter)

This is the single most important pattern. **Secondary edit/share controls stay hidden
until the user is on the row.**

- Edit (`✎`) and Share affordances (`.edit-name-btn`, `.edit-desc-btn`,
  `.edit-filmed-date-btn`, `.mark-shared-btn`) are `opacity: 0` by default.
- They fade in on `.file-item:hover` **and** `.file-item:focus-within` (so keyboard
  users get them too).
- Touch devices have no hover, so under `@media (hover: none)` they stay gently visible.
- Content (titles, descriptions, tag chips, dates, duration) is **always** visible.
  Only the *actions on* that content are revealed.

When adding a new per-row action, follow this pattern: keep the data visible, hide the
control, reveal on hover/focus, and provide the touch fallback.

## Row & selection states

- **Hover:** a light, clearly-temporary tint (`primary 6%`). No border accent.
- **Playing video:** a slightly stronger tint (`primary 10%`) — **no left border**.
  We do not use a heavy left-border accent; the inline player and tint are enough.
- Reserve strong emphasis for genuine state, not for hover.

## Thumbnails & video

- List thumbnails are **112×64** (16:9) with a **persistent play badge** so it's
  obviously a video, not an image. The badge darkens on hover.
- Clicking a thumbnail opens the player **inline** (expand-in-place), not a modal or a
  new page. The player panel has uniform rounded corners and a small Close bar.

## Forms & inline editing

- All inputs (`.name-input`, `.desc-input`, `.filmed-date-input`, `.tag-select`,
  `.search-input`) share one look: rounded, `1px` muted border, white background, and a
  **brand-blue focus ring** (`box-shadow: 0 0 0 3px var(--pico-primary-focus)`).
- Style native controls (`<select>`, `<input type="date">`) to match this — never ship
  raw OS-default form styling next to the pill/rounded UI.
- **Edit in place.** Editing swaps the display for an input plus **Save / Cancel sitting
  right next to the field** being edited (don't let buttons drift to another column).
- Keyboard: **Enter saves, Escape cancels** in every inline editor.

## Feedback

- **Success is acknowledged, not silent.** After a successful save (name, description,
  date, tags, share) the row briefly flashes green via the `just-saved` class →
  `savedFlash` animation. Use `flashSaved(item)` after any successful mutation.
- **Errors** surface in the shared `#error-msg` banner via `showError(msg)`.
- **In-flight:** disable the controls being submitted while a request is pending.

## Loading & empty states

- **Loading:** show the `.spinner` plus friendly text ("Loading your videos…"), never a
  bare "Loading…".
- **Empty states** are styled and human (`.empty-state`), centered and muted. Distinguish
  the two cases:
  - *No data at all:* "No videos found in your Drive folder yet." (owned by `renderFiles`)
  - *Nothing matches the filter/search:* "No videos match your search or filters."
    (owned by `applyFilter`)

## Finding & sorting (built for "many videos")

- A **search box** filters by title and description as you type (`applyFilter`,
  case-insensitive substring over name + description).
- **Sort** offers name / filmed date / duration / last shared (`sortFiles` + the
  `#sort-select` control). Undated/never-shared items sink to the bottom and fall back to
  name order.
- **Tag filtering is an intersection (AND):** a video must have *all* selected tags.
  Search and tag filters combine (both must pass).

## Dates

- One format everywhere: **"May 6, 2026"** via the `formatDate(date)` helper. Don't call
  `toLocaleDateString` ad hoc with different options.
- Empty values are explicit and muted/italic: "No filmed date", "Never shared".

---

## Quick checklist for new UI

- [ ] Colors/fonts come from the `:root` tokens, not hardcoded.
- [ ] New tag color added to `TAG_COLORS` (or relies on `tagColor()` fallback).
- [ ] Secondary actions hidden by default, revealed on hover/`focus-within`, with a
      `@media (hover: none)` fallback.
- [ ] Inputs use the shared rounded + brand-focus styling; native controls restyled.
- [ ] Inline edits: Save/Cancel adjacent to the field; Enter saves, Escape cancels.
- [ ] Successful mutation calls `flashSaved()`; errors go through `showError()`.
- [ ] Loading uses the spinner; empty/no-match states use `.empty-state`.
- [ ] Dates rendered with `formatDate()`.
- [ ] Content stays within the centered ~980px working width.

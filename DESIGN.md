# Ink — design system

**Concept: the writing desk.** The app is a physical desk: paper sheets on a cool
blotter, iron-gall ink, one editor's-red pencil, manila folders, catalog cards.
Every visual and copy decision descends from that metaphor. Serif manuscript is
the product's material — the interface wears it proudly rather than dressing in
SaaS pastels.

**The name is the material.** Ink is not a branding coat — it is the physics of
the app. Words land wet on the page and dry. `[[links]]` are veins between blots.
Discarded pages go to the wastebasket. Duplicates are carbon copies. A fresh note
is still wet; the sidebar's ink well rises with each page touched today.

## Tokens

| Role | Value | Use |
|---|---|---|
| `desk` | `#E7E9E6` | app ground — the blotter |
| `desk-deep` | `#DCDFDC` | recessed drawer surfaces |
| `paper` | `#FBFBF9` | sheets, cards, menus |
| `paper-dim` | `#F2F3F0` | hover/recessed paper |
| `ink` | `#1B1E21` | blue-black body ink, primary buttons, blots |
| `ink-soft/faint/ghost` | `#3F454B` / `#6D747A` / `#9CA3A7` | graphite, pencil annotations |
| `line` | `#D9DCD8` | hairline rules — depth comes from lines, not shadows |
| `pencil` | `#AE3A24` | the editor's pencil: active marks, pins, strikes, the ink-drop period |
| `pencil-wash` | `#F5E7E2` | destructive hover, selection |
| `manila` | `#9C7B46` | folder affordances only |
| `fountain` | `#31518C` | tags, `[[links]]`, fresh ink — fountain-pen blue |

## Type

- **Spectral** — manuscript: note titles, editor body, card snippets, page titles, the wordmark
- **Archivo** — chrome: buttons, nav, labels, dialogs
- **IBM Plex Mono** — data only: word counts, dates, `#tags`, kbd hints, counts

Scale is quiet: page titles `text-3xl`, note titles up to `text-[2.5rem]`, body
`text-sm`/`13px` chrome, `1.0625rem` manuscript, `text-2xs` mono meta.

## Signature

- **Wet ink** — inserted text arrives glossy, diluted and blurred (`ink-wet`,
  `ink-dry 1s`, with a sheen that fades), then dries to full `ink`. Paste/import
  lands dry. Off via Settings → "Wet ink"; `prefers-reduced-motion` skips it.
- **Procedural ink-art** — `src/lib/ink.tsx` draws every mark by hand. A seeded
  PRNG means a note's blot is *its* blot — stable across reloads, like a real
  stain. Components: `InkBlot` (per-note thumbprint seals, web nodes), `InkWell`
  (the sidebar bottle that fills with today's pages), `PenNib` (Write button),
  `Squiggle` (hand-drawn rules under active labels and note titles), `Strike`
  (double-pass cross-out on wastebasket slips), `ProofCircle` (pencil circle
  around pinned titles), `TornEdge` (deckle top of the writing sheet),
  `InkDrop` (a drop lands and soaks in on a fresh page), `PenRest` (empty
  states). All SVG, all deterministic.
- **The margin mark** — a 3px `bg-pencil` caret, tilted like a proofreader's
  stroke, on the left edge of the active row (nav, palette). Active labels also
  get a hand-drawn `Squiggle` that draws itself once.
- **`Ink` wordmark** — Spectral bold; the period is a real `InkBlot` in pencil
  red (seed `ink-wordmark`), not a border-radius circle.
- **Ink bleed** — `.ink-bleed` hover: a soft ink wash blooms outward through the
  paper fibers behind the row, like the page absorbing pressure.
- **Paper grain** — `.paper-grain` overlays a faint `feTurbulence` tooth on
  sheets so they aren't flat polygons.
- **Blots and veins** — the `/web` graph draws notes as `blotPath` organic
  stains (size ∝ √words, satellite fleck) joined by tapered ink ribbons.
  Unwritten `[[targets]]` are dashed ghosts that create the page on click.
- **Asterism** — `---` renders `⁂`, a manuscript break, not a rule line.
- Depth = hairline borders + one crisp `shadow-sheet`; radius `3px` (squared,
  paper-like), never `rounded-2xl`.
- Icons: `lucide-react`, stroke 1.75–2, no filled glyph tiles, no gradients.

## Copy voice

Plain, wry, desk-appropriate, and in-metaphor where it doesn't obscure function:
"Tossed in the wastebasket" / "ink wet" / "ink dry" / "carbon copy" / "Smooth
back out". Errors state facts and fixes.

## Rules for future pages

- Serif for anything that is *writing*; Archivo for anything that is *furniture*;
  mono only for data.
- Pencil red is a mark, never a fill — ticks, underlines, small text, destructive
  hovers. Large red surfaces are off-system.
- Ink metaphors are permitted; *paper-stationery metaphors are not a second
  system* — no ruled-paper modes (that metaphor belongs to the flashcards app),
  no sticky notes, no index-card grids.
- No gradients, no glassmorphism, no staggered fade-up entrances, no uppercase
  tracking-widest labels, no italic headers.
- Motion answers actions only (open, dismiss, undo, ink drying): ≤ 200ms UI,
  ≤ 900ms ink, opacity/transform/filter only, `prefers-reduced-motion`
  collapses everything.

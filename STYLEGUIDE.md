# Cutline style guide — "Morning Air"

The 6am tee time: dew on the first fairway, pale sky, long light. Screens sit on a soft
ambient gradient; content lives on frosted glass panels with hairline light borders.
One deep fairway green does all the interaction work. Atmosphere lives in **backgrounds** —
text stays near-black, because golfers read these screens outdoors.

All tokens live in [`web/src/styles.css`](web/src/styles.css) under `:root`. Nothing in a
component should invent a colour, radius or shadow — take it from a token.

## Palette

### Atmosphere (backgrounds only — never text, never controls)

| Token | Hex | Role |
| --- | --- | --- |
| `--air-sky` | `#DCEFF7` | Top of the ambient gradient; PWA theme colour |
| `--air-mist` | `#F2FAFB` | Middle of the gradient |
| `--air-turf` | `#DFF0E2` | Bottom of the gradient |
| `--paper` | `#F2F8F7` | Solid base beneath the gradient; opaque fallbacks (sticky columns, sheets) |
| `--paper-2` | `#FBFDFC` | Bottom sheets and other near-solid surfaces |

The gradient is painted once, by `.aura`, fixed behind everything, with four blurred
light blooms (warm gold top-left, sky blue right, soft green left and bottom-right).
Content scrolls over it; the morning doesn't move.

### Ink

| Token | Hex | Role |
| --- | --- | --- |
| `--ink` | `#0F1F18` | Body text, headings, numbers |
| `--ink-2` | `#55685E` | Secondary text |
| `--muted` | `#74857C` | Labels, captions, inactive tabs |

### The one working colour

| Token | Hex | Role |
| --- | --- | --- |
| `--fairway` | `#166747` | Primary actions, active states, links |
| `--fairway-2` | `#1B7A55` | Top stop of the button gradient |
| `--fairway-deep` | `#145C40` | Text on green tints (chips, settled money) |
| `--live` | `#17A268` | The glow: live dots, "me" leaderboard rows, focus rings |

Primary surfaces use `--accent-grad` (`fairway-2 → fairway`, top to bottom) — buttons,
the FAB, selected slots/dates/pills. Everything interactive is green; if it isn't green,
it isn't the primary path.

### Held back

| Token | Hex | Role |
| --- | --- | --- |
| `--red` | `#C03A2B` | Tournament meaning only: under par, and money owed |
| `--fescue` | `#A9822F` | Part-paid / waived states; trophies; the brand tag on the Welcome screen |
| `--sky` | `#34718F` | Slate blue for net figures — the one legacy alias that kept its name |

Red never decorates. If a screen has red on it, someone is under par or owes rands.

## Glass

Two levels, no more:

- **Panels** (`.card`, `.hero`, `.tabbar`, `.sticky-head`, `.metric`): `--glass-bg` +
  `--glass-brd` (hairline of light, not of ink) + `--glass-shadow`. Where the browser
  supports it, `backdrop-filter: blur(20px) saturate(1.5)` and the fill drops to
  `rgba(255,255,255,0.55)`; the `@supports` block at the bottom of the stylesheet owns
  this swap. Without support, panels are simply more opaque — never unreadable.
- **Controls inside panels** (steppers, slots, quick scores, pill scrolls): plain
  `rgba(255,255,255,0.7–0.8)` fills, no blur. Blur never nests — stacked frost goes muddy
  and costs frames on mid-range phones.

Shadows are green-tinted (`rgba(22,64,48,…)`), soft and few. Elevation says "floats on
the morning", not "material design".

## Type

| Face | Token | Where |
| --- | --- | --- |
| IBM Plex Sans 400/500/600/700 | `--sans` | Everything: UI, headings (700, −0.02em), labels |
| IBM Plex Mono 400/500 | `--mono` | **Every** time, price, score, position and code — tabular, so columns align |
| Archivo Black | `--display` | The wordmark only. Nowhere else. |

Headings are sentence case now — the all-caps display voice retired with v1. Small labels
(stat keys, field labels, eyebrows) stay uppercase but move to Plex Sans 600 with wide
tracking. Fonts are bundled via `@fontsource` (see `web/src/main.tsx`); nothing is fetched
from a CDN, so typography survives offline.

## Geometry

| Token | Value | Where |
| --- | --- | --- |
| `--r-sm` | 10px | Small tucks (blocked sheet rows) |
| `--r-md` | 14px | Inputs, metrics, slots, segmented controls |
| `--r-lg` | 17px | Buttons |
| `--r-xl` | 22px | Cards, hero, tab bar |
| `999px` | — | Chips, pills, tags, toasts, grab handles, progress bars |

The tab bar is a floating frosted island: inset 12px from the edges, rounded `--r-xl`,
with the FAB raised out of it (circular, gradient, white ring).

## Conventions that survived v1

These are the scorecard's soul; they outrank any restyle:

- **Mono numerals everywhere a number appears**, `tabular-nums`, so times, rands and
  positions line up in columns.
- **Scorecard notation** (`.mark`): a ring for birdie, two rings for eagle, a box for
  bogey, two for double. Red under par. Never replace with emoji or arrows.
- **Red means under par and money owed.** Nothing else.
- **Money formatting**: rands, mono, `.money.owing` red / `.money.settled` green.

## Motion

One easing curve (`--ease`), and three moves: screens rise 4px on entry, sheets slide up,
the live dot breathes. The breathe respects `prefers-reduced-motion`. Nothing else animates.

## Adding a component

1. Fill: `--glass-bg` if it's a panel, `rgba(255,255,255,0.7)` if it's a control in one.
2. Border: light (`--glass-brd`), not ink. Ink hairlines (`--line-soft`) are for dividers
   *inside* panels only.
3. Radius: from the scale above. If it's small and standalone, it's probably a 999px pill.
4. Interactive? It's green. Selected? `--accent-grad` with the green shadow.
5. Numbers in it? `--mono`, tabular.

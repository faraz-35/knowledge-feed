# Knowledge Feed

An infinite (almost) feed of bite-sized intellectual / informatic knowledge — 2–3 sentences per card. For scrolling when bored and not in the mood for heavy-weight work.

## Goal

Low-friction, low-cognitive-load reading. Open it, scroll, learn something small, move on. No menus, no login, no likes, no notifications.

## The core decision: where does "infinite" come from?

| Source | Truly infinite? | Quality | Works offline | Cost |
|---|---|---|---|---|
| **Curated JSON** (hand/LLM-written 300–1000 facts) | No (but feels infinite) | Highest, vetted | Yes | Free |
| **Wikipedia random summary API** | Yes (~6M articles) | High, real sources | No | Free, no key |
| **LLM-generated on demand** | Yes | Variable, risk of slop | No | $$$ + latency |

### Chosen approach: Hybrid

- Bundle a curated `facts.json` (~500 high-quality facts) → instant load, works offline, trustworthy content.
- Lazy-pull Wikipedia's random summary endpoint when the user scrolls near the end → true infinity, no API key, no hallucination.
- Endpoint: `https://en.wikipedia.org/api/rest_v1/page/random/summary`

Best of all worlds: instant start, real infinity, free, no slop.

## UI / UX

- **One card per screen, snap-scroll** — TikTok-style but for text.
- Dark background, large readable type (clean sans or serif), generous whitespace.
- Card shows: the fact (2–3 sentences) + a tiny category pill + optional source link.
- Inputs: scroll, arrow keys (↑/↓), swipe — all advance.
- No menus. Optional tiny corner controls: category filter, "save" (to localStorage).
- Categories: science, history, language, math, ideas, technology, nature.

## Tech stack

- **Single static HTML file** (vanilla JS, no build step).
- `facts.json` bundled alongside.
- Deployable to GitHub Pages / Netlify in seconds; also works from `file://`.
- React/Next is overkill and hurts load time for this use case.

## Build plan

1. `index.html` — single card, snap-scroll, reads from bundled `facts.json`.
2. `facts.json` — curated seed (~150 strong facts to start, grow over time).
3. Infinite scroll — when 10 items from the end, fetch Wikipedia random summary, normalize shape, append.
4. Optional polish:
   - Tag/category filter
   - "Save this" → localStorage favorites
   - Reading-progress dot
   - Keyboard shortcuts (j/k vim-style)

## Fact shape (canonical)

```json
{
  "id": "uuid-or-slug",
  "text": "2–3 sentence fact here.",
  "category": "science",
  "source": "https://en.wikipedia.org/wiki/...",
  "curated": true
}
```

Wikipedia responses get normalized into the same shape with `curated: false`.

## Out of scope (for now)

- Accounts / sync
- Social features
- Algorithmic personalization
- Mobile app (PWA is enough if needed later)

## Location

`/Users/farazshah/Programming/knowledge-feed`

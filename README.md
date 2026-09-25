# EmptySkies

Album-teaser site for [EmptySkies](https://soundcloud.com/emptyskies-416412725), a Baltimore artist, ahead of the album *emptyabovebelow*. Built for a friend, with their OK.

**EMPTY ABOVE / EMPTY BELOW.** One WebGL sky that never reloads has an altitude: the unreleased album hangs above in white, the surface is Baltimore right now, the five released songs sink below as rooms (oldest deepest), and the links page is the floor. Links travel through ink; one SoundCloud player keeps playing across every page.

## Run locally

Serve the repo root. `404.html` uses root-absolute paths, so it only works from the root.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk works too: the router switches off, links point at `index.html` files, and the sky falls back to plain CSS covers.

No build step, no dependencies. `style.css` is one file, in sections: setup, base, sky, chrome, player, components, pages, motion.

## Routes

| File | URL | depth | what it is |
|---|---|---|---|
| `index.html` | `/` | 0 → −1 | the surface: the Exhale hero (wordmark breathes out into ash), the released list, the album strip |
| `emptyabovebelow/index.html` | `/emptyabovebelow/` | +1 | the album, told honestly (white-out) |
| `music/<slug>/index.html` ×5 | `/music/<slug>/` | −1.2 … −2.0 | one room per song, with its own share card |
| `links/index.html` | `/links/` | −3 | the floor: link-in-bio target |
| `404.html` | any missing path | −4 | no signal |
| `music/index.html` | `/music/` | — | redirect stub to `/#released` |

## Files

```
js/core.js     the ES namespace, the track data (the only copy), url helpers, ticker
js/sky.js      WebGL sky, moods, ink transitions, CSS fallback
js/player.js   the SoundCloud player, dock, waveforms
js/site.js     bar, menu, gauge, clock, per-page behaviour
js/barb.js     the router (fetch + swap #page, keep everything else alive)
js/hero.js     the home hero: WebGL wordmark that dissolves into ash on scroll
assets/wave/   SoundCloud waveform JSON, committed verbatim
scripts/check.sh   the one runnable check
```

## The shell checklist

Every page is a complete document that reads without JS. Everything outside `<main id="page">` is the **shell**: it must be byte-identical in every page apart from the `../` prefixes, `aria-current`, and root-absolute paths in `404.html`.

- Copy the shell from `index.html`; only change path prefixes and `aria-current` (`page` on the current nav item; `true` on "released" for song pages; none on the 404).
- `<main id="page" tabindex="-1" data-page data-depth data-span data-cover data-mood [data-slug]>`.
- Exactly one `<h1 tabindex="-1">` per page.
- No `<script>` or `<style>` inside `<main>` (fetched pages never run them).
- Head: title, description, canonical, `og:title/description/url/image` (absolute `https://emptyskies.com/…`), `og:image:width/height` 500, `twitter:card=summary`, `theme-color` (`#060608`; `#d6d6d2` on the album page).

Run the check before every commit:

```sh
scripts/check.sh
```

It fails if any page's shell drifts from `index.html`, if a `data-play`/`data-track`/`data-wave` slug is missing from `js/core.js`, if `404.html` has a relative path, if a page breaks the one-h1 / no-script-in-main contract, or if a track row's play button regresses (an `aria-label`, or the number inside it).

## Adding a track

1. **Cover:** a square 500×500 `assets/img/<slug>.jpg`.
2. **Data:** add an entry at the top of `tracks` in `js/core.js` (newest first): `n, slug, title, id, permalink, genre, uploaded (UTC ISO), ms, cap, credit, depth`. Shift the older tracks' depths so they stay between −1.2 and −2.0.
3. **Song page:** copy `music/nohand2hold/` (the template; see the comment at its top) to `music/<slug>/` and change the head meta, `#page` attributes, title, caption, controls, spec sheet and plate.
4. **Home row:** copy an `<li class="row">` in `index.html` (and a compact row on the album page). The play button is named by its hidden text ("05 play Title") and has no `aria-label`; the number sits after the button, not inside it, so it still shows without JS. `scripts/check.sh` enforces both.
5. **Neighbours:** update the door links (`a.door` at the top and `nav.doors` at the bottom) on the new page and the pages next to it.
6. **Waveform:** fetch it with the wave key from the track's SoundCloud JSON (below).
7. Add the URL to `sitemap.xml`, then run `scripts/check.sh`.

### Waveforms

Each track's `waveform_url` in its SoundCloud JSON ends in `<key>_m.png`. Refresh the committed JSON with:

```sh
curl -s https://wave.sndcdn.com/<key>_m.json -o assets/wave/<slug>.json
```

| slug | key |
|---|---|
| nohand2hold | sBCRXzg6bd1Q |
| deathalliwant | rWM1BoGHFnGn |
| mylittlesoldier | TamB47r0lKTM |
| miracleoflife | Dj9xbjAuszv8 |
| bubbles | wOCWVU8xg66a |

## Suggestion

Point the Instagram bio link at **emptyskies.com/links/**: it is built as the link-in-bio page (big tap rows, the latest song, a live Baltimore clock).

## Open items

- [ ] **Album date and artwork:** add them to the album page's dossier when announced (the three redacted fields).
- [ ] **MyLittleSoldier's comments:** it has 2 comments whose text we don't have. Don't show them without the client's OK.
- [ ] **Cover rights:** a few covers use existing artwork (two classic paintings, a figurine photo, an archival photo). Fine for SoundCloud, but worth checking before merch or anything paid.
- [ ] **Cloister Black licence:** the wordmark font (Dieter Steffmann) is freeware; check its terms before commercial use of the lettering.

Done since the first version: MiracleOfLife now has its real cover, link and genre; Instagram is linked.

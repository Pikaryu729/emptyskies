# EmptySkies

Album-teaser site for [EmptySkies](https://soundcloud.com/emptyskies-416412725), a Baltimore artist, ahead of the album *emptyabovebelow*. Built for a friend, with their OK.

## What's here

```
index.html            page markup
style.css             all styles
main.js               moving WebGL background + track hover logic
assets/img/           profile picture + track covers (from the artist's SoundCloud)
assets/fonts/         Cloister Black (wordmark)
```

No build step. Open `index.html` or serve the folder.

## How it works

- **Background:** a full-screen WebGL shader drifts the current cover art (slow warp, grain, scanlines, chromatic split, dark grade). Every ~7 s it dissolves to the next cover. Hovering a track (or scrolling a track to the middle of the screen on phones) switches to that track's cover.
- **Fallbacks:** no WebGL, or opened straight from disk via `file://` → the covers show as a plain CSS background instead. `prefers-reduced-motion` freezes the animation.
- **Fonts:** Cloister Black is bundled locally. Big Shoulders Display and JetBrains Mono load from Google Fonts.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening the file directly works too, but you'll get the static fallback instead of the moving background.)

## Open items

- [ ] **MiracleOfLife:** no cover or direct link yet. It shows the profile picture and links to the track list. Add `assets/img/miracleoflife.jpg` and the real track URL.
- [ ] **Album date / cover:** add once announced.
- [ ] **Other socials** (Instagram, TikTok, etc.): none on the page yet.
- [ ] **Cover rights:** a few covers use existing artwork (two classic paintings, a figurine photo). Fine for SoundCloud, but worth checking before merch or anything paid.
- [ ] **Font license:** Cloister Black (Dieter Steffmann) is freeware. Check terms before commercial use of the lettering.
- [ ] **Hosting:** drop the folder on Netlify, Vercel, Cloudflare Pages or GitHub Pages. Add a domain if wanted.

# public/fonts

**Generated. Not committed.** Run `npm run setup:fonts` to populate.

Copies four woff2 files out of the `@fontsource/*` packages in `node_modules`.
Self-hosted on purpose: the game never contacts the Google Fonts CDN
(CLAUDE.md invariant 1), because a font request is still a request, and it
would carry the player's IP to a third party on every load.

| File | Family | Used for | Licence |
|---|---|---|---|
| `vt323-latin-400-normal.woff2` | VT323 | camcorder OSD, timestamps, counters, tagline | OFL 1.1 |
| `special-elite-latin-400-normal.woff2` | Special Elite | the title, tape labels, ruin lore, Wick speech | Apache 2.0 |
| `inter-latin-400-normal.woff2` | Inter | settings, notices, any text over two lines | OFL 1.1 |
| `inter-latin-600-normal.woff2` | Inter semibold | emphasis in UI prose | OFL 1.1 |

Declared in `src/ui/tokens.css`; see SPEC §12.3 and `docs/CREDITS.md`.

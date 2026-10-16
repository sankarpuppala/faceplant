# Deploying FACEPLANT

The game is a static site with no backend, so deploying it is copying a
directory to a web host. The only two things that genuinely matter are that
it is served over **HTTPS** (`getUserMedia` will not run otherwise, so the
camera never starts) and that the whole of `dist/` goes up, including the
13 MB MediaPipe wasm.

## GitHub Pages — the recommended host

Pages is preferred over itch.io for one reason: **the camera works**. itch.io
serves browser games inside an iframe, and `getUserMedia` inside that iframe
needs `allow="camera"` on it, which the itch uploader does not let you set.
On itch the game has to be launched with the "click to launch in fullscreen /
new window" option before the camera will start. That is risk R4 in `PLAN.md`
and it is a bad first impression for a game that is entirely about your face.

Pages also deploys itself: `.github/workflows/pages.yml` runs the whole gate
(typecheck, 338 tests, build, the no-network check and the flash-safety check)
and publishes only if all of it is green.

### One-time setup

```bash
# 1. Create an empty repository on GitHub. Do not add a README or a licence;
#    this repo already has history.

# 2. Point this working copy at it.
git remote add origin https://github.com/<you>/<repo>.git

# 3. Push.
git push -u origin main

# 4. On GitHub: Settings -> Pages -> Build and deployment -> Source
#    -> "GitHub Actions".
```

The first push triggers the workflow. The URL appears in
Settings → Pages and in the workflow summary, and looks like
`https://<you>.github.io/<repo>/`.

Every later push to `main` redeploys, and a failing test blocks it.

### Why there is nothing to configure

`vite.config.ts` sets `base: ''`, so every asset path in the build is
relative. The same `dist/` works at a domain root, in a project subdirectory
like `/faceplant/`, and inside itch.io's CDN path, with no rebuild.

The share text used to carry a hard-coded `https://faceplant.game`. It now
reads the address off `location` at runtime (`shareUrlFor` in
`src/share/shareText.ts`), so shared results link to wherever the game
actually is. There is no URL to set at release and no way for it to drift.

## itch.io — as a second home

```bash
npm run build
npm run package:itch     # -> dist-itch/faceplant.zip  (~11 MB)
```

Then on the itch project page:

1. Upload the zip, tick **"This file will be played in the browser"**.
2. Viewport **1280×720**, enable the fullscreen button.
3. Turn on **"Click to launch in fullscreen"** — without it the embedded
   iframe blocks the camera.
4. Test the camera *from the itch page itself* and record the result in
   `PLAN.md` (AC-12, risk R4).

The packager verifies its own output before it finishes: `index.html` at the
zip root, a `mediapipe/` directory present, and forward-slash path separators.
That last check exists because Windows PowerShell's `Compress-Archive` writes
**backslash** separators, which the ZIP specification forbids — itch.io
unpacks such an archive as a flat pile of files called `assets\app-xxxx.js`,
every asset 404s, and the player gets a black screen. The zip is valid, the
right size, and completely broken, and nothing says so until it is live. The
packager uses Windows' bundled `bsdtar` instead, by absolute path, because
`tar` on `PATH` resolves to Git's GNU tar on any developer machine and GNU tar
cannot write zip at all.

## Before you ship

```bash
npm ci
npm run setup          # MediaPipe wasm + model, and the self-hosted fonts
npm run verify         # typecheck, tests, build, privacy, flash safety
npm run check:ui       # needs `npm run dev` running; screenshots every screen
npm run soak           # optional: plays the whole game headlessly
```

`public/mediapipe/` and `public/fonts/` are deliberately not in the repo —
they are copied out of `node_modules` by `npm run setup`. **If you ever deploy
by hand, run that first**, or you will publish a game whose camera never
starts and whose typefaces fall back to the system default.

## Things that are already true, and worth not breaking

- **No cross-origin isolation needed.** The bundled MediaPipe wasm is the
  single-threaded build, so it needs no `SharedArrayBuffer` and therefore no
  COOP/COEP headers. This is why Pages and itch both work — neither lets you
  set response headers.
- **No runtime network calls at all.** `npm run check:privacy` scans the built
  bundle and fails on any external URL. Everything, including the 13 MB wasm,
  is served from the same origin.
- **The camera never leaves the device.** Nothing is uploaded, so there is no
  backend to provision and no privacy policy to host.

# public/mediapipe

**Generated. Not committed.** Run `npm run setup:mediapipe` to populate.

That script copies the wasm runtime out of `node_modules/@mediapipe/tasks-vision`
and downloads `face_landmarker.task` from Google's published model URL, once,
at setup time. At play time the game loads both from **this directory, on its
own origin** — never from a CDN (CLAUDE.md invariant 1), which is what makes
"the camera never leaves this device" true rather than aspirational.

```
public/mediapipe/
├── face_landmarker.task                  3.58 MB   Apache 2.0
└── wasm/
    ├── vision_wasm_internal.js           SIMD build — the one normally used
    ├── vision_wasm_internal.wasm         13.0 MB
    ├── vision_wasm_nosimd_internal.js    fallback for browsers without SIMD
    └── vision_wasm_nosimd_internal.wasm  12.2 MB
```

The `vision_wasm_module_internal.*` build that ships in the package is **not**
copied: it is only reachable via `FilesetResolver.forVisionTasks(path, true)`,
and the game never passes `useModule`. Skipping it saves 13 MB per deploy.

A given browser downloads exactly **one** of the two wasm builds, and only when
the player turns the camera on. Assist mode downloads neither.

Set `FACEPLANT_SIMD_ONLY=1` before running the setup script to drop the no-SIMD
fallback as well, halving the deploy. Every browser the game targets has had
WebAssembly SIMD since 2021, but without the fallback an older one gets a 404
rather than a slow frame rate — so it is opt-in.

Decision (PLAN.md Day 0): these files are **regenerated, not committed**, so
the repository stays small and the licence story stays in `docs/CREDITS.md`.

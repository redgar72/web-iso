# Web Iso — 2.5D Isometric Game

A Diablo 2 Resurrected–style 2.5D isometric game that runs in the browser with GPU-friendly rendering.

## Features

- **Isometric camera** — Orthographic projection with fixed ~30° elevation and 45° azimuth; pan (drag) and zoom (scroll) in screen space.
- **GPU-oriented rendering**
  - **Instanced meshes** — Terrain and props use `InstancedMesh` so many tiles/objects are drawn in a single draw call.
  - **WebGL2** with `powerPreference: 'high-performance'`, shadow maps, tone mapping, and limited pixel ratio for stability.
- **Fixed timestep game loop** — 60 Hz updates for deterministic logic; rendering every frame for smooth display.
- **Shadows & lighting** — One directional sun (with shadows), fill light, and ambient for a D2-style look.

## Run

```bash
npm install
npm run dev
```

Then open the URL shown (e.g. http://localhost:5173). Drag to pan, scroll to zoom.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions** (not "Deploy from a branch" — that would serve the raw source and break).
4. Push to `main`/`master` or run the **Deploy to GitHub Pages** workflow from the **Actions** tab.
5. Open the game at **`https://<username>.github.io/<repo-name>/`** — e.g. `https://redgar72.github.io/web-iso/` (the trailing path is required).

If you see "Loading module ... was blocked because of a disallowed MIME type (text/html)", the wrong thing is being served: either Pages is still set to deploy from a branch (switch to GitHub Actions), or you're opening the root URL instead of `.../web-iso/`.

To build for a custom base path locally (e.g. to test the deployed layout):

```bash
VITE_BASE_PATH=/your-repo-name/ npm run build
npm run preview
# Open http://localhost:4173/your-repo-name/
```

## Project layout

- `src/main.ts` — Entry point, renderer, scene setup, input (pan/zoom).
- `src/core/IsoCamera.ts` — Isometric orthographic camera and pan/zoom.
- `src/core/GameLoop.ts` — Fixed timestep loop (update + render).
- `src/scene/IsoTerrain.ts` — Instanced floor grid and optional instanced pillars.
- `src/scene/IsoLights.ts` — Directional + ambient + fill lights and shadows.

## Extending

- **WebGPU**: For even better GPU utilization you can add Three.js `WebGPURenderer` (from `three/addons`) with a WebGL2 fallback when WebGPU isn’t available.
- **More content**: Add more `InstancedMesh` types (trees, rocks, etc.) and/or skinned characters; keep draw calls low by batching per material/mesh type.
- **Post-processing**: Add a `EffectComposer` (SSAO, bloom, color grading) for a more polished look once the base scene is in place.

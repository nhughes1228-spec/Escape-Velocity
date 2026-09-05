# Escape Velocity

An incremental rocket-building game: launch, measure, improve, repeat. Start with simple altitude records; reveal deeper rocketry only when it creates a useful new decision.

Canonical repository: [nhughes1228-spec/Escape-Velocity](https://github.com/nhughes1228-spec/Escape-Velocity) (public).

**Current state:** Phase 2 domain/save checkpoint. The public `main` deployment remains the accepted Phase 1 first-playable build; this branch adds the specified Credits, upgrade, seeded-recipe, settlement and local-save foundations, but intentionally stops before Phase 2 upgrade-card UI integration pending Astra review.

## Project record

- [Game design](docs/GAME_DESIGN.md)
- [Physics model](docs/PHYSICS.md)
- [Balance and pacing](docs/BALANCE.md)
- [Software architecture](docs/ARCHITECTURE.md)
- [Roadmap and current state](docs/ROADMAP.md)
- [Phase 1 audit and Phase 2 implementation specification](docs/PHASE_2_SPEC.md)
- [Phase 2 implementation checkpoint](docs/PHASE_2_IMPLEMENTATION.md)
- [Instructions for every agent](AGENTS.md)

## Play online

[Open the live Phase 1 game](https://nhughes1228-spec.github.io/Escape-Velocity/)

This is the accepted live Phase 1 URL. The public repository's deployment workflow enables Pages and publishes `main` at this repository-subpath URL using **GitHub Actions**. The deployment and a first launch were verified in a browser on 2026-09-05. The Phase 2 checkpoint branch is not yet the public playable Phase 2 release.

## Development

Requires Node 24.14.0 (see `.nvmrc`):

```sh
npm ci
npm run dev
```

Open the printed local URL (normally `http://localhost:5173/`). Keep the Vite dev server running while playing. Do not double-click a source file or `dist/index.html`; browsers do not resolve the module assets correctly from a `file://` URL.

## Production build and testing

```sh
npm run typecheck
npm test -- --run
npm run build
npm run balance:report
npx playwright install chromium  # once per machine
npm run test:e2e
```

`npm run build` creates a host-root production bundle. Serve it over HTTP with `npm run preview` and open the printed preview URL; it is not a standalone double-clickable HTML file.

To verify the GitHub Pages repository-subpath bundle locally:

```sh
npm run test:e2e:pages
```

That command builds with `/Escape-Velocity/` as Vite’s base, serves the result, and checks the same URL shape used by GitHub Pages. The production TypeScript report sweeps 729 opening rocket builds at two timesteps and models two purchasing strategies. See [report](docs/balance-report.json) and [balance configuration](balance/opening.json). Minor cross-platform floating-point differences should be assessed against documented tolerances, not blindly accepted.

The browser smoke tests use an injected presentation clock for deterministic CI state transitions; normal play uses foreground wall time and pauses when the tab is hidden. If a JavaScript bundle cannot load or React fails during boot, the page shows a recovery message with a refresh action instead of remaining blank.

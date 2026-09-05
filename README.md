# Escape Velocity

An incremental rocket-building game: launch, measure, improve, repeat. Start with simple altitude records; reveal deeper rocketry only when it creates a useful new decision.

Canonical repository: [nhughes1228-spec/Escape-Velocity](https://github.com/nhughes1228-spec/Escape-Velocity) (private).

**Current state:** Phase 1 first playable launch. The fixed starter rocket can be launched, observed through ignition, powered ascent, burnout and coast, then replayed with a session record. Phase 2 adds Credits, upgrades and saves.

## Project record

- [Game design](docs/GAME_DESIGN.md)
- [Physics model](docs/PHYSICS.md)
- [Balance and pacing](docs/BALANCE.md)
- [Software architecture](docs/ARCHITECTURE.md)
- [Roadmap and current state](docs/ROADMAP.md)
- [Instructions for every agent](AGENTS.md)

## Verify the application

Requires Node 24.14.0 (see `.nvmrc`):

```sh
npm ci
npm run typecheck
npm test -- --run
npm run build
npm run balance:report
npx playwright install chromium  # once per machine, for browser smoke tests
npm run test:e2e
```

`npm run dev` starts the local game. The production TypeScript report sweeps 729 opening rocket builds at two timesteps and models two purchasing strategies. See [report](docs/balance-report.json) and [balance configuration](balance/opening.json). Minor cross-platform floating-point differences should be assessed against documented tolerances, not blindly accepted.

The browser smoke tests use an injected presentation clock for deterministic CI state transitions; normal play uses foreground wall time and pauses when the tab is hidden. No hosting provider or license has been selected.

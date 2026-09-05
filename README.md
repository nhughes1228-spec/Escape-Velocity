# Escape Velocity

An incremental rocket-building game: launch, measure, improve, repeat. Start with simple altitude records; reveal deeper rocketry only when it creates a useful new decision.

Canonical repository: [nhughes1228-spec/Escape-Velocity](https://github.com/nhughes1228-spec/Escape-Velocity) (private).

**Current state:** architecture/design foundation. There is no runnable game yet. Next: [Luna Phase 1 implementation handoff](docs/LUNA_PHASE_1.md).

## Project record

- [Game design](docs/GAME_DESIGN.md)
- [Physics model](docs/PHYSICS.md)
- [Balance and pacing](docs/BALANCE.md)
- [Software architecture](docs/ARCHITECTURE.md)
- [Roadmap and current state](docs/ROADMAP.md)
- [Instructions for every agent](AGENTS.md)

## Verify the foundation

Requires Python 3.9+ with its standard library only:

```sh
python3 tools/balance_probe.py > /tmp/escape-velocity-balance-report.json
diff -u docs/balance-report.json /tmp/escape-velocity-balance-report.json
git diff --check
```

The report sweeps 729 opening rocket builds at two timesteps and models two purchasing strategies. It is a design experiment, not production application validation. See [report](docs/balance-report.json) and [balance configuration](balance/opening.json). Minor cross-platform floating-point differences should be assessed against documented tolerances, not blindly accepted.

Phase 1 replaces this temporary Python probe with a report using the production TypeScript solver, and adds build/unit/browser commands. No hosting provider or license has been selected.

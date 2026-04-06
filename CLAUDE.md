# Twerk

## What is Twerk?

Twerk is a composable toolkit for plan-oriented agentic engineering, rebuilt from the ground up from [erk](https://github.com/dagster-io/erk). Where erk grew organically into a monolith, twerk extracts its best ideas into well-separated, independently adoptable features.

**The goal**: each feature (objectives, plans, worktrees, etc.) should be usable on its own, without buying into the entire system. A team should be able to adopt just the objective tracker, or just the plan workflow, without pulling in unrelated machinery.

**Source repo**: `/Users/schrockn/code/erk` — we port features incrementally, rethinking and simplifying as we go. This is a "move into a new house" process: we bring over what works, leave behind what doesn't, and improve the architecture along the way.

## Status

Unreleased, private software. We can break backwards compatibility freely.

## Tech Stack

- **Language**: Python 3.11+ (uv)
- **CLI**: Click
- **Build**: Hatchling
- **Linting/Formatting**: Ruff
- **Type checking**: ty
- **Testing**: pytest

## Project Structure

```
twerk/
├── src/twerk/          # Main package
│   └── cli/            # Click CLI entry point
├── tests/              # Test suite
├── pyproject.toml      # UV project config
└── justfile            # lint, fix, ty, test, fast-ci
```

## Development Rules

- **Never use raw `pip install`**. Always use `uv`.
- **Never commit directly to `main`**. Create a feature branch first.
- Prefer LBYL (look before you leap) over EAFP (easier to ask forgiveness).
- Use frozen dataclasses or Pydantic models for data. Avoid mutable state where possible.
- Use modern Python type syntax (`str | None`, not `Optional[str]`).
- Keep features decoupled. A feature should declare its dependencies explicitly, not reach into other subsystems.

## Design Principles

1. **Composability over integration** — each feature works standalone. No hidden coupling between subsystems.
2. **GitHub as storage** — objectives, plans, and metadata live in GitHub issues and PRs, not local state. This makes the system distributed and transparent.
3. **Small, testable units** — pure functions and data transformations over complex class hierarchies. Gateway interfaces for external I/O.
4. **Port, don't copy** — when bringing code from erk, rethink the design. Simplify interfaces, remove unnecessary abstractions, and cut dependencies.

---
name: ns-fake-driven-test-layout
description: "Per-package test directory convention for fake-driven Python projects. Defines the canonical layout `tests/{unit,integration,scenario,gateways}/` and what belongs in each subfolder. Use whenever creating a new package, reorganizing tests, or deciding which subdirectory a new test file goes in. This skill owns the on-disk layout that `ns-py-fake-driven-testing` defers to for placement decisions; that skill still owns the architectural strategy (the five test layers, the gateway/fake pattern, the scenario shape) and `ns-pytest` still owns the pytest mechanics (fixtures, parametrize, mocking style)."
---

# ns-fake-driven-test-layout

A single, opinionated directory convention for organizing Python tests. Each
package gets its own `tests/` directory with four subdirectories — `unit/`,
`integration/`, `scenario/`, and `gateways/` — and that's it. No test file
lives at the root of `tests/`; every file is classified.

## The convention

```
<package>/tests/
├── unit/                       # fast, isolated, deterministic
├── integration/                # real systems, slow, sparingly used
├── scenario/                   # end-to-end Arrange/Act/Assert over fakes
└── gateways/                   # everything gateway-shaped
    ├── fakes/
    │   ├── <gateway_a>.py      # fake implementations live here
    │   └── <gateway_b>.py
    ├── test_fakes.py           # tests of the fakes themselves
    └── test_real_gateways.py   # mock-based sanity tests of real impls
```

For monorepos with multiple packages, every package gets its own copy of this
tree (e.g. `packages/foo/tests/unit/`, `packages/bar/tests/unit/`, …). For
single-package projects, the package's `tests/` lives at the repo root and the
same four subdirectories apply.

## What goes where

### `tests/unit/`

Pure functions and narrow logic-over-fakes. Tests that import a single source
module, hand it primitive inputs (or a fake gateway built inline), and assert
on the return value. Milliseconds per test. No subprocess, no network, no
filesystem writes that exercise filesystem semantics. If you reach for
`tmp_path` to test "what happens when this directory contains a symlink loop"
the test belongs in `integration/`, not here.

### `tests/integration/`

Real systems. Real filesystem (`tmp_path` used to actually exercise filesystem
behavior), real subprocesses, real HTTP, real databases. Slow by comparison
(tens of milliseconds to seconds). Used sparingly — these are smoke tests
that catch wiring mistakes between your code and the outside world. If a real
filesystem or subprocess is not part of what's being tested, the test belongs
in `unit/` or `scenario/`.

### `tests/scenario/`

End-to-end Arrange/Act/Assert tests that drive the production entry point —
`click.testing.CliRunner` for CLIs, the Flask/FastAPI test client for HTTP
services, the message-handler for queue consumers — with **every gateway
replaced by a fake**. These are the tests that prove a top-level workflow
("publish this post writes the row, invalidates the cache, and sends the
notification") works end-to-end without paying the cost of a real network or
database. They run in milliseconds because every external system is in-memory.
This is the majority shape for most applications. See
`ns-py-fake-driven-testing` reference `fast-scenario-testing.md` for the
pattern, the in-memory env factory, and worked examples.

### `tests/gateways/`

Everything gateway-shaped lives in one folder: the fake implementations, the
tests that prove the fakes behave correctly, and the mock-based sanity tests
of the real gateway implementations. Co-locating the three keeps gateway
evolution self-contained — when you add a method to a gateway ABC, you update
the real impl, the fake, and both gateway test files in one folder.

- **`tests/gateways/fakes/<gateway_name>.py`** — the fake implementations
  themselves. These are not tests (the filenames don't match `test_*.py` so
  pytest won't collect them). Other test files import from here:
  `from tests.gateways.fakes.gh_cli import FakeGhCli`.
- **`tests/gateways/test_fakes.py`** — tests that exercise the fakes
  themselves. They prove that, e.g., `FakeGhCli.list_repo_dir()` returns what
  was configured in the constructor and that mutation tracking works. Catches
  drift between the fake and the gateway ABC.
- **`tests/gateways/test_real_gateways.py`** — mock-based sanity tests of
  the real gateway implementations. These use `unittest.mock.patch` (or
  similar) to stub out the actual external call (`subprocess.run`, the HTTP
  library, etc.) and verify the real gateway parses the response correctly.
  Fast, mock-heavy, narrowly scoped. They are _not_ a substitute for real
  integration tests in `tests/integration/` — they only catch syntax errors
  and basic shape bugs in the real implementation.

## Mapping to `ns-py-fake-driven-testing` layers

| Layer | Name                 | Home                                                     |
| ----- | -------------------- | -------------------------------------------------------- |
| 5     | smoke (real systems) | `tests/integration/`                                     |
| 4     | logic (over fakes)   | `tests/scenario/` (end-to-end) or `tests/unit/` (narrow) |
| 3     | pure (zero deps)     | `tests/unit/`                                            |
| 2     | real-sanity (mocked) | `tests/gateways/test_real_gateways.py`                   |
| 1     | fake-check           | `tests/gateways/test_fakes.py`                           |

If you read `ns-py-fake-driven-testing` and it tells you to put a test in a
directory not listed above (`tests/e2e/`, `tests/services/`, `tests/commands/`,
`tests/unit/fakes/`), translate via this table — this skill is the source of
truth for placement.

## Pytest configuration

No special configuration is required. Projects already using
`testpaths = ["tests"]` (single-package) or
`testpaths = ["packages/foo/tests", "packages/bar/tests"]` (monorepo) discover
all four subdirectories recursively, because pytest collects every `test_*.py`
file under each test path. The subdirectory split is purely an organization
concern — pytest doesn't care.

A few file-naming details that matter:

- `tests/gateways/fakes/<name>.py` files do **not** start with `test_`, so
  pytest does not collect them. They are imported by tests, not run as tests.
- `tests/gateways/test_fakes.py` and `tests/gateways/test_real_gateways.py`
  follow the standard `test_*.py` pattern and are collected normally.
- Inside `unit/`, `integration/`, and `scenario/`, file names should mirror
  the source module being tested (`test_check.py` exercises `check.py`,
  `test_skillx.py` exercises `skillx.py`). The grouping comes from the parent
  directory, not the file name.

## Running subsets

Because the layout maps cleanly onto pytest paths, you can run any subset
without markers:

```
uv run pytest tests/unit                  # fastest, run on every save
uv run pytest tests/unit tests/scenario   # everything in-memory
uv run pytest tests/integration           # slow, run pre-push or in CI
uv run pytest tests/gateways              # gateway-only changes
```

If you want a marker-based slice as well (e.g. `-m fast`), add it on top —
the directory layout doesn't preclude markers, it just doesn't depend on them.

## Multi-package monorepos

Each package owns its own `tests/`. There is no shared top-level `tests/`
directory at the repo root. The four subdirectories live under each package:

```
packages/
├── foo/
│   ├── src/foo/
│   └── tests/
│       ├── unit/
│       ├── integration/
│       ├── scenario/
│       └── gateways/
└── bar/
    ├── src/bar/
    └── tests/
        ├── unit/
        ├── integration/
        ├── scenario/
        └── gateways/
```

`pyproject.toml` lists each package's `tests/` in `testpaths`:

```toml
[tool.pytest.ini_options]
testpaths = ["packages/foo/tests", "packages/bar/tests"]
```

Fakes are not shared across packages by default — each package's fakes live
under its own `tests/gateways/fakes/`. If two packages legitimately need to
share a fake, promote the gateway and its fake into a third package that both
depend on; do not reach across `tests/` directories.

## Cross-references

- **`ns-py-fake-driven-testing`** — the architectural strategy (five layers,
  ABC/Real/Fake pattern, gateway design, scenario shape, error boundaries).
  Read this when deciding _what_ to test and _which layer_ a test belongs to.
- **`ns-pytest`** — pytest mechanics (fixtures, `parametrize`, `tmp_path`,
  `monkeypatch`, `unittest.mock.patch` style, conftest scoping). Read this
  when writing the body of a test once you know which subdirectory it goes in.

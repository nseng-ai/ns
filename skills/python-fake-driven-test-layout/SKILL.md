---
name: python-fake-driven-test-layout
description: "Per-package test directory layout for fake-driven Python projects: `tests/{unit,integration,scenario,gateways}/`, optional `tests/conformance/`, and what belongs where. Use when creating a package, reorganizing tests, or placing a new test file. Defers architecture to `python-fake-driven-testing` and pytest mechanics to `pytest`."
---

# python-fake-driven-test-layout

A single, opinionated directory convention for organizing Python tests. Each
package gets its own `tests/` directory with four default subdirectories —
`unit/`, `integration/`, `scenario/`, and `gateways/` — plus an optional
`tests/conformance/`, added only for a gateway that intentionally adopts the
shared-contract layer from `python-fake-driven-testing`. No test file lives at the
root of `tests/`; every file is **classified** into one subdirectory.

## The convention

```
<package>/
├── src/<package>/gateways/
│   └── <domain>/                   # one subpackage per gateway domain
│       ├── gateway.py              # ABC + shared types
│       ├── real.py                 # real impl
│       └── fake.py                 # in-memory fake
└── tests/
    ├── unit/                       # fast, isolated, deterministic
    ├── integration/                # real systems, slow, sparingly used
    ├── scenario/                   # end-to-end Arrange/Act/Assert over fakes
    ├── gateways/                   # gateway *tests* only
    │   ├── test_fakes.py
    │   └── test_real_gateways.py
    └── conformance/                # optional shared gateway contracts
```

Single-package projects put this `tests/` tree at the repo root. Monorepos give
every package its own copy of the whole tree (`packages/foo/tests/unit/`,
`packages/bar/tests/unit/`, …) — see "Multi-package monorepos" below.

## Where gateway code lives

Every gateway domain (`gh`, `git`, `storage`, `queue`, …) gets its own subpackage
under `src/<package>/gateways/<domain>/` holding exactly three files, always named
`gateway.py` (ABC + shared types), `real.py` (real impl), and `fake.py` (in-memory
fake) — no prefixes, no repetition of the domain name (not `gh_gateway.py`, not
`real_gh.py`). The class names inside keep the domain prefix (`GhGateway`,
`RealGhGateway`, `FakeGhGateway`); only the filenames shed it.

An optional `__init__.py` may exist for package mechanics, but it must be empty or
docstring-only — do not re-export gateway classes from it. Callers import from the
canonical source modules instead:

- `from <package>.gateways.gh.gateway import GhGateway`
- `from <package>.gateways.gh.real import RealGhGateway`
- `from <package>.gateways.gh.fake import FakeGhGateway`

**Rationale.** Fakes are imported across every test directory (`unit/`,
`scenario/`, `gateways/`). Putting them in `tests/` forces a `sys.path` hack in
`conftest.py` so each subdirectory can find them; putting them in `src/` makes
them importable via normal package distribution with no tricks. Grouping
gateway/real/fake into one domain folder also keeps the three implementations in
lockstep — when a method is added to the ABC or a signature changes, the real and
fake are sitting right next to it. Canonical module imports also keep package
`__init__.py` files empty/docstring-only and avoid public re-export paths.

**Forbidden.** `conftest.py` path manipulation, fakes anywhere under `tests/`, and
splitting ABC/real/fake across unrelated folders (e.g. `gateway/<name>.py` +
`gateway/real_<name>.py`). If you find yourself wanting any of those, move into a
domain subpackage instead.

## What goes where

### `tests/unit/`

Pure functions and narrow logic-over-fakes. Tests that import a single source
module, hand it primitive inputs (or a fake gateway built inline), and assert on
the return value. Milliseconds per test. No subprocess, no network, no filesystem
writes that exercise filesystem semantics. If you reach for `tmp_path` to test
"what happens when this directory contains a symlink loop", the test belongs in
`integration/`, not here.

### `tests/integration/`

Real systems. Real filesystem (`tmp_path` used to actually exercise filesystem
behavior), real subprocesses, real HTTP, real databases. Slow by comparison (tens
of milliseconds to seconds). Used sparingly — these are smoke tests that catch
wiring mistakes between your code and the outside world. If a real filesystem or
subprocess is not part of what's being tested, the test belongs in `unit/` or
`scenario/`.

### `tests/scenario/`

End-to-end Arrange/Act/Assert tests that drive the production entry point —
`click.testing.CliRunner` for CLIs, the Flask/FastAPI test client for HTTP
services, the message-handler for queue consumers — with **every gateway replaced
by a fake**. These prove a top-level workflow ("publish this post writes the row,
invalidates the cache, and sends the notification") works end-to-end without
paying the cost of a real network or database; they run in milliseconds because
every external system is in-memory. This is the majority shape for most
applications. See `python-fake-driven-testing` reference `fast-scenario-testing.md`
for the pattern, the in-memory env factory, and worked examples.

### `tests/gateways/`

Gateway *tests* only — two default files. The fake implementations themselves live
under `src/<package>/gateways/<domain>/fake.py` (see "Where gateway code lives");
this directory holds only the tests that exercise them.

- **`test_fakes.py`** — tests that exercise the fakes themselves, imported via
  `from <package>.gateways.<domain>.fake import FakeX`. They prove that, e.g.,
  `FakeGhGateway.list_repo_dir()` returns what was configured in the constructor
  and that mutation tracking works. Catches drift between the fake and the gateway
  ABC.
- **`test_real_gateways.py`** — mock-based sanity tests of the real gateway
  implementations, imported via `from <package>.gateways.<domain>.real import
  RealX`. These use `unittest.mock.patch` (or similar) to stub out the actual
  external call (`subprocess.run`, the HTTP library, etc.) and verify the real
  gateway parses the response correctly. Fast, mock-heavy, narrowly scoped. They
  are *not* a substitute for real integration tests in `tests/integration/` — they
  only catch syntax errors and basic shape bugs in the real implementation.

### `tests/conformance/` (optional)

Shared gateway contract tests that every selected implementation must pass. Create
this directory only when a gateway has enough fake/real parity risk to justify the
Layer 6 infrastructure described by `python-fake-driven-testing`. Most packages
will not have this directory.

## Mapping to `python-fake-driven-testing` layers

`python-fake-driven-testing` describes six numbered layers; this table is the
source of truth for where each one lives:

| Layer | Name                   | Home                                                     |
| ----- | ---------------------- | -------------------------------------------------------- |
| 6     | conformance (optional) | `tests/conformance/`                                     |
| 5     | smoke (real systems)   | `tests/integration/`                                     |
| 4     | logic (over fakes)     | `tests/scenario/` (end-to-end) or `tests/unit/` (narrow) |
| 3     | pure (zero deps)       | `tests/unit/`                                            |
| 2     | real-sanity (mocked)   | `tests/gateways/test_real_gateways.py`                   |
| 1     | fake-check             | `tests/gateways/test_fakes.py`                           |

If `python-fake-driven-testing` tells you to put a test in a directory not listed
here (`tests/e2e/`, `tests/services/`, `tests/commands/`, `tests/unit/fakes/`),
translate via this table — this skill is the source of truth for placement.

## Pytest configuration

No special configuration is required. Projects already using
`testpaths = ["tests"]` (single-package) or
`testpaths = ["packages/foo/tests", "packages/bar/tests"]` (monorepo) discover
every subdirectory recursively, because pytest collects every `test_*.py` file
under each test path. The subdirectory split is purely an organization concern —
pytest doesn't care.

Inside `unit/`, `integration/`, and `scenario/`, file names mirror the source
module under test (`test_check.py` exercises `check.py`, `test_skillx.py` exercises
`skillx.py`); the grouping comes from the parent directory, not the file name. The
two `tests/gateways/` files keep their fixed `test_*.py` names and are collected
normally. (Gateway *source* file naming — `gateway.py`/`real.py`/`fake.py` — is
covered under "Where gateway code lives".)

## Running subsets

Because the layout maps cleanly onto pytest paths, you can run any subset without
markers:

```
uv run pytest tests/unit                  # fastest, run on every save
uv run pytest tests/unit tests/scenario   # everything in-memory
uv run pytest tests/integration           # slow, run pre-push or in CI
uv run pytest tests/gateways              # gateway-only changes
uv run pytest tests/conformance           # optional gateway contracts, when present
```

If you want a marker-based slice as well (e.g. `-m fast`), add it on top — the
directory layout doesn't preclude markers, it just doesn't depend on them.

## Multi-package monorepos

Each package owns its own `tests/` — there is no shared top-level `tests/` at the
repo root. Every package repeats the full tree from "The convention" under its own
directory (`packages/foo/`, `packages/bar/`, …), and `pyproject.toml` lists each
package's `tests/` in `testpaths`:

```toml
[tool.pytest.ini_options]
testpaths = ["packages/foo/tests", "packages/bar/tests"]
```

Fakes are not shared across packages by default — each package owns its own
`src/<pkg>/gateways/<domain>/` tree, including the fake. If two packages
legitimately need to share a gateway and fake, promote the whole domain subpackage
into a third package that both depend on; do not reach across `src/` or `tests/`
directories.

## Cross-references

- **`python-fake-driven-testing`** — the architectural strategy (six layers,
  including optional conformance, plus ABC/Real/Fake pattern, gateway design,
  scenario shape, and error boundaries). Read this when deciding *what* to test and
  *which layer* a test belongs to.
- **`pytest`** — pytest mechanics (fixtures, `parametrize`, `tmp_path`,
  `monkeypatch`, `unittest.mock.patch` style, conftest scoping). Read this when
  writing the body of a test once you know which subdirectory it goes in.

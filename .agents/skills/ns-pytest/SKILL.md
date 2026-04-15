---
name: ns-pytest
description: "Pytest-specific style guide for writing and reviewing tests. Use when deciding between fixtures, context managers, and plain helpers; choosing module-level `test_*` functions instead of test classes; using `@pytest.mark.parametrize`, `tmp_path`, `monkeypatch`, and `capsys`; structuring `unittest.mock.patch`; or cleaning up `autouse` fixtures and `conftest.py` sprawl. Prescribes functional-only tests, a strict setup hierarchy, and pragmatic mocking defaults. For architecture-level questions about gateway/fake design or where tests belong in the stack, use `ns-py-fake-driven-testing` instead."
---

# ns-pytest

Low-level style guide for writing pytest tests. Covers the mechanics
— fixtures, classes, markers, mocking, setup patterns — that sit underneath
the architectural guidance in `ns-py-fake-driven-testing`.

## Philosophy

Tests are boring, explicit, and locally readable. If you have to trace
through `conftest.py` files and fixtures to understand what a test does,
you've gone wrong. A test should read top-to-bottom like a short story
with no flashbacks: set up the scenario in the test body (or a helper
called from the test body), do the thing, assert what you expected.

## Relationship to ns-py-fake-driven-testing

`ns-py-fake-driven-testing` is the higher-level, more opinionated skill. It
answers _what_ to test, _where_ the test belongs in the defense-in-depth
stack, and _how to structure the seam_ between your code and its
dependencies (ABC gateways, fakes). `ns-pytest` answers _how to write
the test_ once you've made those decisions. The two compose: use
`ns-py-fake-driven-testing` to design the test, use `ns-pytest` to write
the Python. When the two seem to conflict, `ns-py-fake-driven-testing` wins on
architecture and `ns-pytest` wins on pytest mechanics.

Some tests inside the ns-py-fake-driven-testing stack legitimately need
`unittest.mock.patch` (e.g. the thin boundary tests that exercise a
gateway's real implementation against the stdlib). The mocking section
below is written for exactly those cases, not as a general license to
reach for mocks.

## Style: functional only

All tests are module-scope functions prefixed with `test_`. No
JUnit-style test classes.

```python
# BAD
class TestDiscoverGroup:
    def test_basic(self) -> None:
        ...
    def test_errors_wrong_return_type(self) -> None:
        ...

# GOOD
def test_discover_group_basic() -> None:
    ...

def test_discover_group_errors_wrong_return_type() -> None:
    ...
```

The class wrapper adds indentation, a useless `self` parameter, and a
second naming layer, and it makes test discovery output harder to skim.
If you find yourself wanting a class to group related tests, use a
shared prefix in the function names instead (`test_discover_group_*`)
and put them next to each other in the file. That's all the grouping
you need.

## The reliable subset

Use these pytest features. Don't reach for anything outside this list
without a specific reason:

- Plain `assert` and `pytest.raises(...)`
- `@pytest.mark.parametrize`
- Built-in fixtures: `tmp_path`, `tmp_path_factory`, `monkeypatch`, `capsys`, `capfd`
- Markers: `@pytest.mark.skip`, `@pytest.mark.skipif`, `@pytest.mark.xfail`
- `conftest.py` — sparingly, and never nested more than one level deep

Things deliberately excluded from the reliable subset: `autouse`
fixtures, `pytest.fixture` used as a data builder, yield fixtures for
anything other than cleanup of an actually expensive shared resource,
fixture factories (fixtures that return callables), and `tmpdir` /
`tmpdir_factory` (use the `pathlib`-based `tmp_path` equivalents).

## Setup hierarchy

Three ways to prepare state for a test. Use them in this order of
preference, and only move down the list when the level above genuinely
can't do the job.

### 1. Plain helper functions (the default)

For building test data, constructing objects, and setting up scenarios,
use a plain module-level function. Prefix it with `_` to mark it as
test-local. Call it explicitly from each test that needs it. No
pytest magic, no teardown, no fixture decorator.

```python
def _definition() -> ObjectiveDefinition:
    return ObjectiveDefinition(
        ref=ObjectiveRef(owner="acme", repo="myapp", issue_number=42),
        ...
    )

def test_objective_definition_round_trip() -> None:
    defn = _definition()
    ...
```

### 2. Context managers

When a test needs per-test setup _with_ teardown — patching
`sys.modules`, writing to a temporary file outside `tmp_path`, swapping
a process-global — write a `@contextmanager` helper function and use
it with a `with` statement in each test. The `with` block makes the
scope visible at the call site, and the `finally` clause makes the
cleanup traceable without any pytest knowledge.

```python
@contextmanager
def _fake_package(
    package_name: str,
    *,
    init_attrs: dict[str, Any] | None = None,
) -> Iterator[None]:
    pkg = types.ModuleType(package_name)
    pkg.__path__ = []
    for attr_name, attr_value in (init_attrs or {}).items():
        setattr(pkg, attr_name, attr_value)
    sys.modules[package_name] = pkg
    try:
        yield
    finally:
        sys.modules.pop(package_name, None)

def test_discover_group_basic() -> None:
    with _fake_package("_test_dg_basic", init_attrs={"users": users}):
        group = discover_group("_test_dg_basic")
    ...
```

This is the pattern to promote over yield fixtures.

### 3. Fixtures (only for expensive shared resources)

Reach for `@pytest.fixture` only when **both** of these are true:

1. The resource is genuinely expensive to construct (CLI discovery,
   test database, large file).
2. The resource is shared across many tests in the same module or session.

When you do use a fixture, give it `scope="module"` or `scope="session"`.
Never use function-scoped fixtures as a convenience wrapper around a
helper function — that's anti-pattern (3) in the next section.

Fixtures should not have a `yield` unless they actually need to tear
down the resource at the end of the scope. If there's nothing to clean
up, just `return`.

```python
@pytest.fixture(scope="module")
def cli_group() -> CliGroup:
    return discover_group("myapp.cli.commands")

def test_command_list(cli_group: CliGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"])
    assert result.exit_code == 0
```

This is the shape every fixture should have: one fixture, scoped to the
module, shared across several tests, wrapping an expensive discovery
call, no yield.

## Mocking best practice

Mocking is allowed. Sometimes it is exactly what you need — thin boundary
tests, stdlib seams, code where the gateway/fake approach from
`ns-py-fake-driven-testing` is the wrong tool for the job. When you do reach
for a mock, follow these rules.

### Prefer `monkeypatch` for simple swaps

For replacing an attribute, an environment variable, or a `sys.path`
entry, use pytest's built-in `monkeypatch` fixture. It's pytest-native,
it has automatic teardown, and it makes the swap obvious at the call
site.

```python
def test_resolves_config_path_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MY_CONFIG", "/tmp/custom.toml")
    assert resolve_config_path() == Path("/tmp/custom.toml")
```

### Use `unittest.mock.patch` as a context manager

When you need the richer `Mock` API — call recording, return values,
side effects, spec checking — use `unittest.mock.patch` as a **context
manager**, not as a decorator. The context manager form makes the
patched scope visible in the test body, confines the patch to the lines
that need it, and composes naturally with other `with` blocks.

```python
# GOOD
def test_runs_git_command_once() -> None:
    with patch("myapp.git.subprocess.run", autospec=True) as mock_run:
        mock_run.return_value = CompletedProcess(args=[], returncode=0)
        run_git_status()
    mock_run.assert_called_once_with(
        ["git", "status", "--porcelain"],
        check=True,
        capture_output=True,
        text=True,
    )

# BAD: decorator stack hides scope and forces parameter ordering
@patch("myapp.git.subprocess.run")
@patch("myapp.git.os.environ")
def test_runs_git_command_once(mock_env, mock_run) -> None:
    ...
```

### Always spec your mocks

Every `Mock` and every `patch` must have a spec. Use `autospec=True` on
`patch`, or `spec=<class>` on a bare `Mock`. A naked `MagicMock()`
happily answers any attribute access, which hides signature drift and
typos. Specced mocks fail loudly the moment the real API changes.

```python
# GOOD
with patch("myapp.git.subprocess.run", autospec=True) as mock_run:
    ...

# BAD
with patch("myapp.git.subprocess.run") as mock_run:
    # mock_run.call_this_method_that_doesnt_exist() silently works
    ...
```

### Patch at the point of use

If `myapp/git.py` does `from subprocess import run` and then calls
`run(...)`, patch `myapp.git.run` — the name it was bound to at the
call site — not `subprocess.run`. Patching the source module doesn't
affect the already-imported reference in `myapp.git`.

### Keep patches narrow

Patch the smallest thing you can get away with. One attribute on one
module is better than the whole module. A context manager around three
lines is better than a context manager around the entire test body.
Every extra thing inside the patch is a chance for the test to pass
for the wrong reason.

### Don't mock what you don't own

Mock your own seams — interfaces you control, boundaries you defined.
Don't mock third-party library internals (`requests.Session._send`,
`click.Context._depth`). When the library updates, your mock becomes
fiction. If you need to fake a third-party library, wrap it in your own
gateway first (see `ns-py-fake-driven-testing`) and mock the gateway.

### Assert on calls meaningfully

`mock.assert_called()` only tells you the mock was touched. That's
almost never what you actually care about. Assert on the arguments:
`assert_called_once_with(...)`, `assert_called_with(...)`, or inspect
`mock.call_args` directly. If the arguments don't matter, you probably
don't need a mock at all.

### If you need many mocks, reach for a fake

A test that needs three or more mocks to set up is a signal that the
code under test has the wrong seam. Stop, close the test file, and go
read `ns-py-fake-driven-testing`. Introducing an ABC gateway and a fake
implementation will almost always produce a cleaner test than stacking
more `patch` calls.

### `pytest-mock` / `mocker` fixture

The `pytest-mock` plugin provides a `mocker` fixture that is essentially
`unittest.mock.patch` with automatic teardown. The context-manager form
of `patch` is already clean and its scope is already visible, so
`pytest-mock` is not required. If the project already uses it, fine;
don't introduce it just for convenience.

## Anti-patterns

- **Test classes** (`class TestFoo:`). Flatten to module-level functions
  with a shared prefix.
- **`autouse=True` fixtures.** Magic setup that runs without being
  requested. If every test needs it, make it explicit; if only some
  tests need it, make it a helper or a context manager.
- **Deep conftest nesting.** More than one level of `conftest.py` is
  almost always a mistake. Fixtures should live next to the tests that
  use them, not in a parent directory that tests have to go looking for.
- **Fixture factories.** Fixtures that return a callable so tests can
  parameterize them. Just write a helper function — you're already
  halfway there.
- **Fixtures as data builders.** `@pytest.fixture` wrapping a one-line
  object construction. A plain helper function does this better and
  reads more clearly.
- **`yield` fixtures for trivial cleanup.** If the "teardown" is
  deleting a dict key or popping a value, use a context manager, not
  a fixture.
- **Fixtures used out of convenience.** "I didn't want to type the
  helper call in every test." Type it. The explicitness is the point.
- **`@patch` as a decorator stack.** Hides scope and forces parameter
  ordering that reverses the decorator order. Use `with patch(...)`.
- **`MagicMock()` without `spec=` / `autospec=True`.** Lies silently
  when the real API drifts.
- **Patching private methods of your own classes.** Couples the test
  to the implementation. Refactor the seam instead.
- **Mocking stdlib or third-party internals directly** (instead of
  wrapping them in a gateway and mocking the gateway).

## Naming

- Test functions: `test_` prefix, snake_case.
- Test helpers and private classes: `_` prefix.
- Either `test_<subject>_<behavior>` (e.g.
  `test_discover_group_rejects_wrong_return_type`) or
  `test_<behavior>` (e.g. `test_rejects_wrong_return_type`) is fine.
  Pick one per file and be consistent within the file.

## File organization

No prescription beyond:

- Test files are named `test_*.py`.
- They live under `tests/` at the repo root or under a per-package
  `tests/` directory.

Mirror the `src/` layout if it's useful. Don't if it isn't.

## Import mode

Use `--import-mode=importlib`. Set it in `pyproject.toml`:

    [tool.pytest.ini_options]
    addopts = "-q --import-mode=importlib"

This is pytest's recommended mode for new projects (see [Good
Integration Practices][gip] and [Import modes][imports]). The legacy
`prepend` default mutates `sys.path` and requires every test file
basename to be unique across the whole collection — which breaks in
monorepos where multiple packages each have, e.g., a
`tests/gateways/test_fakes.py`.

[gip]: https://docs.pytest.org/en/stable/explanation/goodpractices.html
[imports]: https://docs.pytest.org/en/stable/explanation/pythonpath.html

### No `__init__.py` under `tests/`

Do not create `__init__.py` in `tests/` or any subdirectory of it.
Pytest's older `prepend` docs recommend it as a way to disambiguate
duplicate test-file basenames; under `importlib` it is both
unnecessary and harmful. Turning `tests/` into a package re-enables
the cross-test-import pattern we're avoiding and makes it tempting to
drop a `tests/helpers.py` instead of putting shared utilities where
they belong (in `src/`).

### No `sys.path` manipulation

`conftest.py` must not append, insert, or otherwise mutate
`sys.path`. Nor should `pyproject.toml` set `pythonpath = [...]` —
that is the same thing in configuration form. Both are symptoms of
shared code living in the wrong place. Move the code to `src/` and
import it normally.

### Shared test utilities live with source, not with tests

A consequence of `importlib` mode: **test modules cannot import each
other.** There is no implicit `tests` package; `tests/helpers.py`
cannot be imported from `tests/unit/test_foo.py`. Pytest's own
[Import modes][imports] guidance is explicit: "testing utility
modules in test directories are not importable; the recommendation is
to place testing utility modules with the application/library code."

Put any cross-test utility — fakes, builders, canned fixtures, helper
classes — in the library's `src/` tree and import it as normal
application code.

For the gateway/fake layout that puts fakes under
`src/<package>/gateways/<name>/fake.py`, see
`ns-fake-driven-test-layout`.

## Approved plugins

- `pytest` — core
- `pytest-xdist` — parallel execution

Adding a new pytest plugin requires a justification in the PR that
adds it. Plugins change global test behavior in ways that are hard to
reason about later; the default answer is no.

## When NOT to use this skill

- Architecture questions — gateway / fake design, where a test belongs
  in the defense-in-depth stack, whether to introduce a fake →
  `ns-py-fake-driven-testing`.
- Refactoring existing `unittest.mock.patch` code into the
  gateway/fake pattern → `ns-py-fake-driven-testing`
  (see `references/mock-to-fake-conversion.md`).
- General Python style — type hints, LBYL vs EAFP, pathlib,
  exceptions → `ns-dignified-python`.

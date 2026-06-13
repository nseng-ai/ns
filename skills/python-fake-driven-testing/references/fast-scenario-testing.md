---
name: fake-driven-testing-fast-scenario-testing
description: End-to-end scenario tests over fakes — the canonical Layer 4 shape for CLIs and top-level workflows
---

# Fast Scenario Testing

**Read this when**: You're testing a CLI command, a top-level workflow, or any feature that coordinates multiple gateways and you want to verify its end-to-end outcome.

## Overview

A **fast scenario test** is the dominant shape of Layer 4 "logic" tests for CLIs and top-level workflows. The pattern is three phases:

1. **Arrange**: Configure initial state inside in-memory fakes (multiple, if the feature crosses several gateways).
2. **Act**: Invoke the feature exactly once at its end-user entry point — typically a CLI command via `CliRunner`.
3. **Assert**: Inspect the resulting state on the fakes (and the captured stdout/exit code) to verify the *outcome* of the scenario.

This is not a new testing layer. It is a specialization of Layer 4 "logic" — the layer where 70% of tests should live. Naming it explicitly makes it easy to recognize and reach for.

The key insight: a fast scenario test exercises the **whole** code path under test (parsing, dispatch, business logic, gateway calls) while still running in milliseconds, because every external system has been replaced by an in-memory fake.

## When to Use This Pattern

Use a fast scenario test when:

- You're testing a **CLI command** end-to-end
- You're testing a **top-level workflow** that coordinates multiple gateways (e.g. "land this PR" touching git + GitHub + a metadata store)
- You want to verify the **outcome** of a feature, not the behavior of one component in isolation
- You want **fast iteration** — milliseconds per test, dozens of tests per second

Reach for it as the *default* shape for any test that would otherwise be tempted to subprocess-out, mock framework internals, or assert on the order of internal calls.

Scenario assertion priority is explicit: assert exit code and user-visible output first, then assert on stable post-state in the fakes. Reach for public mutation-tracking properties only when no durable after-state exists. Never assert on private fake fields such as `_checkout_calls` or `_sent_emails` in a scenario test.

## The Three-Phase Structure

```python
def test_create_user_command_persists_user() -> None:
    """Creating a user via the CLI writes to the database and sends a welcome email."""
    runner = CliRunner()

    # 1. ARRANGE: configure initial state in fakes
    fake_db = FakeDatabaseAdapter(tables={"users": []})
    fake_email = FakeEmailClient()
    ctx = AppContext(database=fake_db, email_client=fake_email)

    # 2. ACT: invoke the entry point exactly once
    result = runner.invoke(
        cli,
        ["user", "create", "alice@example.com", "--name", "Alice"],
        obj=ctx,
        catch_exceptions=False,
    )

    # 3. ASSERT: verify outcome on fakes and captured output
    assert result.exit_code == 0
    assert "Created user Alice" in result.stdout

    assert len(fake_db.tables["users"]) == 1
    assert fake_db.tables["users"][0]["name"] == "Alice"
    assert fake_db.tables["users"][0]["email"] == "alice@example.com"

    assert len(fake_email.sent_emails) == 1
    assert fake_email.sent_emails[0]["to"] == "alice@example.com"
```

The shape is rigid on purpose: the **Act** phase is *one* invocation. If you find yourself making multiple calls into internals between Arrange and Assert, you've drifted out of the scenario pattern and into stepwise unit testing — which is fine, but it's a different test.

## Why This Pattern Excels for CLIs

CLIs are unusually well-suited to fast scenario testing:

- **No subprocess overhead.** `click.testing.CliRunner` invokes commands in-process. A scenario test runs in milliseconds; the equivalent subprocess test runs in seconds. The speed difference (~100x) is the difference between "I run the suite on every save" and "I run it before pushing."
- **Deterministic.** Fakes have no real git, no real network, no real filesystem. The same test produces the same result on every machine, every CI run, forever.
- **Tests actual code paths.** Argument parsing, option validation, command dispatch, error formatting — all of it runs for real. You're not mocking `parse_args` and pretending; you're calling the same `click.command` that production calls.
- **Multi-gateway side effects in one assertion block.** A "land PR" command might touch git, GitHub, a metadata store, and a notification service. A scenario test sets all four fakes up once and then asserts on all four after one invocation. No other test shape gives you that.
- **Multi-phase commands work cleanly.** Commands that validate then generate then execute (think "dry-run generates a script, then a follow-up command runs it") are natural to test as scenarios — the test asserts on the script the command produces *without* actually running it.

For the underlying CliRunner mechanics, see `patterns.md#using-clirunner-for-cli-tests`.

## Building Scenario Infrastructure

A productive scenario test suite needs three small pieces of infrastructure. Build them once per project; every scenario test reuses them.

### 1. A scenario environment context manager

The environment owns whatever ambient setup every scenario needs (a CliRunner, a working "root" path, an isolation boundary for filesystem operations) and tears it down on exit. Two flavors are useful:

**In-memory environment (preferred):** uses sentinel paths that *raise* on real filesystem operations. Forces tests to stay pure.

```python
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from click.testing import CliRunner


@dataclass
class ScenarioEnv:
    runner: CliRunner
    root: Path
    cwd: Path


@contextmanager
def scenario_env() -> Iterator[ScenarioEnv]:
    """In-memory scenario environment. Sentinel paths; no real filesystem I/O."""
    runner = CliRunner()
    yield ScenarioEnv(
        runner=runner,
        root=Path("/__scenario__/root"),  # sentinel — never touched
        cwd=Path("/__scenario__/cwd"),
    )
```

**Isolated-filesystem environment:** wraps `runner.isolated_filesystem()` for the rare scenarios that genuinely need a real directory tree (e.g. tests of filesystem-walking commands).

```python
@contextmanager
def scenario_fs_env(tmp_path: Path) -> Iterator["ScenarioFsEnv"]:
    """Scenario environment backed by a real isolated filesystem."""
    runner = CliRunner()
    with runner.isolated_filesystem(temp_dir=tmp_path):
        yield ScenarioFsEnv(runner=runner, root=Path.cwd())
```

**Default to in-memory.** Reach for the filesystem variant only when the code under test inherently needs filesystem behavior. The in-memory variant is faster *and* it catches accidental filesystem dependencies as test failures rather than letting them silently work.

### 2. A smart context builder

A factory that produces the application context for the test, filling in sensible default fakes for any gateway the test doesn't specify:

```python
def build_context(
    *,
    database: DatabaseAdapter | None = None,
    email_client: EmailClient | None = None,
    cache: CacheAdapter | None = None,
    notification: NotificationGateway | None = None,
) -> AppContext:
    """Build a test AppContext with default fakes for any unspecified gateway."""
    return AppContext(
        database=database or FakeDatabaseAdapter(),
        email_client=email_client or FakeEmailClient(),
        cache=cache or FakeCacheAdapter(),
        notification=notification or FakeNotificationGateway(),
    )
```

The point is **selective configuration**: a test that only cares about the database passes in a configured `FakeDatabaseAdapter` and gets default fakes for everything else. The test reads as a focused statement about *the gateway it cares about*, not as a 40-line setup wall.

### 3. CLI assertion helpers

Small helpers that compress common assertion patterns:

```python
from click.testing import Result


def assert_cli_success(result: Result, *expected: str) -> None:
    """Assert command exited 0 and stdout contains every expected substring."""
    assert result.exit_code == 0, (
        f"Expected exit 0, got {result.exit_code}\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )
    for substring in expected:
        assert substring in result.stdout, (
            f"Expected {substring!r} in stdout, got: {result.stdout}"
        )


def assert_cli_error(result: Result, *expected: str, exit_code: int = 1) -> None:
    """Assert command failed with a specific exit code and error messages."""
    assert result.exit_code == exit_code
    for substring in expected:
        assert substring in (result.stdout + result.stderr)
```

These helpers are tiny but they massively improve failure output — a green test reads cleanly, and a red test tells you exactly what it expected and what it got.

## Coordinating Multiple Fakes

The pattern's biggest leverage is on commands that touch many gateways at once. The shape stays the same — Arrange, Act, Assert — but the Arrange phase configures *every* fake the command will exercise.

```python
def test_publish_post_command() -> None:
    """Publishing a post writes the DB row, invalidates the cache, and sends a notification."""
    with scenario_env() as env:
        # Arrange: configure initial state across three gateways
        fake_db = FakeDatabaseAdapter(
            tables={"posts": [{"id": 1, "title": "Draft", "status": "draft"}]},
        )
        fake_cache = FakeCacheAdapter(
            entries={"posts:list": ["cached-list"]},
        )
        fake_notification = FakeNotificationGateway()

        ctx = build_context(
            database=fake_db,
            cache=fake_cache,
            notification=fake_notification,
        )

        # Act: one CLI invocation
        result = env.runner.invoke(
            cli,
            ["post", "publish", "1"],
            obj=ctx,
            catch_exceptions=False,
        )

        # Assert: outcome across all three fakes
        assert_cli_success(result, "Published post 1")

        # Database row was updated
        assert fake_db.tables["posts"][0]["status"] == "published"

        # Cache was invalidated
        assert "posts:list" not in fake_cache.entries

        # Notification outbox now contains the published event
        assert len(fake_notification.sent) == 1
        assert fake_notification.sent[0].topic == "post.published"
```

Each fake is constructed with its own initial state via constructor injection (see `patterns.md#constructor-injection-for-fakes`). Nothing is mutated after construction except by the code under test. The test reads top-to-bottom: here is the world before, here is the action, here is the world after.

## Asserting on Output State

Scenario tests have four assertion surfaces. Use them in priority order:

1. Exit code
2. stdout / stderr
3. Final fake state
4. Public mutation tracking only when no durable after-state exists

| Surface                                 | When to use it                                              | Example                                                |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| **Exit code**                           | Did the command succeed or fail?                            | `assert result.exit_code == 0`                         |
| **stdout / stderr**                     | What did the user see?                                      | `assert "Created" in result.stdout`                    |
| **Final fake state**                    | What does the world look like after the command?            | `assert fake_db.tables["users"][0]["name"] == "Alice"` |
| **Public mutation tracking (fallback)** | No stable after-state exists, but the attempt still matters | `assert fake_clock.sleep_calls == [1.0, 2.0]`          |

Hard rule: never assert on private fake fields such as `_checkout_calls`, `_add_worktree_calls`, or `_sent_emails` in a scenario test. If a scenario needs a private field to be observable, expose a public outcome surface on the fake or move the assertion to a fake-check test of the fake itself or a narrower logic test where the interaction is the behavior.

A fake may record mutations without making interaction assertions the default scenario shape. Public collections such as an outbox or `sent_emails` can count as final fake state when they model the resulting world after the command. Call-history properties such as `executed_queries` are fallback-only surfaces in scenarios, not the default thing to assert.

For the mutation-tracking property pattern itself, see `patterns.md#mutation-tracking-properties`.

## Worked Example: Single-Gateway Scenario

A minimal scenario test — one gateway, one invocation, one assertion block.

```python
def test_rename_command_updates_user_name() -> None:
    """Renaming a user updates the database row and prints a confirmation."""
    with scenario_env() as env:
        fake_db = FakeDatabaseAdapter(
            tables={"users": [{"id": 1, "name": "Alice"}]},
        )
        ctx = build_context(database=fake_db)

        result = env.runner.invoke(
            cli,
            ["user", "rename", "1", "Alicia"],
            obj=ctx,
            catch_exceptions=False,
        )

        assert_cli_success(result, "Renamed user 1 to Alicia")
        assert fake_db.tables["users"][0]["name"] == "Alicia"
```

## Worked Example: Multi-Gateway Scenario

A scenario test for a command that coordinates several gateways and produces a script for deferred execution. The scenario asserts on the *generated script* and on the fact that no destructive side effects have happened yet.

```python
def test_archive_command_generates_script_without_executing() -> None:
    """`archive --script` plans the archive but does not delete or notify yet."""
    with scenario_env() as env:
        fake_db = FakeDatabaseAdapter(
            tables={
                "projects": [
                    {"id": 42, "name": "old-project", "status": "active"},
                ],
            },
        )
        fake_storage = FakeStorageGateway(
            objects={"projects/42/data.bin": b"...payload..."},
        )
        fake_notification = FakeNotificationGateway()

        ctx = build_context(
            database=fake_db,
            storage=fake_storage,
            notification=fake_notification,
        )

        result = env.runner.invoke(
            cli,
            ["project", "archive", "42", "--script"],
            obj=ctx,
            catch_exceptions=False,
        )

        # Script was generated and printed
        assert_cli_success(result)
        assert "archive-execute" in result.stdout
        assert "--project-id=42" in result.stdout

        # Crucially: nothing has actually been archived yet
        assert fake_db.tables["projects"][0]["status"] == "active"
        assert "projects/42/data.bin" in fake_storage.objects
        assert "projects/42/data.bin" not in fake_storage.deleted_keys
        assert len(fake_notification.sent) == 0
```

This is the shape that makes scenario testing pay off: a single test verifies a multi-gateway invariant ("the dry-run produced the right script *and* didn't touch anything") that no unit test could express on its own.

## When NOT to Use Scenario Tests

Scenario tests are the right tool for end-to-end outcomes, but they are the *wrong* tool for several other things:

| Situation                                                              | Use this instead                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pure utility with no dependencies (`sanitize_name`, `parse_status`)    | Layer 3 "pure" — call the function directly                                            |
| Verifying a real-system quirk (actual SQLite locking, real git rebase) | Layer 5 "smoke" — `tests/integration/` with real I/O                                   |
| Unit-testing one helper inside a command                               | Call the helper directly; don't go through the CLI                                     |
| Asserting on internal call ordering                                    | You're testing implementation, not behavior — reconsider whether the test should exist |
| Testing the fake itself                                                | Layer 1 "fake-check" — `tests/gateways/test_fakes.py`                                  |

Scenario tests shine when the question is "did the user get the outcome they asked for?" They are the wrong shape when the question is "does this one function compute the right number?"

## Anti-Patterns

**❌ Asserting on private fake call logs in a CLI scenario.**

```python
# Wrong: private fields turn the fake into a spy
assert fake_git._add_worktree_calls == [
    (repo_path, worktree_path, "feature/alice"),
]
assert fake_git._checkout_calls == [
    (worktree_path, "feature/alice"),
]
assert fake_git._detach_head_calls == [worktree_path]
```

**✅ Assert on user-visible output and post-state.**

```python
# Right: describe the outcome the user cares about
assert_cli_success(result, "Attached worktree for feature/alice")
assert fake_git.get_current_branch(worktree_path) == "feature/alice"
assert worktree_path in fake_git.list_worktrees()
assert fake_pool.load()["feature/alice"].path == worktree_path
```

---

**❌ Asserting on every intermediate call.**

```python
# Wrong: brittle, couples test to implementation
assert fake_db.executed_queries[0] == "BEGIN"
assert fake_db.executed_queries[1] == "SELECT id FROM users WHERE email = 'alice@example.com'"
assert fake_db.executed_queries[2] == "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')"
assert fake_db.executed_queries[3] == "COMMIT"
```

**✅ Assert on terminal state.**

```python
# Right: robust to refactoring; describes the outcome
assert fake_db.tables["users"][-1]["email"] == "alice@example.com"
assert fake_db.tables["users"][-1]["name"] == "Alice"
```

---

**❌ Sharing fake instances across tests via module-level state or session fixtures.**

```python
# Wrong: tests bleed state into each other; failures depend on order
_shared_db = FakeDatabaseAdapter()  # module level

def test_one() -> None:
    _shared_db.execute("INSERT ...")
    ...
```

**✅ Construct fresh fakes per scenario.**

```python
# Right: every test starts from a known initial state
def test_one() -> None:
    fake_db = FakeDatabaseAdapter()
    ...
```

---

**❌ Mocking parts of the CLI under test.**

```python
# Wrong: now you're testing a half-real, half-mock Frankenstein
with patch("myapp.cli.commands.user.create_user_logic") as mock_create:
    result = runner.invoke(cli, ["user", "create", "Alice"])
    mock_create.assert_called_once()
```

**✅ Inject fakes via the application context only. Let the real CLI code run.**

```python
# Right: the same code path that ships to users runs in the test
ctx = build_context(database=fake_db)
result = runner.invoke(cli, ["user", "create", "Alice"], obj=ctx)
assert fake_db.tables["users"][-1]["name"] == "Alice"
```

---

**❌ Hardcoded paths in scenario setup.**

```python
# Wrong: pollutes the developer's machine, breaks in CI
fake_repo = FakeGit(root=Path("/Users/alice/scratch/repo"))
```

**✅ Sentinel paths (in-memory env) or `tmp_path` (filesystem env).**

```python
# Right: no real filesystem dependency
fake_repo = FakeGit(root=Path("/__scenario__/repo"))
```

## Related Documentation

- `testing-strategy.md` — The six-layer model. Fast scenario testing is a specialization of Layer 4 "logic".
- `patterns.md#using-clirunner-for-cli-tests` — Lower-level CliRunner mechanics that scenario tests build on.
- `patterns.md#constructor-injection-for-fakes` — How fakes accept initial state.
- `patterns.md#mutation-tracking-properties` — How fakes expose what they observed for assertions.
- `gateway-architecture.md` — Why gateways exist and where the DI boundary lives.
- `workflows.md#adding-a-new-feature` — Step-by-step TDD workflow that scenario tests fit into.
- `anti-patterns.md` — General testing anti-patterns to avoid.

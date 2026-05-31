# Fixtures (third-tier setup)

Loaded from `SKILL.md` only when a fixture is the right tool. The default
remains a plain helper function (tier 1) or a `@contextmanager` helper
(tier 2). See `SKILL.md` § Setup hierarchy.

## When to use a fixture

Reach for `@pytest.fixture` only when **both** of these are true:

1. The resource is genuinely expensive to construct (CLI discovery,
   test database, large file).
2. The resource is shared across many tests in the same module or session.

Otherwise, use a plain helper or a context manager.

## Scope

Always give a fixture `scope="module"` or `scope="session"`. Never use
function-scoped fixtures as a convenience wrapper around a helper
function — that's an anti-pattern (see `SKILL.md` § Anti-patterns:
"Fixtures used out of convenience").

## `return` vs `yield`

Fixtures should not have a `yield` unless they actually need to tear
down the resource at the end of the scope. If there's nothing to clean
up, just `return`.

## Canonical shape

```python
@pytest.fixture(scope="module")
def cli_group() -> CliGroup:
    return discover_group("myapp.cli.commands")

def test_command_list(cli_group: CliGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"])
    assert result.exit_code == 0
```

One fixture, scoped to the module, shared across several tests, wrapping
an expensive discovery call, no `yield`.

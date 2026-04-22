---
name: fake-driven-testing-quick-reference
description: Quick lookup for file locations, fixtures, and example tests
---

# Quick Reference

**Read this when**: You need a quick lookup for file locations, fixtures, or example tests.

## Decision Tree: Where Should I Add My Test?

```
┌─ I need to test...
│
├─ A NEW FEATURE or BUG FIX WITH EXTERNAL DEPENDENCIES
│  └─> Layer 4 "logic": tests/scenario/ (e2e) or tests/unit/ (narrow) ← START HERE
│     Example: tests/scenario/test_user_service.py
│
├─ A PURE UTILITY/HELPER WITH NO DEPENDENCIES
│  └─> Layer 3 "pure": tests/unit/ (pure unit tests, no fakes/mocks)
│     Example: tests/unit/test_string_utils.py
│
├─ A FAKE IMPLEMENTATION (test infrastructure)
│  └─> Layer 1 "fake-check": tests/gateways/test_fakes.py
│     Example: TestFakeDatabase class inside test_fakes.py
│
├─ A REAL IMPLEMENTATION (code coverage with mocks)
│  └─> Layer 2 "real-sanity": tests/gateways/test_real_gateways.py
│     Example: TestRealDatabase class inside test_real_gateways.py
│
└─ CRITICAL USER WORKFLOW (smoke test)
   └─> Layer 5 "smoke": tests/integration/ (real systems, sparingly)
      Example: tests/integration/test_user_journey.py
```

See `ns-fake-driven-test-layout` for the canonical directory convention.

**Default**:

- For business logic with dependencies → Layer 4 "logic" (tests over fakes)
- For pure utilities with no dependencies → Layer 3 "pure" (pure unit tests)

## File Location Map

### Generic Python Project Structure

```
src/
├── myapp/
│   ├── integration classes/              ← External system wrappers
│   │   ├── __init__.py
│   │   ├── database.py        ← Database integration class (ABC + Real)
│   │   ├── api_client.py      ← API client integration class
│   │   ├── filesystem.py      ← File system integration class
│   │   └── message_queue.py   ← Message queue integration class
│   ├── services/              ← Business logic
│   │   ├── __init__.py
│   │   ├── user_service.py
│   │   ├── order_service.py
│   │   └── payment_service.py
│   ├── models/                ← Domain models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   └── order.py
│   └── cli/                   ← CLI commands (if applicable)
│       ├── __init__.py
│       └── commands.py
```

### Test Code Structure

Per `ns-fake-driven-test-layout`:

```
tests/
├── conftest.py                ← Shared pytest fixtures
├── unit/                      ← Layer 3 "pure" + narrow Layer 4 "logic"
│   ├── test_string_utils.py
│   ├── test_parsers.py
│   ├── test_user.py           ← Domain model tests (no I/O)
│   └── test_order.py
├── integration/               ← Layer 5 "smoke" (real systems)
│   ├── test_user_journey.py
│   ├── test_order_flow.py
│   └── test_api_endpoints.py
├── scenario/                  ← Layer 4 "logic" end-to-end shape (over fakes)
│   ├── test_user_service.py
│   ├── test_order_service.py
│   └── test_payment_service.py
└── gateways/                  ← Gateway *tests* only
    ├── test_fakes.py          ← Layer 1 "fake-check" (tests OF the fakes)
    └── test_real_gateways.py  ← Layer 2 "real-sanity" (mock-based)
```

Fakes themselves live inside the importable package at
`src/<package>/gateways/<domain>/fake.py` — see `ns-fake-driven-test-layout`
for the full layout.

Test data builders and helper utilities live next to the tests that use them
(per `ns-pytest`); avoid a top-level `tests/helpers/` shed.

## Common Fixtures

### pytest Built-in Fixtures

| Fixture       | Purpose                           | Usage                            |
| ------------- | --------------------------------- | -------------------------------- |
| `tmp_path`    | Temporary directory (Path object) | `def test_foo(tmp_path: Path):`  |
| `monkeypatch` | Mock/patch objects                | `def test_foo(monkeypatch):`     |
| `capsys`      | Capture stdout/stderr             | `out, err = capsys.readouterr()` |
| `caplog`      | Capture log messages              | `assert "ERROR" in caplog.text`  |

### Project-Specific Patterns

| Pattern                    | Purpose                    | Usage                                                 |
| -------------------------- | -------------------------- | ----------------------------------------------------- |
| Dependency injection       | Inject fakes into services | `service = UserService(db=fake_db, api=fake_api)`     |
| Builder pattern            | Build complex test data    | `user = UserBuilder().with_name("Alice").build()`     |
| Fixture composition        | Combine fixtures           | `def service(fake_db, fake_api): return Service(...)` |
| CliRunner (for Click apps) | Test CLI commands          | `runner = CliRunner(); result = runner.invoke(cmd)`   |

### Fake Implementation Examples

| Fake Class                 | Purpose                        | Common Methods                                    |
| -------------------------- | ------------------------------ | ------------------------------------------------- |
| `FakeDatabaseAdapter`      | In-memory database operations  | `query()`, `execute()`, `transaction()`           |
| `FakeApiClient`            | In-memory API responses        | `get()`, `post()`, `put()`, `delete()`            |
| `FakeGitCli`               | In-memory git tool             | `status()`, `create_branch()`, `current_branch()` |
| `FakeProjectManifestStore` | In-memory manifest persistence | `load(project)`, `save(manifest)`                 |
| `FakeMessageQueue`         | In-memory message queue        | `publish()`, `subscribe()`, `acknowledge()`       |
| `FakeCache`                | In-memory cache                | `get()`, `set()`, `delete()`, `clear()`           |

Do **not** create a generic `FakeFileSystem` / `FakeSubprocess` / `FakeHttpClient`. Those are primitive-level gateways — see `anti-patterns.md` (Gateways at Too Low an Abstraction Layer).

## Common Test Patterns

### Pure Unit Test (Layer 3 "pure")

```python
def test_sanitize_branch_name() -> None:
    """Test pure utility function with no dependencies."""
    # No setup needed - pure function
    assert sanitize_branch_name("feat/FOO-123") == "feat-foo-123"
    assert sanitize_branch_name("feature__test") == "feature-test"
    assert sanitize_branch_name("UPPER") == "upper"


def test_parse_git_status() -> None:
    """Test parser with no external dependencies."""
    output = "## main...origin/main"
    result = parse_git_status(output)

    assert result["branch"] == "main"
    assert result["remote"] == "origin/main"
```

### Business Logic Test Over Fakes (Layer 4 "logic")

```python
def test_user_service_create_user() -> None:
    # Arrange
    fake_db = FakeDatabaseAdapter(tables={"users": []})
    fake_email = FakeEmailClient()
    service = UserService(database=fake_db, email_client=fake_email)

    # Act
    user = service.create_user("Alice", "alice@example.com")

    # Assert
    assert user.id is not None
    assert user.name == "Alice"
    assert user.email == "alice@example.com"

    # Verify resulting fake state
    assert len(fake_db.tables["users"]) == 1
    assert fake_db.tables["users"][0]["email"] == "alice@example.com"
    assert len(fake_email.sent_emails) == 1
    assert fake_email.sent_emails[0]["to"] == "alice@example.com"
```

### CLI Test with Click

```python
from click.testing import CliRunner

def test_create_user_command() -> None:
    """Test CLI command end-to-end over fakes."""
    # Arrange
    runner = CliRunner()
    fake_db = FakeDatabaseAdapter(tables={"users": []})
    ctx = AppContext(database=fake_db)

    # Act
    result = runner.invoke(
        cli,
        ["user", "create", "alice@example.com", "--name", "Alice"],
        obj=ctx,
        catch_exceptions=False,
    )

    # Assert
    assert result.exit_code == 0
    assert "Created user Alice" in result.stdout
    assert fake_db.tables["users"][0]["email"] == "alice@example.com"
```

For CLI scenarios, prefer exit code, stdout/stderr, and final fake state in that order. Public mutation-tracking properties are a fallback when the command has no durable after-state to inspect.

### Test with Builder Pattern

```python
def test_order_processing() -> None:
    """Test with builder pattern for complex data."""
    # Arrange
    user = UserBuilder().with_name("Alice").with_credit(100).build()
    order = OrderBuilder().for_user(user).with_items(3).with_total(50).build()

    service = OrderService(database=FakeDatabaseAdapter())

    # Act
    result = service.process_order(order)

    # Assert
    assert result.status == "completed"
    assert result.user.credit == 50
```

### Test Fake Implementation

```python
def test_fake_database_tracks_queries() -> None:
    """Test that fake tracks operations correctly."""
    # Arrange
    fake_db = FakeDatabaseAdapter()

    # Act
    fake_db.execute("INSERT INTO users VALUES (1, 'Alice')")
    fake_db.query("SELECT * FROM users")

    # Assert
    assert len(fake_db.executed_queries) == 2
    assert fake_db.executed_queries[0].startswith("INSERT")
    assert fake_db.executed_queries[1].startswith("SELECT")
```

### Test Real Implementation with Mocking

```python
def test_real_database_with_mocking(monkeypatch) -> None:
    """Test real integration class with mocked connections."""
    # Arrange: Mock the database connection
    mock_connection = Mock()
    mock_cursor = Mock()
    mock_connection.cursor.return_value = mock_cursor
    mock_cursor.fetchall.return_value = [{"id": 1, "name": "Alice"}]

    monkeypatch.setattr("psycopg2.connect", lambda **kwargs: mock_connection)

    # Act
    db = RealDatabaseAdapter(connection_string="...")
    result = db.query("SELECT * FROM users")

    # Assert
    assert len(result) == 1
    assert result[0]["name"] == "Alice"
    mock_cursor.execute.assert_called_once_with("SELECT * FROM users")
```

## Example Tests to Reference

### Layer 1 "fake-check": Fake Infrastructure Tests (5%)

**Purpose**: Verify fakes work correctly. Lives in a single file:
`tests/gateways/test_fakes.py`. Group by fake using `Test<FakeName>` classes.

| Class                          | What It Tests                                  |
| ------------------------------ | ---------------------------------------------- |
| `TestFakeDatabase`             | FakeDatabase tracks queries correctly          |
| `TestFakeApiClient`            | FakeApiClient returns configured responses     |
| `TestFakeProjectManifestStore` | FakeProjectManifestStore round-trips load/save |

### Layer 2 "real-sanity": Integration Sanity Tests (10%)

**Purpose**: Quick validation of real implementations. Lives in a single file:
`tests/gateways/test_real_gateways.py`. Group by gateway using
`TestReal<GatewayName>` classes.

| Class               | What It Tests                          |
| ------------------- | -------------------------------------- |
| `TestRealDatabase`  | RealDatabase executes correct SQL      |
| `TestRealApiClient` | RealApiClient makes correct HTTP calls |

### Layer 3 "pure": Pure Unit Tests (10%)

**Purpose**: Test utilities and helpers with no dependencies

| File                              | What It Tests                        |
| --------------------------------- | ------------------------------------ |
| `tests/unit/test_string_utils.py` | String sanitization, formatting      |
| `tests/unit/test_parsers.py`      | CLI output parsing, config parsing   |
| `tests/unit/test_validators.py`   | Input validation logic               |
| `tests/unit/test_calculations.py` | Mathematical and business algorithms |

### Layer 4 "logic": Business Logic Over Fakes (70% - MAJORITY)

**Purpose**: Test features and bug fixes. End-to-end shapes go in `tests/scenario/`;
narrow logic-over-fakes go in `tests/unit/`.

| File                                     | What It Tests                     |
| ---------------------------------------- | --------------------------------- |
| `tests/scenario/test_user_service.py`    | User creation, updates, deletion  |
| `tests/scenario/test_order_service.py`   | Order processing flow             |
| `tests/scenario/test_payment_service.py` | Payment validation and processing |

### Layer 5 "smoke": Business Logic Integration Tests (5%)

**Purpose**: Smoke tests over real system

| File                                     | What It Tests             |
| ---------------------------------------- | ------------------------- |
| `tests/integration/test_user_journey.py` | Complete user signup flow |
| `tests/integration/test_order_flow.py`   | Full order processing     |

## Common Imports

```python
# Testing framework
import pytest
from unittest.mock import Mock, patch
from click.testing import CliRunner
from pathlib import Path

# Type hints
from typing import Any
from collections.abc import Generator

# Your fakes
from myapp.gateways.database.fake import FakeDatabaseAdapter
from myapp.gateways.api_client.fake import FakeApiClient
from myapp.gateways.project_manifest_store.fake import FakeProjectManifestStore

# Your services and models
from myapp.services.user_service import UserService
from myapp.services.order_service import OrderService
from myapp.models.user import User
from myapp.models.order import Order
```

## Useful Commands

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/scenario/test_user_service.py

# Run specific test
pytest tests/scenario/test_user_service.py::test_create_user

# Run with verbose output
pytest -v

# Run with coverage
pytest --cov=src/myapp

# Coverage with missing lines
pytest --cov=src/myapp --cov-report=term-missing

# Run only unit tests (Layer 3 + narrow Layer 4)
pytest tests/unit/

# Run only end-to-end scenarios (Layer 4 majority)
pytest tests/scenario/

# Run only real-system smoke tests (Layer 5)
pytest tests/integration/

# Run only gateway tests (Layers 1 + 2)
pytest tests/gateways/

# Type check (if using mypy or ty)
mypy src/
ty check

# Format code
black src/ tests/
# or
ruff format src/ tests/

# Lint code
ruff check src/ tests/
# or
pylint src/

# Run tests in parallel
pytest -n auto
```

## Test Distribution Guidelines

For a typical feature (e.g., "add user authentication"):

| Layer                               | Count       | Example                                                   |
| ----------------------------------- | ----------- | --------------------------------------------------------- |
| Layer 1 "fake-check": Fake tests    | 1-2 tests   | Verify `FakeAuthService.authenticate()` tracks correctly  |
| Layer 2 "real-sanity": Sanity tests | 1-2 tests   | Verify `RealAuthService.authenticate()` calls correct API |
| Layer 3 "pure": Pure unit tests     | 2-3 tests   | Test password hashing, token generation logic             |
| Layer 4 "logic": Business logic     | 12-14 tests | Test auth flow over fakes (success, failures, edge cases) |
| Layer 5 "smoke": Integration tests  | 1 test      | Smoke test complete login flow                            |

**Total**: ~20 tests, with 70% over fakes (Layer 4 "logic"), 10% pure unit (Layer 3 "pure"), 10% sanity (Layer 2 "real-sanity"), 5% integration (Layer 5 "smoke"), 5% fake tests (Layer 1 "fake-check").

## Quick Checklist: Adding a New Integration class Method

When adding a method to an integration class interface:

- [ ] Add `@abstractmethod` to ABC (e.g., `DatabaseAdapter`)
- [ ] Implement in real class (e.g., `RealDatabaseAdapter`)
- [ ] Implement in fake class in `src/myapp/gateways/database/fake.py`
- [ ] Add operation tracking to fake (if write operation)
- [ ] Test fake in `tests/gateways/test_fakes.py` (TestFakeDatabase class)
- [ ] Test real with mocking in `tests/gateways/test_real_gateways.py` (TestRealDatabase class)
- [ ] Test business logic over fake in `tests/scenario/test_*.py`

## Testing Patterns Quick Reference

### AAA Pattern

```python
def test_example() -> None:
    # Arrange
    service = UserService(fake_db)

    # Act
    result = service.get_user(1)

    # Assert
    assert result.name == "Alice"
```

### Given-When-Then

```python
def test_example() -> None:
    # Given
    service = UserService(fake_db)

    # When
    result = service.get_user(1)

    # Then
    assert result.name == "Alice"
```

### Parametrized Tests

```python
@pytest.mark.parametrize("input,expected", [
    (1, "Alice"),
    (2, "Bob"),
    (3, None),
])
def test_get_user(input: int, expected: str | None) -> None:
    service = UserService(fake_db)
    result = service.get_user(input)
    assert result.name == expected if result else result is None
```

## Related Documentation

- `python-specific.md` - pytest fixtures, mocking, frameworks
- `testing-strategy.md` - Which layer to test at (detailed guide)
- `workflows.md` - Step-by-step guides for common tasks
- `patterns.md` - Common testing patterns explained
- `anti-patterns.md` - What to avoid
- `gateway-architecture.md` - Understanding the gateway layer

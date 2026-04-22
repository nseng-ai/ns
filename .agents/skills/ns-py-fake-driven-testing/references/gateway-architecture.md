---
name: fake-driven-testing-gateway-architecture
description: Gateway layer architecture and interface patterns
---

# Gateway Layer Architecture

**Read this when**: You need to understand or modify the gateway layer (the thin wrapper interfaces over external state).

## Overview

**Naming note**: "Gateway" is a common name for this pattern. These classes are also called **adapters**, **providers**, or **ports** in other contexts. The pattern matters more than the name.

## What Are Gateway Classes?

**Gateway classes are thin wrappers around heavyweight external APIs** that:

- Touch external state (filesystem, database, APIs, message queues)
- Could be slow (network calls, disk I/O, subprocess execution)
- Could fail periodically (network issues, rate limits, service outages)
- Are difficult to test directly

## The Core Implementations

Every gateway interface has **three core implementations** (ABC, Real, Fake). A fourth — DryRun — is an optional extension covered in `advanced-extensions.md`.

### 1. Abstract Interface (ABC)

Defines the contract all implementations must follow.

**Example**: `DatabaseGateway` (`src/myapp/gateways/database/gateway.py`)

```python
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

class DatabaseGateway(ABC):
    """Thin wrapper over database operations."""

    @abstractmethod
    def query(self, sql: str, *, timeout: float | None = None) -> list[dict[str, Any]]:
        """Execute a SELECT query."""

    @abstractmethod
    def execute(self, sql: str) -> None:
        """Execute an INSERT, UPDATE, or DELETE."""

    @abstractmethod
    def transaction(self) -> "TransactionContext":
        """Start a database transaction."""

    # ... more methods
```

**Key characteristics**:

- Uses `ABC` (not `Protocol`)
- All methods are `@abstractmethod`
- Contains ONLY runtime operations (no test setup methods)
- May have concrete helper methods (all implementations inherit)

### 2. Real Implementation

Calls actual external systems (database, filesystem, API).

**Example**: `RealDatabaseGateway` (`src/myapp/gateways/database/real.py`)

```python
import psycopg2
from contextlib import contextmanager

class RealDatabaseGateway(DatabaseGateway):
    """Real database operations via psycopg2."""

    def __init__(self, connection_string: str) -> None:
        self.connection_string = connection_string

    def query(self, sql: str, *, timeout: float | None = None) -> list[dict[str, Any]]:
        """Execute SELECT query against PostgreSQL."""
        conn = psycopg2.connect(
            self.connection_string,
            options=f"-c statement_timeout={int(timeout * 1000)}" if timeout else ""
        )

        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cursor.execute(sql)
            return [dict(row) for row in cursor.fetchall()]
        finally:
            cursor.close()
            conn.close()

    def execute(self, sql: str) -> None:
        """Execute INSERT/UPDATE/DELETE against PostgreSQL."""
        conn = psycopg2.connect(self.connection_string)

        try:
            cursor = conn.cursor()
            cursor.execute(sql)
            conn.commit()
        finally:
            cursor.close()
            conn.close()

    @contextmanager
    def transaction(self):
        """Transaction context manager."""
        conn = psycopg2.connect(self.connection_string)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
```

**Key characteristics**:

- Uses real libraries (`psycopg2`, `requests`, `boto3`, etc.)
- Handles connection management
- LBYL: checks conditions before operations
- Lets exceptions bubble up (no try/except for control flow)

### 3. Fake Implementation

In-memory simulation for fast testing.

**Example**: `FakeDatabaseGateway` (`src/myapp/gateways/database/fake.py`)

```python
from typing import Any
from contextlib import contextmanager

class FakeDatabaseGateway(DatabaseGateway):
    """In-memory database simulation for testing."""

    def __init__(
        self,
        *,
        initial_data: dict[str, list[dict]] | None = None,
        should_fail_on: list[str] | None = None,
    ) -> None:
        # Mutable state (private)
        self._tables: dict[str, list[dict]] = initial_data or {}
        self._should_fail_on = should_fail_on or []
        self._in_transaction = False

        # Mutation tracking (private, accessed via properties)
        self._executed_queries: list[str] = []
        self._executed_commands: list[str] = []
        self._transaction_count = 0

    def query(self, sql: str, *, timeout: float | None = None) -> list[dict[str, Any]]:
        """Return in-memory data."""
        # Simulate failure if configured
        if any(pattern in sql for pattern in self._should_fail_on):
            raise RuntimeError(f"Simulated failure for: {sql}")

        # Track operation
        self._executed_queries.append(sql)

        # Parse table name (simplified)
        if "FROM" in sql:
            table = sql.split("FROM")[1].split()[0].strip()
            return self._tables.get(table, []).copy()
        return []

    def execute(self, sql: str) -> None:
        """Update in-memory state."""
        # Track operation
        self._executed_commands.append(sql)

        # Simulate INSERT (simplified parsing)
        if sql.startswith("INSERT INTO"):
            # Extract table and values (simplified)
            parts = sql.split()
            table = parts[2]
            if table not in self._tables:
                self._tables[table] = []
            # Add dummy record
            self._tables[table].append({"id": len(self._tables[table]) + 1})

        # Simulate DELETE (simplified)
        elif sql.startswith("DELETE FROM"):
            parts = sql.split()
            table = parts[2]
            if table in self._tables:
                self._tables[table] = []

    @contextmanager
    def transaction(self):
        """Simulated transaction."""
        self._in_transaction = True
        self._transaction_count += 1
        try:
            yield self
        finally:
            self._in_transaction = False

    @property
    def executed_queries(self) -> list[str]:
        """Read-only access for test assertions."""
        return self._executed_queries.copy()

    @property
    def executed_commands(self) -> list[str]:
        """Read-only access for test assertions."""
        return self._executed_commands.copy()

    @property
    def transaction_count(self) -> int:
        """Read-only access for test assertions."""
        return self._transaction_count
```

**Key characteristics**:

- **Constructor injection**: All initial state via keyword arguments
- **In-memory storage**: Dictionaries, lists for state
- **Mutation tracking**: Read-only properties for assertions
- **Fast**: No I/O, no network calls
- **Simulation**: May mimic real behavior (e.g., checking constraints)

**Mutation tracking pattern**:

```python
# In test:
fake_db = FakeDatabaseGateway()
fake_db.execute("INSERT INTO users VALUES (...)")

# Assert operation was called
assert "INSERT INTO users" in fake_db.executed_commands[0]
```

## Common Gateway Types

The examples below are all named after **what they do**, not how they execute. `GitCli`, `ApiClient`, `ProjectManifestStore`, `MessageQueue`, `Time` — not `SubprocessGateway`, `HttpClient`, `FileSystemGateway`. See "Keep Gateways Narrow" below for why this matters.

### API Client Gateway

```python
class ApiClient(ABC):
    """Gateway for external API calls."""

    @abstractmethod
    def get(self, endpoint: str, *, params: dict | None = None) -> dict:
        """GET request to API."""

    @abstractmethod
    def post(self, endpoint: str, *, json: dict) -> dict:
        """POST request to API."""

class RealApiClient(ApiClient):
    """Real HTTP client using requests."""

    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {api_key}"}

    def get(self, endpoint: str, *, params: dict | None = None) -> dict:
        import requests
        response = requests.get(
            f"{self.base_url}{endpoint}",
            params=params,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

class FakeApiClient(ApiClient):
    """Fake API client for testing."""

    def __init__(self, responses: dict[str, Any]) -> None:
        self.responses = responses
        self.requested_endpoints: list[str] = []

    def get(self, endpoint: str, *, params: dict | None = None) -> dict:
        self.requested_endpoints.append(endpoint)
        return self.responses.get(endpoint, {})
```

### Project Manifest Store (filesystem-adjacent — narrow)

A good filesystem-adjacent gateway is named after the **thing being stored**, not after the filesystem. It exposes domain operations (`load`, `save`) and hides the disk layout entirely. The fake stores manifests in a dict, not files.

See **Keep Gateways Narrow** below and `anti-patterns.md` for why a generic `FileSystemGateway` with `read_file` / `write_file` / `mkdir` is the wrong shape.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Manifest:
    project: str
    skills: tuple[str, ...]

@dataclass(frozen=True)
class ManifestMissing:
    project: str


class ProjectManifestStore(ABC):
    """Stores one manifest per project."""

    @abstractmethod
    def load(self, project: str) -> Manifest | ManifestMissing:
        """Load a manifest, or return ManifestMissing if absent."""

    @abstractmethod
    def save(self, manifest: Manifest) -> None:
        """Persist a manifest, overwriting any prior value."""


class RealProjectManifestStore(ProjectManifestStore):
    """Manifests serialized as JSON under a root directory."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def load(self, project: str) -> Manifest | ManifestMissing:
        manifest_path = self._root / project / "manifest.json"
        if not manifest_path.exists():
            return ManifestMissing(project=project)
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return Manifest(project=project, skills=tuple(data["skills"]))

    def save(self, manifest: Manifest) -> None:
        manifest_path = self._root / manifest.project / "manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps({"skills": list(manifest.skills)}),
            encoding="utf-8",
        )


class FakeProjectManifestStore(ProjectManifestStore):
    """In-memory manifests for testing."""

    def __init__(self, *, manifests: dict[str, Manifest] | None = None) -> None:
        self._manifests = dict(manifests or {})
        self._save_calls: list[Manifest] = []

    def load(self, project: str) -> Manifest | ManifestMissing:
        if project in self._manifests:
            return self._manifests[project]
        return ManifestMissing(project=project)

    def save(self, manifest: Manifest) -> None:
        self._manifests[manifest.project] = manifest
        self._save_calls.append(manifest)

    @property
    def save_calls(self) -> list[Manifest]:
        return list(self._save_calls)
```

**Why this shape works**: the contract is two methods the application actually uses. The fake is ~15 lines because the dict replaces JSON serialization plus directory creation. There is no way to ask this gateway "does arbitrary path `/tmp/x` exist?" — and there shouldn't be, because the business logic above it never needs to.

### Message Queue Gateway

```python
class MessageQueueGateway(ABC):
    """Gateway for message queue operations."""

    @abstractmethod
    def publish(self, topic: str, message: dict) -> None:
        """Publish message to topic."""

    @abstractmethod
    def subscribe(self, topic: str) -> Generator[dict, None, None]:
        """Subscribe to topic messages."""

class FakeMessageQueue(MessageQueueGateway):
    """In-memory message queue for testing."""

    def __init__(self) -> None:
        self._queues: dict[str, list[dict]] = {}
        self._published_messages: list[tuple[str, dict]] = []

    def publish(self, topic: str, message: dict) -> None:
        if topic not in self._queues:
            self._queues[topic] = []
        self._queues[topic].append(message)
        self._published_messages.append((topic, message))

    def subscribe(self, topic: str) -> Generator[dict, None, None]:
        queue = self._queues.get(topic, [])
        while queue:
            yield queue.pop(0)

    @property
    def published_messages(self) -> list[tuple[str, dict]]:
        """For test assertions."""
        return self._published_messages.copy()
```

### Time Gateway

The simplest possible gateway — demonstrates why even stdlib calls should go through gateways for testability.

```python
import time
from abc import ABC, abstractmethod
from datetime import datetime

class Time(ABC):
    """Gateway for time operations."""

    @abstractmethod
    def now(self) -> datetime:
        """Current time (replaces datetime.now())."""

    @abstractmethod
    def sleep(self, seconds: float) -> None:
        """Sleep (replaces time.sleep())."""

class RealTime(Time):
    """Real time operations."""

    def now(self) -> datetime:
        return datetime.now()

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)

class FakeTime(Time):
    """Deterministic time for testing."""

    def __init__(self, *, current_time: datetime | None = None) -> None:
        self._current_time = current_time or datetime(2024, 1, 15, 14, 30, 0)
        self._sleep_calls: list[float] = []

    def now(self) -> datetime:
        return self._current_time

    def sleep(self, seconds: float) -> None:
        self._sleep_calls.append(seconds)  # Track, don't actually sleep

    @property
    def sleep_calls(self) -> list[float]:
        """Read-only access for test assertions."""
        return list(self._sleep_calls)
```

**Why gateway-ify time?** Tests using `datetime.now()` directly are flaky (timing-dependent) and slow (real `time.sleep()`). With `FakeTime`, tests are deterministic and instant.

## When to Add/Change Gateway Methods

### Adding a Method

**If you need to add a method to a gateway interface:**

1. Add `@abstractmethod` to ABC interface
2. Implement in real class with actual I/O
3. Implement in fake class with in-memory state
4. Write unit test of fake implementation
5. Write integration test of real implementation

### Changing an Interface

**If you need to change an interface:**

- Update all implementations (ABC, Real, Fake)
- Update all tests that use the changed method
- Update any business logic that calls the method

## Design Principles

### Keep Gateways Thin

**Gateways should NOT contain business logic**. Push complexity to the business layer.

```python
# ❌ WRONG: Business logic in gateway class
class RealDatabaseGateway(DatabaseGateway):
    def get_active_users_with_recent_orders(self) -> list[dict]:
        """Complex logic to find users."""
        users = self.query("SELECT * FROM users WHERE active = true")
        result = []
        for user in users:
            orders = self.query(f"SELECT * FROM orders WHERE user_id = {user['id']}")
            if any(o['created_at'] > datetime.now() - timedelta(days=30) for o in orders):
                result.append(user)
        return result

# ✅ CORRECT: Thin gateway, logic in business layer
class RealDatabaseGateway(DatabaseGateway):
    def query(self, sql: str) -> list[dict[str, Any]]:
        """Just wrap database query."""
        conn = psycopg2.connect(self.connection_string)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cursor.execute(sql)
        return [dict(row) for row in cursor.fetchall()]

# Business logic layer:
class UserService:
    def get_active_users_with_recent_orders(self) -> list[User]:
        """Complex logic over thin gateway."""
        users = self.database.query("SELECT * FROM users WHERE active = true")
        result = []
        for user in users:
            orders = self.database.query(f"SELECT * FROM orders WHERE user_id = {user['id']}")
            if any(o['created_at'] > datetime.now() - timedelta(days=30) for o in orders):
                result.append(User.from_dict(user))
        return result
```

**Why**: Thin gateways are easier to fake, easier to test, easier to understand.

### Keep Gateways Narrow

"Thin" and "narrow" are different axes. A thin gateway contains no business logic. A **narrow** gateway exposes only the specific operations the application actually uses, at the abstraction level of a tool or capability — not the abstraction level of an OS primitive.

Narrow gateways are named after **what they do**:

- ✅ `GitCli.status()`, `.create_branch(name)` — wraps the git tool, only the subcommands the app uses
- ✅ `NpxSkillsClient.install(skill)`, `.list()` — wraps `npx skills` specifically
- ✅ `ProjectManifestStore.load(project)`, `.save(manifest)` — stores a specific thing
- ✅ `EnvLayoutStore.create_env(name, passthrough)`, `.remove_env(name)`, `.list_envs()` — manages one well-defined directory layout

Over-broad gateways are named after **how they execute**:

- ❌ `FileSystemGateway.mkdir()`, `.read_file()`, `.iterdir()`, `.symlink()` — can manipulate any path
- ❌ `SubprocessGateway.run()`, `ShellRunner`, `CommandRunner` — can execute anything
- ❌ `HttpClient.get(url)`, `.post(url)` — can call any URL

**The sniff test**: if the fake needs to approximate the whole wrapped system — its parent-creation rules, symlink semantics, recursive-delete behavior — the gateway boundary is too broad. A correctly-narrow fake is a dict lookup plus a list of recorded calls. It is not a partial filesystem reimplementation.

**Worked example**. An agent bootstrapping a `henv`-style tool wrote:

```python
# ❌ WRONG: filesystem-level gateway
class FileSystemGateway(ABC):
    @abstractmethod
    def exists(self, path: Path) -> bool: ...
    @abstractmethod
    def is_dir(self, path: Path) -> bool: ...
    @abstractmethod
    def mkdir(self, path: Path, *, parents: bool = False, exist_ok: bool = False) -> None: ...
    @abstractmethod
    def create_symlink(self, link_path: Path, target: Path) -> None: ...
    @abstractmethod
    def iterdir(self, path: Path) -> tuple[Path, ...]: ...
    @abstractmethod
    def rmtree(self, path: Path) -> None: ...
```

The fake for this gateway tracks `_directories`, `_files`, `_symlinks` as three separate sets, walks parents to simulate `parents=True`, resolves symlinks to answer `is_dir`, and recursively filters membership to simulate `rmtree`. That is a filesystem reimplementation, and every test that uses it is really testing the fake.

The right shape names the capability, not the mechanism:

```python
# ✅ CORRECT: capability-level gateway
@dataclass(frozen=True)
class EnvDirectory:
    root: Path
    passthrough_links: tuple[Path, ...]

class EnvLayoutStore(ABC):
    @abstractmethod
    def create_env(self, name: str, *, passthrough: tuple[Path, ...]) -> EnvDirectory: ...
    @abstractmethod
    def list_envs(self) -> tuple[str, ...]: ...
    @abstractmethod
    def remove_env(self, name: str) -> None: ...
```

Three methods, one conceptual system (the `~/.henv/environments/` layout). The fake is a dict of name → `EnvDirectory` plus a `_removed_envs` list. There is no way to simulate arbitrary filesystem state through it, which is the point.

**When in doubt**: if you are about to create a gateway named `FileSystem*`, `Subprocess*`, `Shell*`, `Command*`, `Http*`, or `Process*`, stop. Ask what the business logic above the gateway actually needs, name the gateway after that, and expose only those operations. See `anti-patterns.md` for the full anti-pattern write-up.

### Fakes Should Be In-Memory

**Fakes should avoid I/O operations** (except minimal directory creation when testing file operations).

```python
# ❌ WRONG: Fake performs I/O
class FakeProjectManifestStore(ProjectManifestStore):
    def __init__(self, root: Path) -> None:
        self._root = root

    def load(self, project: str) -> Manifest | ManifestMissing:
        # Reading real files defeats the purpose of fakes!
        data = (self._root / project / "manifest.json").read_text(encoding="utf-8")
        parsed = json.loads(data)
        return Manifest(project=project, skills=tuple(parsed["skills"]))

# ✅ CORRECT: Fake uses in-memory state
class FakeProjectManifestStore(ProjectManifestStore):
    def __init__(self, *, manifests: dict[str, Manifest] | None = None) -> None:
        self._manifests = dict(manifests or {})

    def load(self, project: str) -> Manifest | ManifestMissing:
        if project in self._manifests:
            return self._manifests[project]
        return ManifestMissing(project=project)
```

**Exception**: Fakes may create real directories when necessary for integration, but should not read/write actual files.

## The DI Boundary: Only Fake Gateways

**CRITICAL: DI is ONLY at the gateway level.** We do NOT want "DI all the way down" like Java.

Gateways are the thin wrappers around external systems. Everything above them — services, backends, managers, handlers, whatever your project calls them — composes gateways and contains business logic. Only gateways get fakes.

### The Distinction

| Aspect              | Gateway                                      | Code above gateways                                              |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| **Purpose**         | Thin wrapper around external system          | Business logic that composes gateways                            |
| **Examples**        | `DatabaseGateway`, `ApiClient`, `FileSystem` | `OrderService`, `UserManager`, `PaymentProcessor`                |
| **Implementations** | 3: ABC, Real, Fake                           | Real implementations only                                        |
| **Needs Fake?**     | Yes - provides in-memory simulation          | No - inject fake gateways instead                                |
| **Testing**         | Use `FakeDatabase` directly                  | Use `OrderService(database=FakeDatabase(), api=FakeApiClient())` |

### Testing Code Above Gateways

To test business logic, use the real class with fake gateways injected:

```python
# ✅ CORRECT: Real service, fake gateways
def test_process_order():
    fake_db = FakeDatabaseAdapter(users=[{"id": 1, "balance": 100}])
    fake_payment = FakePaymentGateway(approved_cards=["4111111111111111"])
    service = OrderService(database=fake_db, payment=fake_payment)

    result = service.process_order(user_id=1, card="4111111111111111", amount=50)

    assert result.status == "success"
    assert len(fake_payment.processed_transactions) == 1

# ❌ WRONG: Creating a fake service
class FakeOrderService(OrderService):  # DON'T DO THIS
    ...
```

### Why Only Fake Gateways?

1. **Gateways are the seam** — they're the boundary where we swap real for fake
2. **Business logic should be tested, not faked** — test with real logic, fake dependencies
3. **Avoids duplication** — a fake service just duplicates the real service's logic
4. **DI stops here** — only inject at the gateway level, not deeper

## Related Documentation

- `non-ideal-states.md` - Error handling: non-ideal states vs exceptions
- `testing-strategy.md` - How to test gateway classes at different layers
- `workflows.md` - Step-by-step guide for adding gateway methods
- `patterns.md` - Constructor injection and mutation tracking patterns
- `anti-patterns.md` - What to avoid in gateway design
- `advanced-extensions.md` - DryRun wrappers and sub-gateway composition

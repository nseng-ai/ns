---
name: fake-driven-testing-python-specific
description: Python-specific testing patterns for pytest and type hints
---

# Python-Specific Testing Patterns

**Read this when**: Testing web frameworks (Flask/FastAPI/Django) or Click apps, typing
test doubles, or structuring shared test utilities.

For pytest mechanics — fixtures, parametrize, tmp_path, monkeypatch, mock/patch style —
use the `pytest` skill; this file covers only fake-driven and framework-specific patterns.

## Mocking What You Own (Best Practice)

```python
# ❌ WRONG: Mocking third-party library directly
@patch("requests.Session")
def test_bad_mock(mock_session):
    # Fragile - couples to library internals
    mock_session.return_value.get.return_value.json.return_value = {}

# ✅ CORRECT: Create your own integration class
class HttpClient(ABC):
    """Your own abstraction over HTTP."""
    @abstractmethod
    def get(self, url: str) -> dict:
        """Get JSON from URL."""

class RealHttpClient(HttpClient):
    """Real implementation using requests."""
    def get(self, url: str) -> dict:
        return requests.get(url).json()

class FakeHttpClient(HttpClient):
    """Fake for testing."""
    def __init__(self, responses: dict[str, dict]) -> None:
        self.responses = responses

    def get(self, url: str) -> dict:
        return self.responses.get(url, {})

# Test using your fake
def test_with_fake():
    client = FakeHttpClient(responses={
        "https://api.example.com": {"data": "test"}
    })
    service = DataService(http_client=client)
    result = service.fetch_data()
    assert result == {"data": "test"}
```

## Testing CLI Applications with Click

The canonical scenario shape for CLI testing is `references/fast-scenario-testing.md`;
this section covers Click-specific mechanics.

```python
from click.testing import CliRunner
import click

@click.command()
@click.argument("name")
@click.option("--greeting", default="Hello")
def greet(name: str, greeting: str) -> None:
    """Greet someone."""
    click.echo(f"{greeting}, {name}!")

def test_cli_command() -> None:
    """Test Click CLI command."""
    runner = CliRunner()

    # Test with arguments
    result = runner.invoke(greet, ["Alice"])
    assert result.exit_code == 0
    assert "Hello, Alice!" in result.output

    # Test with options
    result = runner.invoke(greet, ["Bob", "--greeting", "Hi"])
    assert result.exit_code == 0
    assert "Hi, Bob!" in result.output

    # Test error cases
    result = runner.invoke(greet, [])
    assert result.exit_code != 0
    assert "Error" in result.output

def test_cli_with_input() -> None:
    """Test CLI with user input."""
    @click.command()
    def confirm():
        if click.confirm("Continue?"):
            click.echo("Continuing...")

    runner = CliRunner()

    # Simulate user input
    result = runner.invoke(confirm, input="y\n")
    assert "Continuing..." in result.output

    result = runner.invoke(confirm, input="n\n")
    assert "Continuing..." not in result.output

def test_cli_with_files(tmp_path: Path) -> None:
    """Test CLI that creates files."""
    runner = CliRunner()

    with runner.isolated_filesystem(temp_dir=tmp_path):
        result = runner.invoke(init_project, ["my_project"])

        assert result.exit_code == 0
        assert Path("my_project").exists()
        assert Path("my_project/config.yaml").exists()
```

## Testing Web Frameworks

### Flask Testing

```python
import pytest
from flask import Flask
from flask.testing import FlaskClient

@pytest.fixture
def app() -> Flask:
    """Create Flask app for testing."""
    app = Flask(__name__)
    app.config["TESTING"] = True

    @app.route("/users/<int:user_id>")
    def get_user(user_id):
        return {"id": user_id, "name": "Test User"}

    return app

@pytest.fixture
def client(app: Flask) -> FlaskClient:
    """Flask test client."""
    return app.test_client()

def test_flask_endpoint(client: FlaskClient) -> None:
    """Test Flask endpoint."""
    response = client.get("/users/1")
    assert response.status_code == 200
    assert response.json["id"] == 1
    assert response.json["name"] == "Test User"

def test_flask_post(client: FlaskClient) -> None:
    """Test POST request."""
    response = client.post(
        "/users",
        json={"name": "Alice"},
        headers={"Authorization": "Bearer token"}
    )
    assert response.status_code == 201
```

### FastAPI Testing

```python
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

@pytest.fixture
def app() -> FastAPI:
    """Create FastAPI app for testing."""
    app = FastAPI()

    @app.get("/users/{user_id}")
    async def get_user(user_id: int):
        return {"id": user_id, "name": "Test User"}

    return app

@pytest.fixture
def client(app: FastAPI) -> TestClient:
    """FastAPI test client."""
    return TestClient(app)

def test_fastapi_endpoint(client: TestClient) -> None:
    """Test FastAPI endpoint."""
    response = client.get("/users/1")
    assert response.status_code == 200
    assert response.json() == {"id": 1, "name": "Test User"}

@pytest.mark.asyncio
async def test_async_endpoint() -> None:
    """Test async endpoint directly."""
    from httpx import AsyncClient

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/users/1")
        assert response.status_code == 200
```

### Django Testing

```python
import pytest
from django.test import TestCase, Client
from django.contrib.auth.models import User

# Using Django's TestCase
class UserViewTest(TestCase):
    """Django TestCase with database transactions."""

    def setUp(self):
        """Set up test data."""
        self.client = Client()
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass"
        )

    def test_user_profile(self):
        """Test user profile view."""
        self.client.login(username="testuser", password="testpass")
        response = self.client.get("/profile/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "testuser")

# Using pytest-django
@pytest.mark.django_db
def test_user_creation():
    """Test with pytest-django."""
    user = User.objects.create_user(
        username="alice",
        email="alice@example.com"
    )
    assert user.username == "alice"
    assert User.objects.count() == 1

@pytest.fixture
def logged_in_client(client, django_user_model):
    """Fixture for logged-in client."""
    user = django_user_model.objects.create_user(
        username="testuser",
        password="testpass"
    )
    client.force_login(user)
    return client

def test_authenticated_view(logged_in_client):
    """Test view requiring authentication."""
    response = logged_in_client.get("/dashboard/")
    assert response.status_code == 200
```

## Type Hints in Tests

### Basic Type Hints

```python
from typing import Any, Protocol
from collections.abc import Generator, Sequence

def test_with_type_hints() -> None:
    """Tests should have return type None."""
    result: int = calculate_sum([1, 2, 3])
    assert result == 6

@pytest.fixture
def user_data() -> dict[str, Any]:
    """Fixtures should have explicit return types."""
    return {"id": 1, "name": "Alice", "active": True}

@pytest.fixture
def database() -> Generator[Database, None, None]:
    """Generator fixtures with cleanup."""
    db = Database()
    db.connect()
    yield db
    db.close()
```

### Protocol Types for Test Doubles

```python
class DatabaseProtocol(Protocol):
    """Protocol for database operations."""

    def query(self, sql: str) -> list[dict[str, Any]]: ...
    def execute(self, sql: str) -> None: ...

class FakeDatabase:
    """Fake implementation of DatabaseProtocol."""

    def __init__(self) -> None:
        self.data: list[dict[str, Any]] = []

    def query(self, sql: str) -> list[dict[str, Any]]:
        return self.data

    def execute(self, sql: str) -> None:
        pass

def test_with_protocol(database: DatabaseProtocol) -> None:
    """Test accepts anything matching DatabaseProtocol."""
    result = database.query("SELECT * FROM users")
    assert isinstance(result, list)
```

## Package Structure for Test Utilities

### Organizing Shared Test Code

```
myproject/
├── src/
│   └── myapp/
│       ├── __init__.py
│       ├── services.py
│       └── models.py
├── tests/
│   ├── conftest.py          # Shared fixtures
│   ├── helpers/             # Test utilities
│   │   ├── __init__.py
│   │   ├── builders.py      # Test data builders
│   │   ├── fakes.py         # Fake implementations
│   │   └── fixtures.py      # Additional fixtures
│   ├── unit/
│   │   ├── test_services.py
│   │   └── test_models.py
│   └── integration/
│       └── test_api.py
```

### Test Data Builders

```python
# tests/helpers/builders.py
from dataclasses import dataclass
from typing import Any

@dataclass
class User:
    id: int
    name: str
    email: str
    active: bool = True

class UserBuilder:
    """Builder for test users."""

    def __init__(self) -> None:
        self._id = 1
        self._name = "Test User"
        self._email = "test@example.com"
        self._active = True

    def with_name(self, name: str) -> "UserBuilder":
        self._name = name
        return self

    def with_email(self, email: str) -> "UserBuilder":
        self._email = email
        return self

    def inactive(self) -> "UserBuilder":
        self._active = False
        return self

    def build(self) -> User:
        user = User(
            id=self._id,
            name=self._name,
            email=self._email,
            active=self._active
        )
        self._id += 1  # Auto-increment for next build
        return user

    def build_many(self, count: int) -> list[User]:
        return [self.build() for _ in range(count)]
```

## Related Documentation

- `testing-strategy.md` - Which layer to test at
- `workflows.md` - Step-by-step testing workflows
- `patterns.md` - General testing patterns
- `anti-patterns.md` - What to avoid in Python tests
- `gateway-architecture.md` - Gateway pattern in Python

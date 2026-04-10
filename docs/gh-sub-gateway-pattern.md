# GH sub-gateway pattern

The `GH` facade in `twerk_core.gh.facade` composes sub-gateways, organized like the `gh` CLI. Each sub-gateway covers a GitHub resource type (`pr`, future `issue`, `repo`, etc.) and is accessed as a field on the facade: `gh.pr`, `gh.issue`, etc.

## Anatomy of a sub-gateway

Each sub-gateway consists of three pieces:

1. **ABC** (`<resource>_gateway.py`) — defines the abstract interface. Methods are scoped to the resource, so they drop redundant prefixes (e.g., `gh.pr.get_reviews()` not `gh.pr.get_pr_reviews()`). Queries return frozen dataclasses from `types.py`; mutations return simple success indicators.

2. **Fake** (in `testing.py`) — in-memory implementation for tests. Constructor-only configuration, mutation tracking via private lists, configurable failure sets. No public setup methods after construction.

3. **Field on `GH`** (`facade.py`) — the facade is a frozen dataclass. Each sub-gateway is a required field. The `make_fake_gh()` factory in `testing.py` provides defaults for all sub-gateways.

## Adding a new sub-gateway

1. Define domain types in `types.py` (frozen dataclasses).
2. Create `<resource>_gateway.py` with an ABC class.
3. Add a `Fake<Resource>Gateway` class to `testing.py`.
4. Add the field to the `GH` dataclass in `facade.py`.
5. Add a parameter to `make_fake_gh()` in `testing.py`.
6. Add tests in `tests/test_fake_<resource>_gateway.py`.

## Example: using the facade in feature code

```python
from twerk_core.gh.facade import GH

def list_unresolved_threads(gh: GH, pr_number: int) -> list[str]:
    threads = gh.pr.get_review_threads(pr_number)
    return [t.path for t in threads]
```

## Example: testing with fakes

```python
from twerk_core.gh.testing import FakePRGateway, make_fake_gh

def test_list_unresolved_threads():
    fake_pr = FakePRGateway(review_threads={42: [some_thread]})
    gh = make_fake_gh(pr=fake_pr)
    result = list_unresolved_threads(gh, 42)
    assert result == ["src/main.py"]
```

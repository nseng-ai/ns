"""In-memory fake `gh` gateway."""

from __future__ import annotations

from areg.gateways.gh.gateway import GhCli, GhError, GhNotFound


class FakeGhCli(GhCli):
    """Fake `GhCli` configured with an in-memory directory catalog.

    Configure via constructor:

      catalog: ``{repo: {path: [entry, ...]}}`` — entries returned by
        ``list_directory(repo, path)``. A miss raises ``GhNotFound``.
      raise_for: ``{(repo, path): Exception}`` — overrides the catalog with a
        configured exception (use to inject ``GhAuthError``/``GhError``).
    """

    def __init__(
        self,
        *,
        catalog: dict[str, dict[str, list[str]]] | None = None,
        raise_for: dict[tuple[str, str], Exception] | None = None,
    ) -> None:
        self._catalog = catalog or {}
        self._raise_for = raise_for or {}
        self._calls: list[tuple[str, str]] = []

    @property
    def calls(self) -> list[tuple[str, str]]:
        """Return a copy of every (repo, path) pair `list_directory` was called with."""
        return list(self._calls)

    def list_directory(self, repo: str, path: str) -> list[str]:
        self._calls.append((repo, path))
        if (repo, path) in self._raise_for:
            raise self._raise_for[(repo, path)]
        if repo not in self._catalog or path not in self._catalog[repo]:
            raise GhNotFound(f"No {path}/ directory found in {repo}")
        try:
            return list(self._catalog[repo][path])
        except KeyError as e:  # pragma: no cover - defensive
            raise GhError(f"FakeGhCli misconfigured for {repo}/{path}") from e

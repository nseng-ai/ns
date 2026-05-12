"""Pytest wiring for the opt-in live GitHub conformance suite."""

from __future__ import annotations

import pytest

from asdl_core.gh.issue_gateway import IssueGateway
from asdl_core.gh.pr_gateway import PRGateway, RealPRGateway
from asdl_core.gh.real_issue_gateway import RealIssueGateway
from live_conformance.github.config import (
    ConformanceConfig,
    ConformanceConfigError,
    build_conformance_config,
)
from live_conformance.github.gh_cli import GhCli

_CONFIG_KEY: pytest.StashKey[ConformanceConfig] = pytest.StashKey()


def pytest_addoption(parser: pytest.Parser) -> None:
    group = parser.getgroup("live-github-conformance")
    group.addoption(
        "--run-live-github",
        action="store_true",
        default=False,
        dest="run_live_github",
        help="Run opt-in live GitHub conformance tests.",
    )
    group.addoption(
        "--github-conformance-repo",
        action="store",
        default=None,
        dest="github_conformance_repo",
        metavar="OWNER/NAME",
        help="GitHub repository targeted by live conformance tests.",
    )
    group.addoption(
        "--github-conformance-allow-mutations",
        action="store_true",
        default=None,
        dest="github_conformance_allow_mutations",
        help="Allow live tests marked live_github_mutating to mutate ephemeral fixtures.",
    )
    group.addoption(
        "--github-conformance-run-id",
        action="store",
        default=None,
        dest="github_conformance_run_id",
        help="Run id used to mark ephemeral live GitHub fixtures.",
    )


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "live_github: opt-in live GitHub conformance test")
    config.addinivalue_line(
        "markers",
        "live_github_mutating: live GitHub conformance test that mutates ephemeral fixtures",
    )
    if config.getoption("run_live_github") is not True:
        return

    try:
        conformance_config = build_conformance_config(
            repo_option=config.getoption("github_conformance_repo"),
            allow_mutations_option=config.getoption("github_conformance_allow_mutations"),
            run_id_option=config.getoption("github_conformance_run_id"),
        )
    except ConformanceConfigError as exc:
        raise pytest.UsageError(str(exc)) from exc
    config.stash[_CONFIG_KEY] = conformance_config


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if config.getoption("run_live_github") is not True:
        skip_live = pytest.mark.skip(reason="pass --run-live-github to run live GitHub tests")
        for item in items:
            if item.get_closest_marker("live_github") is not None:
                item.add_marker(skip_live)
        return

    conformance_config = config.stash.get(_CONFIG_KEY, None)
    if conformance_config is None or conformance_config.allow_mutations:
        return

    skip_mutating = pytest.mark.skip(
        reason="pass --github-conformance-allow-mutations or set "
        "ASDL_GH_CONFORMANCE_ALLOW_MUTATIONS=1 to run mutating live GitHub tests"
    )
    for item in items:
        if item.get_closest_marker("live_github_mutating") is not None:
            item.add_marker(skip_mutating)


@pytest.fixture(scope="session")
def conformance_config(pytestconfig: pytest.Config) -> ConformanceConfig:
    config = pytestconfig.stash.get(_CONFIG_KEY, None)
    if config is None:
        pytest.skip("pass --run-live-github to run live GitHub tests")
    return config


@pytest.fixture(scope="session")
def gh_cli(conformance_config: ConformanceConfig) -> GhCli:
    return GhCli(repo=conformance_config.repo)


@pytest.fixture(scope="session")
def pr_gateway(conformance_config: ConformanceConfig) -> PRGateway:
    return RealPRGateway(repo=conformance_config.repo)


@pytest.fixture(scope="session")
def issue_gateway(conformance_config: ConformanceConfig) -> IssueGateway:
    return RealIssueGateway(repo=conformance_config.repo)

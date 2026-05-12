"""Preflight checks for the live GitHub conformance repository."""

from __future__ import annotations

import json
from typing import Any, cast

import pytest

from live_conformance.github.config import ConformanceConfig
from live_conformance.github.fixtures import ISSUE_LIST_FIXTURES, PULL_REQUEST_FIXTURES
from live_conformance.github.gh_cli import GhCli, GhCliResult, gh_is_installed

pytestmark = pytest.mark.live_github


def test_preflight_gh_cli_is_installed() -> None:
    assert gh_is_installed(), "GitHub conformance setup failure: gh CLI is not installed"


def test_preflight_auth_status_works(gh_cli: GhCli) -> None:
    result = gh_cli.run(("auth", "status"))
    _assert_success(result, "checking gh authentication status")


def test_preflight_rate_limit_works(gh_cli: GhCli) -> None:
    result = gh_cli.run(("api", "rate_limit"))
    _assert_success(result, "checking GitHub API rate limits")
    payload = _load_json_object(result.stdout, "rate-limit response")
    if "resources" not in payload:
        pytest.fail("GitHub conformance setup failure: rate-limit response lacks resources")


def test_preflight_configured_repo_is_reachable(
    conformance_config: ConformanceConfig,
    gh_cli: GhCli,
) -> None:
    result = gh_cli.repo_view()
    _assert_success(result, f"viewing configured repository {conformance_config.repo}")
    payload = _load_json_object(result.stdout, "repository view response")
    name_with_owner = payload.get("nameWithOwner")
    assert isinstance(name_with_owner, str)
    if name_with_owner.casefold() != conformance_config.repo.casefold():
        pytest.fail(
            "GitHub conformance setup failure: configured repo resolved to "
            f"{name_with_owner!r}, expected {conformance_config.repo!r}"
        )


def test_preflight_pull_request_fixtures_exist_and_match(gh_cli: GhCli) -> None:
    for fixture in PULL_REQUEST_FIXTURES:
        result = gh_cli.run_in_repo(
            (
                "pr",
                "view",
                str(fixture.number),
                "--json",
                "number,title,state,headRefName,files",
            )
        )
        _assert_success(result, f"checking persistent PR fixture {fixture.name}")
        payload = _load_json_object(result.stdout, f"PR fixture {fixture.name} response")
        assert payload.get("number") == fixture.number
        assert payload.get("headRefName") == fixture.head_branch
        assert payload.get("state") == fixture.expected_state
        title = payload.get("title")
        assert isinstance(title, str)
        assert title.startswith(fixture.expected_title_prefix)
        _assert_expected_changed_files(payload, fixture.expected_changed_files, fixture.name)


def test_preflight_issue_list_fixtures_exist_and_match(gh_cli: GhCli) -> None:
    for fixture in ISSUE_LIST_FIXTURES:
        result = gh_cli.run_in_repo(
            (
                "issue",
                "list",
                "--label",
                fixture.label,
                "--state",
                fixture.expected_state.lower(),
                "--json",
                "number,title,state,labels",
                "--limit",
                "100",
            )
        )
        _assert_success(result, f"checking persistent issue fixture {fixture.name}")
        items = _load_json_array(result.stdout, f"issue fixture {fixture.name} response")
        matches = [
            item
            for item in items
            if item.get("state") == fixture.expected_state
            and _title_starts_with(item, fixture.expected_title_prefix)
            and _issue_has_label(item, fixture.label)
        ]
        if not matches:
            pytest.fail(
                "GitHub conformance setup failure: no issue matched persistent fixture "
                f"{fixture.name!r} with label {fixture.label!r} and title prefix "
                f"{fixture.expected_title_prefix!r}"
            )


def _assert_success(result: GhCliResult, description: str) -> None:
    if not result.succeeded:
        pytest.fail(result.setup_failure_message(description))


def _load_json_object(stdout: str, description: str) -> dict[str, Any]:
    raw = _load_json(stdout, description)
    if not isinstance(raw, dict):
        pytest.fail(f"GitHub conformance setup failure: {description} was not a JSON object")
    return raw


def _load_json_array(stdout: str, description: str) -> list[dict[str, Any]]:
    raw = _load_json(stdout, description)
    if not isinstance(raw, list):
        pytest.fail(f"GitHub conformance setup failure: {description} was not a JSON array")
    return cast(list[dict[str, Any]], raw)


def _load_json(stdout: str, description: str) -> object:
    if stdout.strip() == "":
        pytest.fail(f"GitHub conformance setup failure: {description} was empty")
    try:
        return json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(
            f"GitHub conformance setup failure: {description} was not valid JSON"
        ) from exc


def _assert_expected_changed_files(
    payload: dict[str, Any], expected_paths: tuple[str, ...], fixture_name: str
) -> None:
    if not expected_paths:
        return
    raw_files = payload.get("files")
    if not isinstance(raw_files, list):
        pytest.fail(
            f"GitHub conformance setup failure: PR fixture {fixture_name!r} lacks files list"
        )
    actual_paths = {
        path for path in (_file_path(raw_file) for raw_file in raw_files) if path is not None
    }
    missing_paths = tuple(path for path in expected_paths if path not in actual_paths)
    if missing_paths:
        pytest.fail(
            f"GitHub conformance setup failure: PR fixture {fixture_name!r} is missing "
            f"changed files {missing_paths!r}"
        )


def _file_path(raw_file: object) -> str | None:
    if not isinstance(raw_file, dict):
        return None
    path = raw_file.get("path") or raw_file.get("filename")
    if isinstance(path, str):
        return path
    return None


def _title_starts_with(item: dict[str, Any], prefix: str) -> bool:
    title = item.get("title")
    return isinstance(title, str) and title.startswith(prefix)


def _issue_has_label(item: dict[str, Any], expected_label: str) -> bool:
    labels = item.get("labels")
    if not isinstance(labels, list):
        return False
    for label in labels:
        if isinstance(label, dict) and label.get("name") == expected_label:
            return True
    return False

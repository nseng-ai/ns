from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_reviewer.cli.main import build_cli
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from asdl_reviewer.gateways.review_catalog.fake import FakeReviewCatalogGateway
from asdl_reviewer.harness.fake import FakeHarnessRuntime
from asdl_reviewer.models import (
    FindingsReview,
    LocalDiff,
    ProseReview,
    ReviewExecutionResponse,
    ReviewFinding,
    ReviewPayload,
    ReviewUsage,
)

REPO_ROOT = Path("/repo")
REVIEWS_DIR = REPO_ROOT / "reviews"
REVIEW_KEY = "dignified-python"


def _sample_source(*, include_default_model: bool = True) -> str:
    default_model_line = "default_model: sonnet\n" if include_default_model else ""
    return (
        "---\n"
        "description: Review Python diffs for style violations.\n"
        f"{default_model_line}"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n"
    )


def _build_context(
    *,
    payload: ReviewPayload | None = None,
    harness_detected: bool = True,
    keys: tuple[str, ...] | None = None,
    usage: ReviewUsage | None = None,
) -> ReviewerCliContext:
    paths_by_binary = {"claude": "/usr/local/bin/claude"} if harness_detected else {}
    if payload is None:
        payload = FindingsReview(findings=())
    return ReviewerCliContext(
        catalog=FakeReviewCatalogGateway(
            review_sources_by_key={REVIEW_KEY: _sample_source()},
            review_keys=keys,
            reviews_dir=REVIEWS_DIR,
        ),
        diff=FakeLocalDiffGateway(
            default_diff=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            ),
        ),
        harness_runtime=FakeHarnessRuntime(
            paths_by_binary=paths_by_binary,
            default_response=ReviewExecutionResponse(payload=payload, usage=usage),
        ),
        pr_gateway=FakePRGateway(),
        cwd=Path("/anywhere"),
    )


def _context(
    *,
    payload: ReviewPayload | None = None,
    harness_detected: bool = True,
    keys: tuple[str, ...] | None = None,
    usage: ReviewUsage | None = None,
) -> ClinkrContextObject:
    ctx = _build_context(
        payload=payload,
        harness_detected=harness_detected,
        keys=keys,
        usage=usage,
    )
    return build_clinkr_context_object(lambda: ctx)


def _obj(context: object) -> ClinkrContextObject:
    return build_clinkr_context_object(lambda: context)


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_reviewer_help_lists_subgroups(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Markdown-driven reviewer operations." in result.output
    assert "review" in result.output
    assert "harness" in result.output
    assert "--version" in result.output


def test_reviewer_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_review_run_human_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet", "--review-format", "findings"],
        obj=_context(payload=FindingsReview(findings=(finding,))),
    )

    assert result.exit_code == 0, result.output
    assert "Reviewer: dignified-python" in result.output
    assert "Model: sonnet" in result.output
    assert "Base ref: master" in result.output
    assert "[warning] app.py:1 Avoid print in library code" in result.output


def test_review_run_text_format_renders_prose(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet", "--review-format", "text"],
        obj=_context(payload=ProseReview(prose="### Review\n\n- app.py:1 — prefer click.echo")),
    )

    assert result.exit_code == 0, result.output
    assert "Reviewer: dignified-python" in result.output
    assert "### Review" in result.output
    assert "- app.py:1 — prefer click.echo" in result.output


def test_review_run_text_format_threads_request(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _build_context(payload=ProseReview(prose="markdown"))

    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet", "--review-format", "text"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 0, result.output
    assert isinstance(ctx.harness_runtime, FakeHarnessRuntime)
    executed = ctx.harness_runtime.executed_requests[0]
    assert executed.harness_name == "claude-code"
    assert executed.review_format == "text"
    assert executed.review_definition.name == REVIEW_KEY
    assert executed.local_diff.base_ref == "master"


def test_review_run_uses_default_model_from_definition(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _build_context()

    result = runner.invoke(cli_group, ["review", "run", REVIEW_KEY], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    assert "Model: sonnet" in result.output
    assert isinstance(ctx.harness_runtime, FakeHarnessRuntime)
    assert ctx.harness_runtime.executed_requests[0].model == "sonnet"


def test_review_run_surfaces_no_harness_detected(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj=_context(harness_detected=False),
    )

    assert result.exit_code != 0
    assert "No harness detected" in result.output


def test_review_run_json_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "review",
            "run",
            REVIEW_KEY,
            "--model",
            "sonnet",
            "--review-format",
            "findings",
            "--format",
            "json",
        ],
        obj=_context(payload=FindingsReview(findings=(finding,))),
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.stdout)
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["format"] == "findings"
    assert data["count"] == 1
    assert data["findings"][0]["summary"] == "Avoid print in library code"


def test_review_run_json_output_text_format(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "review",
            "run",
            REVIEW_KEY,
            "--model",
            "sonnet",
            "--review-format",
            "text",
            "--format",
            "json",
        ],
        obj=_context(payload=ProseReview(prose="**ok**")),
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.stdout)
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["format"] == "text"
    assert data["prose"] == "**ok**"
    assert "findings" not in data


def test_review_list_human_output(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _build_context(
        keys=("dignified-python", "python/typing"),
    )

    result = runner.invoke(cli_group, ["review", "list"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    output_lines = result.output.splitlines()
    assert "- dignified-python" in output_lines
    assert "python/" in output_lines
    assert "  - typing" in output_lines


def test_review_list_alias_ls(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _build_context(keys=("dignified-python",))

    result = runner.invoke(cli_group, ["review", "ls"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    assert "dignified-python" in result.output


def test_review_list_groups_nested_keys_under_top_level_dirs(
    cli_group: ClinkrGroup,
) -> None:
    runner = CliRunner()
    ctx = _build_context(
        keys=("dignified-python", "python/fakes", "python/typing"),
    )

    result = runner.invoke(cli_group, ["review", "list"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    lines = result.output.splitlines()
    assert "- dignified-python" in lines
    assert "python/" in lines
    python_idx = lines.index("python/")
    assert lines[python_idx + 1] == "  - fakes"
    assert lines[python_idx + 2] == "  - typing"


def test_review_list_flat_only_output_has_no_group_headers(
    cli_group: ClinkrGroup,
) -> None:
    runner = CliRunner()
    ctx = _build_context(
        keys=("alpha", "beta", "gamma"),
    )

    result = runner.invoke(cli_group, ["review", "list"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    output_lines = result.output.splitlines()
    for key in ("alpha", "beta", "gamma"):
        assert f"- {key}" in output_lines
    assert not any(line.startswith("  - ") for line in output_lines)


def test_review_list_renders_root_entries_before_group_headers(
    cli_group: ClinkrGroup,
) -> None:
    runner = CliRunner()
    ctx = _build_context(
        keys=("alpha", "python/fakes", "rust/clippy"),
    )

    result = runner.invoke(cli_group, ["review", "list"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    lines = result.output.splitlines()
    assert lines.index("- alpha") < lines.index("python/")
    assert lines.index("python/") < lines.index("rust/")
    assert "  - fakes" in lines
    assert "  - clippy" in lines


def test_review_list_json_envelope_preserves_ci_contract(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    ctx = _build_context(
        keys=("dignified-python", "python/typing"),
    )

    result = runner.invoke(cli_group, ["review", "list", "--format", "json"], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["keys"] == ["dignified-python", "python/typing"]
    assert data["count"] == 2
    assert data["reviews_dir"] == str(REVIEWS_DIR)


def test_review_run_prints_usage_block_when_present(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    usage = ReviewUsage(
        input_tokens=1000,
        output_tokens=500,
        cache_creation_input_tokens=200,
        cache_read_input_tokens=300,
        total_cost_usd=0.1234,
        duration_ms=4321,
        num_turns=3,
    )
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet", "--review-format", "text"],
        obj=_context(payload=ProseReview(prose="body"), usage=usage),
    )

    assert result.exit_code == 0, result.output
    assert "Tokens: 1,500 in / 500 out (cache read: 300, cache create: 200)" in result.output
    assert "Cost: $0.1234 USD" in result.output
    assert "Duration: 4.3s (3 turns)" in result.output


def test_review_run_omits_usage_block_when_absent(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet", "--review-format", "text"],
        obj=_context(payload=ProseReview(prose="body")),
    )

    assert result.exit_code == 0, result.output
    assert "Tokens:" not in result.output
    assert "Cost:" not in result.output


def test_review_run_json_output_includes_usage(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    usage = ReviewUsage(
        input_tokens=1000,
        output_tokens=500,
        cache_creation_input_tokens=200,
        cache_read_input_tokens=300,
        total_cost_usd=0.1234,
        duration_ms=4321,
        num_turns=3,
    )
    result = runner.invoke(
        cli_group,
        [
            "review",
            "run",
            REVIEW_KEY,
            "--model",
            "sonnet",
            "--review-format",
            "text",
            "--format",
            "json",
        ],
        obj=_context(payload=ProseReview(prose="**ok**"), usage=usage),
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.stdout)
    assert output["exit_code"] == 0
    assert output["data"]["usage"] == {
        "input_tokens": 1000,
        "output_tokens": 500,
        "cache_creation_input_tokens": 200,
        "cache_read_input_tokens": 300,
        "total_cost_usd": 0.1234,
        "duration_ms": 4321,
        "num_turns": 3,
    }


def test_review_run_json_output_usage_is_null_when_absent(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "review",
            "run",
            REVIEW_KEY,
            "--model",
            "sonnet",
            "--review-format",
            "text",
            "--format",
            "json",
        ],
        obj=_context(payload=ProseReview(prose="**ok**")),
    )

    assert result.exit_code == 0, result.output
    output = json.loads(result.stdout)
    assert output["data"]["usage"] is None


def test_review_run_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["review", "run", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_review_run_format_json_reports_failure(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet", "--format", "json"],
        obj=_context(harness_detected=False),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert "error_type" in payload
    assert "message" in payload


def test_review_run_requires_typed_context(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj={"wrong": "shape"},
    )

    assert result.exit_code != 0
    assert "ctx.obj must be a ClinkrContextObject" in str(result.exception)

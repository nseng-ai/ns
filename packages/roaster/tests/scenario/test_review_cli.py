from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.project_config import AsdlProjectConfigError
from roaster.cli.main import build_cli
from roaster.context import RoasterCliContext
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.models import (
    BaseRefUnavailable,
    DiffReviewTarget,
    FindingsReview,
    LocalDiff,
    ModelNotSupportedByHarness,
    ReviewExecutionResponse,
    ReviewFinding,
    ReviewPayload,
    ReviewUsage,
    RoasterFailure,
)

REPO_ROOT = Path("/repo")
REVIEWS_DIR = REPO_ROOT / "reviews"
REVIEW_KEY = "dignified-python"


class _InvalidConfigDiffGateway(LocalDiffGateway):
    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        raise AsdlProjectConfigError("bad asdl.toml")


def _sample_source(
    *,
    include_default_model: bool = True,
    description: str = "Review Python diffs for style violations.",
    applies_to: str = "",
) -> str:
    default_model_line = "default_model: sonnet\n" if include_default_model else ""
    return (
        "---\n"
        f"description: {description}\n"
        f"{default_model_line}"
        f"{applies_to}"
        "---\n"
        "\n"
        "Flag concrete issues in the diff.\n"
    )


def _diff_text_for_paths(paths: tuple[str, ...]) -> str:
    return "".join(f"diff --git a/{path} b/{path}\n+changed\n" for path in paths)


def _build_context(
    *,
    payload: ReviewPayload | None = None,
    keys: tuple[str, ...] | None = None,
    usage: ReviewUsage | None = None,
    default_response: ReviewExecutionResponse | RoasterFailure | None = None,
    review_sources_by_key: dict[str, str] | None = None,
    changed_paths: tuple[str, ...] = ("app.py",),
) -> RoasterCliContext:
    if payload is None:
        payload = FindingsReview(findings=())
    if review_sources_by_key is None:
        review_sources_by_key = {key: _sample_source() for key in keys or (REVIEW_KEY,)}
    return RoasterCliContext(
        catalog=FakeReviewCatalogGateway(
            review_sources_by_key=review_sources_by_key,
            review_keys=keys,
            reviews_dir=REVIEWS_DIR,
        ),
        diff=FakeLocalDiffGateway(
            default_diff=LocalDiff(
                base_ref="master",
                diff_text=_diff_text_for_paths(changed_paths),
            ),
        ),
        harness_runtime=FakeHarnessRuntime(
            default_response=default_response
            or ReviewExecutionResponse(payload=payload, usage=usage),
        ),
        pr_gateway=FakePRGateway(),
        cwd=Path("/anywhere"),
    )


def _context(
    *,
    payload: ReviewPayload | None = None,
    keys: tuple[str, ...] | None = None,
    usage: ReviewUsage | None = None,
    review_sources_by_key: dict[str, str] | None = None,
    changed_paths: tuple[str, ...] = ("app.py",),
) -> ClinkrContextObject:
    ctx = _build_context(
        payload=payload,
        keys=keys,
        usage=usage,
        review_sources_by_key=review_sources_by_key,
        changed_paths=changed_paths,
    )
    return build_clinkr_context_object(lambda: ctx)


def _obj(context: object) -> ClinkrContextObject:
    return build_clinkr_context_object(lambda: context)


def _applicable_review_sources() -> dict[str, str]:
    return {
        "dignified-python": _sample_source(
            applies_to=(
                "applies_to:\n  include:\n    - '**/*.py'\n  exclude:\n    - '**/tests/**/*.py'\n"
            )
        ),
        "typescript-style": _sample_source(
            description="Review TypeScript diffs for style violations.",
            applies_to=(
                "applies_to:\n"
                "  include:\n"
                "    - '**/*.ts'\n"
                "    - '**/*.tsx'\n"
                "    - '**/*.mts'\n"
                "    - '**/*.cts'\n"
            ),
        ),
    }


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_roaster_help_lists_review_only(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "CI PR-diff roaster operations." in result.output
    assert "review" in result.output
    assert "harness" not in result.output
    assert "exec" not in result.output
    assert "--version" in result.output


def test_roaster_version_option(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_review_run_human_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding.diff_line(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    result = CliRunner().invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj=_context(payload=FindingsReview(findings=(finding,))),
    )

    assert result.exit_code == 0, result.output
    assert "resolved model=sonnet base_ref=master changed_paths=1" in result.output
    assert "Reviewer: dignified-python" in result.output
    assert "Model: sonnet" in result.output
    assert "Base ref: master" in result.output
    assert "[warning] app.py:1 Avoid print in library code" in result.output


def test_review_run_threads_diff_request(cli_group: ClinkrGroup) -> None:
    ctx = _build_context()

    result = CliRunner().invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 0, result.output
    assert isinstance(ctx.harness_runtime, FakeHarnessRuntime)
    executed = ctx.harness_runtime.executed_requests[0]
    assert executed.review_definition.name == REVIEW_KEY
    assert isinstance(executed.target, DiffReviewTarget)
    assert executed.target.local_diff.base_ref == "master"


def test_review_run_uses_default_model_from_definition(cli_group: ClinkrGroup) -> None:
    ctx = _build_context()

    result = CliRunner().invoke(cli_group, ["review", "run", REVIEW_KEY], obj=_obj(ctx))

    assert result.exit_code == 0, result.output
    assert "Model: sonnet" in result.output
    assert isinstance(ctx.harness_runtime, FakeHarnessRuntime)
    assert ctx.harness_runtime.executed_requests[0].model == "sonnet"


def test_review_run_json_output(cli_group: ClinkrGroup) -> None:
    finding = ReviewFinding.diff_line(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    result = CliRunner().invoke(
        cli_group,
        [
            "review",
            "run",
            REVIEW_KEY,
            "--model",
            "sonnet",
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


def test_review_run_json_output_for_oversized_diff_preserves_failure_metadata(
    cli_group: ClinkrGroup,
) -> None:
    changed_paths = tuple(f"pkg/file_{index}.py" for index in range(301))
    ctx = _build_context(changed_paths=changed_paths)

    result = CliRunner().invoke(
        cli_group,
        [
            "review",
            "run",
            REVIEW_KEY,
            "--model",
            "sonnet",
            "--format",
            "json",
        ],
        obj=_obj(ctx),
    )

    assert result.exit_code == 1, result.output
    output = json.loads(result.stdout)
    assert output["exit_code"] == 1
    assert "Review 'dignified-python' was not run against base 'master'" in output["message"]
    data = output["data"]
    assert data["review_name"] == "dignified-python"
    assert data["base_ref"] == "master"
    assert data["model"] == "sonnet"
    assert data["error_type"] == "review_budget_exceeded"
    assert data["budget"]["changed_path_count"] == 301
    assert data["budget"]["max_changed_paths"] == 300
    assert isinstance(ctx.harness_runtime, FakeHarnessRuntime)
    assert ctx.harness_runtime.executed_requests == ()


def test_review_run_json_output_for_harness_failure_preserves_failure_metadata(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _build_context(
        default_response=ModelNotSupportedByHarness(
            message="Model 'gpt-5-mini' is not supported by Claude Code."
        )
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "review",
            "run",
            REVIEW_KEY,
            "--model",
            "gpt-5-mini",
            "--format",
            "json",
        ],
        obj=_obj(ctx),
    )

    assert result.exit_code == 1, result.output
    output = json.loads(result.stdout)
    assert output["exit_code"] == 1
    data = output["data"]
    assert data["review_name"] == "dignified-python"
    assert data["base_ref"] == "master"
    assert data["model"] == "gpt-5-mini"
    assert data["error_type"] == "model_not_supported_by_harness"
    assert data["message"] == "Model 'gpt-5-mini' is not supported by Claude Code."
    assert "budget" not in data


def test_review_list_human_output(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["review", "list"],
        obj=_context(keys=("dignified-python", "typescript-style")),
    )

    assert result.exit_code == 0, result.output
    assert "Reviews directory: /repo/reviews" in result.output
    assert "Reviews: 2" in result.output
    assert "- dignified-python" in result.output
    assert "- typescript-style" in result.output
    assert "ci:" not in result.output


def test_review_list_json_output(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["review", "list", "--format", "json"],
        obj=_context(keys=("dignified-python", "typescript-style")),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.stdout)["data"]
    assert data["keys"] == ["dignified-python", "typescript-style"]
    assert data["count"] == 2
    assert data["reviews"][0]["description"] == "Review Python diffs for style violations."
    assert "ci" not in data["reviews"][0]


def test_review_list_applicable_includes_python_source_review(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["review", "list", "--applicable", "--base-ref", "master", "--format", "json"],
        obj=_context(
            keys=("dignified-python", "typescript-style"),
            review_sources_by_key=_applicable_review_sources(),
            changed_paths=("packages/asdl-core/src/asdl_core/project_config.py",),
        ),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.stdout)["data"]
    assert data["keys"] == ["dignified-python"]
    assert data["count"] == 1


def test_review_list_applicable_excludes_python_test_only_review(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["review", "list", "--applicable", "--base-ref", "master", "--format", "json"],
        obj=_context(
            keys=("dignified-python", "typescript-style"),
            review_sources_by_key=_applicable_review_sources(),
            changed_paths=("packages/asdl-core/tests/unit/prompts/test_resolver.py",),
        ),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.stdout)["data"]
    assert data["keys"] == []
    assert data["count"] == 0


def test_review_list_applicable_includes_typescript_family_review(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["review", "list", "--applicable", "--base-ref", "master", "--format", "json"],
        obj=_context(
            keys=("dignified-python", "typescript-style"),
            review_sources_by_key=_applicable_review_sources(),
            changed_paths=("ts/packages/pi-extensions/test/planned-branch-extension.test.ts",),
        ),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.stdout)["data"]
    assert data["keys"] == ["typescript-style"]
    assert data["count"] == 1


def test_review_list_applicable_excludes_docs_and_justfile_only_changes(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _build_context(
        keys=("dignified-python", "typescript-style"),
        review_sources_by_key=_applicable_review_sources(),
        changed_paths=("docs/notes.md", "justfile"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["review", "list", "--applicable", "--base-ref", "master", "--format", "json"],
        obj=_obj(ctx),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.stdout)["data"]
    assert data["keys"] == []
    assert data["count"] == 0
    assert isinstance(ctx.diff, FakeLocalDiffGateway)
    assert ctx.diff.requested_base_refs == ("master",)


def test_review_run_requires_model_when_definition_has_no_default(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["review", "run", REVIEW_KEY],
        obj=_obj(
            _build_context(
                review_sources_by_key={REVIEW_KEY: _sample_source(include_default_model=False)}
            )
        ),
    )

    assert result.exit_code != 0
    assert "No model was provided" in result.output


def test_review_run_surfaces_config_errors(cli_group: ClinkrGroup) -> None:
    ctx = _build_context()
    ctx = RoasterCliContext(
        catalog=ctx.catalog,
        diff=_InvalidConfigDiffGateway(),
        harness_runtime=ctx.harness_runtime,
        pr_gateway=ctx.pr_gateway,
        cwd=ctx.cwd,
    )

    result = CliRunner().invoke(
        cli_group,
        ["review", "run", REVIEW_KEY, "--model", "sonnet"],
        obj=_obj(ctx),
    )

    assert result.exit_code != 0
    assert "bad asdl.toml" in result.output


def test_review_run_renders_usage(cli_group: ClinkrGroup) -> None:
    usage = ReviewUsage(
        input_tokens=100,
        output_tokens=50,
        cache_creation_input_tokens=10,
        cache_read_input_tokens=5,
        total_cost_usd=0.0123,
        duration_ms=1234,
        num_turns=2,
    )

    result = CliRunner().invoke(
        cli_group,
        ["review", "run", REVIEW_KEY],
        obj=_context(usage=usage),
    )

    assert result.exit_code == 0, result.output
    assert "Tokens: 115 in / 50 out" in result.output
    assert "Cost: $0.0123 USD" in result.output
    assert "Duration: 1.2s (2 turns)" in result.output

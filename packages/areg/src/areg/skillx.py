"""Skillx: run skills from GitHub repos without installing them."""

from __future__ import annotations

import json
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import click

from areg.context import AregContext
from areg.gateways.gh.gateway import GhAuthError, GhCli, GhError, GhNotFound
from areg.gateways.skillx_workspace.gateway import SkillxWorkspaceError, SkillxWorkspaceInstaller
from areg.preconditions import requires_gh, requires_npx

_DEFAULT_SKILL_REPO = "dagster-io/asdl-tools"
_REPO_RE = re.compile(r"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ParseResult:
    success: bool
    repo: str | None = None
    skill: str | None = None
    format: str | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        if self.success:
            return {"success": True, "repo": self.repo, "skill": self.skill, "format": self.format}
        return {"success": False, "error": self.error}


@dataclass(frozen=True)
class ListResult:
    success: bool
    repo: str | None = None
    skills: list[str] | None = None
    error: str | None = None
    hint: str | None = None

    def to_dict(self) -> dict:
        if self.success:
            return {"success": True, "repo": self.repo, "skills": self.skills}
        d: dict = {"success": False, "error": self.error}
        if self.hint:
            d["hint"] = self.hint
        return d


@dataclass(frozen=True)
class FetchResult:
    success: bool
    repo: str | None = None
    skill: str | None = None
    tmp_dir: str | None = None
    skill_dir: str | None = None
    skill_md: str | None = None
    files: list[str] | None = None
    needs_selection: bool = False
    available_skills: list[str] | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        if self.success:
            d: dict = {
                "success": True,
                "repo": self.repo,
                "skill": self.skill,
                "tmp_dir": self.tmp_dir,
                "skill_dir": self.skill_dir,
                "skill_md": self.skill_md,
                "files": self.files,
            }
            if self.needs_selection:
                d["needs_selection"] = True
                d["available_skills"] = self.available_skills
            return d
        return {"success": False, "error": self.error, "tmp_dir": None}


@dataclass(frozen=True)
class CleanupResult:
    success: bool
    removed: str | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        if self.success:
            return {"success": True, "removed": self.removed}
        return {"success": False, "error": self.error}


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------


def parse_skill_input(raw: str) -> ParseResult:
    """Parse user input into repo and optional skill name."""
    raw = raw.strip()
    if not raw:
        return ParseResult(success=False, error="Empty input")

    # 1. GitHub URL
    parsed = urlparse(raw)
    if parsed.scheme in ("http", "https") and parsed.netloc == "github.com":
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        if len(parts) >= 2:
            repo = f"{parts[0]}/{parts[1]}"
            # Look for skills/<name> in the path
            skill = None
            for i, segment in enumerate(parts):
                if segment == "skills" and i + 1 < len(parts):
                    skill = parts[i + 1]
                    break
            return ParseResult(success=True, repo=repo, skill=skill, format="url")

    # 2. --skill / -s flag: owner/repo --skill skill-name (or -s skill-name)
    flag_match = re.search(r"\s(?:--skill|-s)(?:\s|$)", raw)
    if flag_match:
        repo_candidate = raw[: flag_match.start()].strip()
        skill = raw[flag_match.end() :].strip() or None
        if _REPO_RE.match(repo_candidate):
            return ParseResult(success=True, repo=repo_candidate, skill=skill, format="skill_flag")

    # 3. Plain: owner/repo [skill-name]
    tokens = raw.split()
    if tokens and _REPO_RE.match(tokens[0]):
        repo = tokens[0]
        skill = tokens[1] if len(tokens) >= 2 else None
        fmt = "plain" if skill else "repo_only"
        return ParseResult(success=True, repo=repo, skill=skill, format=fmt)

    return ParseResult(success=False, error=f"Could not extract owner/repo from input: {raw!r}")


def list_skills(repo: str, *, gh: GhCli) -> ListResult:
    """List available skills from a GitHub repo via the `gh` gateway."""
    try:
        entries = gh.list_directory(repo, "skills")
    except GhNotFound:
        return ListResult(
            success=False,
            error=f"No skills directory found in {repo}",
            hint="Check that the repo exists and has a skills/ directory",
        )
    except GhAuthError:
        return ListResult(
            success=False,
            error=f"Authentication error accessing {repo}",
            hint="Check `gh auth status` for authentication issues",
        )
    except GhError as e:
        return ListResult(success=False, error=str(e))

    return ListResult(success=True, repo=repo, skills=sorted(entries))


def fetch_skill(
    repo: str,
    skill: str | None,
    *,
    workspace_installer: SkillxWorkspaceInstaller,
) -> FetchResult:
    """Fetch a skill into a transient workspace prepared for skillx."""
    try:
        workspace = workspace_installer.install(repo, skill=skill)
    except SkillxWorkspaceError as e:
        return FetchResult(success=False, error=str(e))

    installed = sorted(workspace.skills, key=lambda installed_skill: installed_skill.name)
    if not installed:
        return FetchResult(success=False, error="No skills were installed")

    if not skill and len(installed) > 1:
        return FetchResult(
            success=True,
            repo=repo,
            tmp_dir=str(workspace.tmp_dir),
            needs_selection=True,
            available_skills=[installed_skill.name for installed_skill in installed],
        )

    target_name = skill if skill else installed[0].name
    target_skill = next(
        (installed_skill for installed_skill in installed if installed_skill.name == target_name),
        None,
    )
    if target_skill is None:
        shutil.rmtree(workspace.tmp_dir, ignore_errors=True)
        return FetchResult(
            success=False,
            error=f"Skill {target_name!r} was not found in installed skills",
        )

    return FetchResult(
        success=True,
        repo=repo,
        skill=target_name,
        tmp_dir=str(workspace.tmp_dir),
        skill_dir=str(target_skill.skill_dir),
        skill_md=str(target_skill.skill_md),
        files=list(target_skill.files),
    )


def cleanup_skill_dir(path: str) -> CleanupResult:
    """Remove a skillx temp directory with safety validation."""
    p = Path(path)

    if not p.name.startswith("skillx."):
        return CleanupResult(
            success=False,
            error=f"Refusing to remove: {path!r} does not have 'skillx.' prefix",
        )

    if p.is_symlink():
        return CleanupResult(
            success=False,
            error=f"Refusing to remove: {path!r} is a symlink",
        )

    if not p.exists():
        return CleanupResult(
            success=False,
            error=f"Directory does not exist: {path!r}",
        )

    if not p.is_dir():
        return CleanupResult(
            success=False,
            error=f"Refusing to remove: {path!r} is not a directory",
        )

    tmp_root = Path(tempfile.gettempdir()).resolve()
    resolved = p.resolve()
    if resolved != tmp_root and not resolved.is_relative_to(tmp_root):
        return CleanupResult(
            success=False,
            error=f"Refusing to remove: {path!r} is not under {tmp_root}",
        )

    try:
        shutil.rmtree(p)
    except OSError as e:
        return CleanupResult(success=False, error=f"Failed to remove {path!r}: {e}")

    return CleanupResult(success=True, removed=path)


# ---------------------------------------------------------------------------
# Click commands: exec group
# ---------------------------------------------------------------------------


def _emit(result_obj: ParseResult | ListResult | FetchResult | CleanupResult) -> None:
    click.echo(json.dumps(result_obj.to_dict(), indent=2))


@click.group("exec", hidden=True)
def exec_group() -> None:
    """Internal commands for agent consumption."""


# -- skillx subgroup --------------------------------------------------------


@exec_group.group("skillx")
def skillx_group() -> None:
    """Run skills from GitHub repos without installing."""


@skillx_group.command("parse")
@click.argument("input_text")
def skillx_parse_cmd(input_text: str) -> None:
    """Parse user input into repo and skill name."""
    _emit(parse_skill_input(input_text))


@skillx_group.command("list")
@click.option("--repo", required=True, help="GitHub repo (owner/repo).")
@click.pass_obj
def skillx_list_cmd(ctx: AregContext, repo: str) -> None:
    """List available skills from a GitHub repo."""
    requires_gh(ctx.environment)
    result = list_skills(repo, gh=ctx.gh)
    _emit(result)
    if not result.success:
        raise SystemExit(1)


@skillx_group.command("fetch")
@click.option("--repo", required=True, help="GitHub repo (owner/repo).")
@click.option("--skill", "skill_name", default=None, help="Specific skill to fetch.")
@click.pass_obj
def skillx_fetch_cmd(ctx: AregContext, repo: str, skill_name: str | None) -> None:
    """Fetch a skill into a temp directory."""
    requires_npx(ctx.environment)
    result = fetch_skill(repo, skill_name, workspace_installer=ctx.skillx_workspace)
    _emit(result)
    if not result.success:
        raise SystemExit(1)


@skillx_group.command("cleanup")
@click.option("--dir", "dir_path", required=True, help="Temp directory to remove.")
def skillx_cleanup_cmd(dir_path: str) -> None:
    """Remove a skillx temp directory."""
    result = cleanup_skill_dir(dir_path)
    _emit(result)
    if not result.success:
        raise SystemExit(1)

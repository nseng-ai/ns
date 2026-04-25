"""Upsert a single state entry in the master-branch state.json for a memjective slug."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal, cast

import click

from twerk_core.clinkr.context import is_machine_mode, load_typed_context
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.evidence import EvidenceBundle, compute_evidence
from twerk_core.memjective.exec_compute_pending_entries import pending_entry_ids
from twerk_core.memjective.exec_init import serialize_state_payload
from twerk_core.memjective.state import (
    STATE_BRANCH,
    STATE_NAMESPACE,
    MemjectiveState,
    StateAbsent,
    StateEntry,
    StateInvalid,
    load_state,
    state_key,
)

UpsertAction = Literal["created", "updated", "promoted"]

VALID_RESOLUTIONS = ("incorporated", "incorporated_no_doc_change", "skipped", "tracked")
VALID_PR_STATES = ("OPEN", "MERGED", "CLOSED")
INCORPORATION_RESOLUTIONS = frozenset({"incorporated", "incorporated_no_doc_change"})

_ID_PR_RE = re.compile(r"^pr-(\d+)$")
_ID_BRANCH_RE = re.compile(r"^branch-(.+)$")


@dataclass(frozen=True)
class ExecRecordEntryRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]
    payload_arg: Annotated[
        str | None,
        click.Argument(["payload_arg"], type=click.STRING, required=False, default=None),
    ] = None
    file: Annotated[
        str | None,
        click.Option(
            ["--file", "-f"],
            type=click.STRING,
            default=None,
            help="Read the entry payload as JSON from this file.",
        ),
    ] = None
    json_literal: Annotated[
        str | None,
        click.Option(
            ["--json", "-j"],
            type=click.STRING,
            default=None,
            help="Pass the entry payload as a JSON literal on the command line.",
        ),
    ] = None
    force: Annotated[
        bool,
        click.Option(
            ["--force"],
            is_flag=True,
            default=False,
            help=(
                "Bypass the resolution-regression guard and the incorporation "
                "no_pending_match check. Does not bypass duplicate-merge or "
                "doc-change consistency checks."
            ),
        ),
    ] = False


@dataclass(frozen=True)
class ExecRecordEntryResult:
    slug: str
    entry_id: str
    action: UpsertAction
    commit_sha: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "entry_id": self.entry_id,
            "action": self.action,
            "commit_sha": self.commit_sha,
        }


@dataclass(frozen=True)
class ValidEntry:
    raw: dict[str, Any]
    id: str


@dataclass(frozen=True)
class EntryInvalid:
    reason: str
    error_type: str = "entry_invalid"


EntryValidation = ValidEntry | EntryInvalid

_INCORPORATION_PROVENANCE_KEYS = ("namespace", "branch", "path", "tree_sha")


@dataclass(frozen=True)
class UpsertOk:
    entries: tuple[StateEntry, ...]
    action: UpsertAction


@dataclass(frozen=True)
class UpsertReject:
    error_type: str
    message: str


UpsertResult = UpsertOk | UpsertReject


def render_exec_record_entry(result: ExecRecordEntryResult) -> None:
    click.echo(f"{result.action} entry {result.entry_id} for {result.slug!r}.")
    click.echo(f"Commit: {result.commit_sha}")


def validate_entry_payload(payload: object) -> EntryValidation:
    if not isinstance(payload, dict):
        return EntryInvalid(reason="entry payload must be a JSON object")
    payload_dict = cast(dict[str, Any], payload)

    entry_id = payload_dict.get("id")
    if not isinstance(entry_id, str) or not entry_id:
        return EntryInvalid(reason="entry.id must be a non-empty string")

    pr_match = _ID_PR_RE.match(entry_id)
    branch_match = _ID_BRANCH_RE.match(entry_id)
    if pr_match is None and branch_match is None:
        return EntryInvalid(
            reason=(f"entry.id {entry_id!r} must match 'pr-<int>' or 'branch-<name>'"),
        )

    resolution = payload_dict.get("resolution")
    if not isinstance(resolution, str) or resolution not in VALID_RESOLUTIONS:
        joined = ", ".join(VALID_RESOLUTIONS)
        return EntryInvalid(
            reason=f"entry.resolution must be one of: {joined}",
        )

    if "summary" in payload_dict and not isinstance(payload_dict["summary"], str):
        return EntryInvalid(reason="entry.summary must be a string when present")

    pr_payload = payload_dict.get("pr")
    if pr_match is not None:
        if not isinstance(pr_payload, dict):
            return EntryInvalid(
                reason="entry.pr is required when id starts with 'pr-' and must be an object",
            )
        pr_dict = cast(dict[str, Any], pr_payload)
        pr_number = pr_dict.get("number")
        if not isinstance(pr_number, int) or isinstance(pr_number, bool):
            return EntryInvalid(reason="entry.pr.number must be an integer")
        expected = int(pr_match.group(1))
        if pr_number != expected:
            return EntryInvalid(
                reason=(f"entry.pr.number {pr_number} does not match id {entry_id!r}"),
            )
        pr_state = pr_dict.get("state")
        if pr_state is not None and pr_state not in VALID_PR_STATES:
            joined = ", ".join(VALID_PR_STATES)
            return EntryInvalid(
                reason=f"entry.pr.state must be one of: {joined}",
            )
    elif pr_payload is not None and not isinstance(pr_payload, dict):
        return EntryInvalid(reason="entry.pr must be an object when present")

    if resolution in INCORPORATION_RESOLUTIONS:
        incorporation_check = _validate_incorporation_schema(payload_dict, entry_id=entry_id)
        if incorporation_check is not None:
            return incorporation_check

    return ValidEntry(raw=dict(payload_dict), id=entry_id)


def _validate_incorporation_schema(
    payload: dict[str, Any],
    *,
    entry_id: str,
) -> EntryInvalid | None:
    """Strict-schema gate for incorporation-shaped entries.

    Returns ``None`` when the payload satisfies the hard requirements that
    PR 6 enforces: a merged PR with ``merge_commit_oid``, plus ``source`` /
    ``root_before`` / ``root_after`` blocks each carrying full provenance.
    """
    if not entry_id.startswith("pr-"):
        return EntryInvalid(
            reason=(f"entry.id {entry_id!r} must start with 'pr-' for an incorporation resolution"),
            error_type="incorporation_requires_pr_id",
        )

    pr_payload = payload.get("pr")
    if not isinstance(pr_payload, dict):
        return EntryInvalid(
            reason="entry.pr is required for an incorporation resolution",
            error_type="entry_invalid",
        )
    pr_dict = cast(dict[str, Any], pr_payload)

    pr_state = pr_dict.get("state")
    if pr_state != "MERGED":
        return EntryInvalid(
            reason=(
                f"entry.pr.state must be 'MERGED' for an incorporation resolution; got {pr_state!r}"
            ),
            error_type="pr_not_merged",
        )

    merge_commit_oid = pr_dict.get("merge_commit_oid")
    if not isinstance(merge_commit_oid, str) or not merge_commit_oid:
        return EntryInvalid(
            reason="entry.pr.merge_commit_oid is required for an incorporation resolution",
            error_type="missing_merge_commit_oid",
        )

    for block in ("source", "root_before", "root_after"):
        block_check = _validate_provenance_block(payload, block_name=block)
        if block_check is not None:
            return block_check

    return None


def _validate_provenance_block(
    payload: dict[str, Any],
    *,
    block_name: str,
) -> EntryInvalid | None:
    block = payload.get(block_name)
    if not isinstance(block, dict):
        return EntryInvalid(
            reason=(
                f"entry.{block_name} is required for an incorporation resolution "
                f"and must be an object"
            ),
            error_type=f"missing_{block_name}",
        )
    block_dict = cast(dict[str, Any], block)
    for field in _INCORPORATION_PROVENANCE_KEYS:
        value = block_dict.get(field)
        if not isinstance(value, str) or not value:
            return EntryInvalid(
                reason=(
                    f"entry.{block_name}.{field} must be a non-empty string for an "
                    f"incorporation resolution"
                ),
                error_type=f"missing_{block_name}_{field}",
            )
    return None


def apply_upsert(
    state: MemjectiveState,
    valid: ValidEntry,
    *,
    force: bool,
) -> UpsertResult:
    new_id = valid.id
    new_pr_number = _extract_pr_number(valid.raw)

    target = next((e for e in state.entries if e.id == new_id), None)

    if target is not None:
        if not force:
            old_resolution = target.raw.get("resolution")
            new_resolution = valid.raw.get("resolution")
            if old_resolution == "incorporated" and new_resolution == "tracked":
                return UpsertReject(
                    error_type="resolution_regression",
                    message=(
                        f"Refusing to lower entry {new_id!r} from 'incorporated' to "
                        f"'tracked'; pass --force to override."
                    ),
                )
        new_entry = StateEntry(id=new_id, raw=valid.raw)
        new_entries = tuple(new_entry if e.id == new_id else e for e in state.entries)
        return UpsertOk(entries=new_entries, action="updated")

    if new_pr_number is not None:
        head_ref_name = _extract_head_ref_name(valid.raw)
        for existing in state.entries:
            existing_pr = existing.raw.get("pr")
            if not isinstance(existing_pr, dict):
                continue
            if existing_pr.get("number") != new_pr_number:
                continue
            if (
                existing.id.startswith("branch-")
                and isinstance(head_ref_name, str)
                and existing.id == f"branch-{head_ref_name}"
            ):
                new_entry = StateEntry(id=new_id, raw=valid.raw)
                new_entries = tuple(new_entry if e is existing else e for e in state.entries)
                return UpsertOk(entries=new_entries, action="promoted")
            return UpsertReject(
                error_type="duplicate_pr_number",
                message=(
                    f"PR #{new_pr_number} already recorded under id {existing.id!r}; "
                    f"cannot record under id {new_id!r}."
                ),
            )

    new_entry = StateEntry(id=new_id, raw=valid.raw)
    return UpsertOk(entries=(*state.entries, new_entry), action="created")


def _validate_incorporation_against_evidence(
    valid: ValidEntry,
    *,
    bundle: EvidenceBundle,
    state: MemjectiveState,
    force: bool,
) -> UpsertReject | None:
    """Cross-check an incorporation payload against live evidence and stored state.

    Returns ``None`` when the payload is consistent with the system; otherwise an
    :class:`UpsertReject` whose ``error_type`` names the specific rule that fired.

    ``force`` only bypasses the ``no_pending_match`` rule (per PR 6's "unless
    explicitly forced" clause). The doc-change invariant and the
    duplicate-merge check are about consistency, not policy, and are never
    bypassed.
    """
    payload = valid.raw
    pr_payload = cast(dict[str, Any], payload["pr"])
    pr_number = cast(int, pr_payload["number"])
    payload_merge_oid = cast(str, pr_payload["merge_commit_oid"])
    resolution = cast(str, payload["resolution"])
    payload_source = cast(dict[str, Any], payload["source"])
    payload_root_before = cast(dict[str, Any], payload["root_before"])
    payload_root_after = cast(dict[str, Any], payload["root_after"])

    duplicate = _find_duplicate_incorporation(
        state=state,
        pr_number=pr_number,
        merge_commit_oid=payload_merge_oid,
        payload_id=valid.id,
    )
    if duplicate is not None:
        return duplicate

    same_root = payload_root_before["tree_sha"] == payload_root_after["tree_sha"]
    if resolution == "incorporated" and same_root:
        return UpsertReject(
            error_type="root_unchanged_for_incorporated",
            message=(
                "entry.root_before.tree_sha equals entry.root_after.tree_sha; record "
                "'incorporated_no_doc_change' when the rewrite was a no-op."
            ),
        )
    if resolution == "incorporated_no_doc_change" and not same_root:
        return UpsertReject(
            error_type="root_changed_for_no_doc_change",
            message=(
                "entry.root_before.tree_sha differs from entry.root_after.tree_sha; "
                "record 'incorporated' when the rewrite changes root docs."
            ),
        )

    if bundle.root.tree_sha != payload_root_after["tree_sha"]:
        return UpsertReject(
            error_type="root_after_mismatch",
            message=(
                f"entry.root_after.tree_sha {payload_root_after['tree_sha']!r} does not "
                f"match the current root tree_sha {bundle.root.tree_sha!r}."
            ),
        )

    evidence_branch = next(
        (b for b in bundle.branches if b.pr.number == pr_number),
        None,
    )
    if evidence_branch is None or evidence_branch.pr.lookup_status != "found":
        if force:
            return None
        return UpsertReject(
            error_type="no_pending_match",
            message=(
                f"PR #{pr_number} is not present in the live evidence bundle for "
                f"slug {bundle.slug!r}; pass --force to override."
            ),
        )

    evidence_pr = evidence_branch.pr
    if evidence_pr.state != "MERGED":
        return UpsertReject(
            error_type="pr_not_merged",
            message=(
                f"PR #{pr_number} is in state {evidence_pr.state!r}; an incorporation "
                f"resolution requires a merged PR."
            ),
        )

    if evidence_pr.merge_commit_oid != payload_merge_oid:
        return UpsertReject(
            error_type="merge_commit_oid_mismatch",
            message=(
                f"PR #{pr_number} merge_commit_oid {payload_merge_oid!r} does not "
                f"match the live observation {evidence_pr.merge_commit_oid!r}."
            ),
        )

    if evidence_branch.source.tree_sha != payload_source["tree_sha"]:
        return UpsertReject(
            error_type="source_tree_sha_mismatch",
            message=(
                f"entry.source.tree_sha {payload_source['tree_sha']!r} does not match "
                f"the current source snapshot tree_sha "
                f"{evidence_branch.source.tree_sha!r} for branch "
                f"{evidence_branch.source.branch!r}."
            ),
        )

    if not force and valid.id not in pending_entry_ids(bundle):
        return UpsertReject(
            error_type="no_pending_match",
            message=(
                f"Entry {valid.id!r} is not in the current pending set for slug "
                f"{bundle.slug!r}; pass --force to override."
            ),
        )

    return None


def _find_duplicate_incorporation(
    *,
    state: MemjectiveState,
    pr_number: int,
    merge_commit_oid: str,
    payload_id: str,
) -> UpsertReject | None:
    for existing in state.entries:
        existing_pr = existing.raw.get("pr")
        if not isinstance(existing_pr, dict):
            continue
        if existing_pr.get("number") != pr_number:
            continue
        existing_resolution = existing.raw.get("resolution")
        if existing_resolution not in INCORPORATION_RESOLUTIONS:
            continue
        if existing_pr.get("merge_commit_oid") != merge_commit_oid:
            continue
        if existing.id == payload_id:
            detail = f"entry {payload_id!r} is already recorded as {existing_resolution!r}"
        else:
            detail = (
                f"PR #{pr_number} merge {merge_commit_oid!r} is already recorded under "
                f"entry {existing.id!r} as {existing_resolution!r}"
            )
        return UpsertReject(
            error_type="already_incorporated",
            message=f"{detail}; refusing duplicate (not bypassable by --force).",
        )
    return None


def _extract_pr_number(raw: dict[str, Any]) -> int | None:
    pr = raw.get("pr")
    if not isinstance(pr, dict):
        return None
    number = pr.get("number")
    if isinstance(number, bool) or not isinstance(number, int):
        return None
    return number


def _extract_head_ref_name(raw: dict[str, Any]) -> str | None:
    pr = raw.get("pr")
    if not isinstance(pr, dict):
        return None
    head = pr.get("head_ref_name")
    return head if isinstance(head, str) else None


def _serialize_state(state: MemjectiveState) -> str:
    payload = {
        "version": state.version,
        "slug": state.slug,
        "root": {
            "namespace": state.root.namespace,
            "branch": state.root.branch,
            "path": state.root.path,
        },
        "entries": [entry.raw for entry in state.entries],
    }
    return serialize_state_payload(payload)


@dataclass(frozen=True)
class _PayloadText:
    text: str


@dataclass(frozen=True)
class _PayloadFailure:
    error_type: str
    message: str


_PayloadResolution = _PayloadText | _PayloadFailure


def _resolve_payload_source(
    request: ExecRecordEntryRequest,
    *,
    machine_mode: bool,
) -> _PayloadResolution:
    sources_set = sum(
        1
        for value in (
            request.file,
            request.json_literal,
            request.payload_arg,
        )
        if value is not None
    )

    if sources_set == 0:
        return _PayloadFailure(
            error_type="no_payload_source",
            message=(
                "Provide one of --file/-f, --json/-j, or '-' as a positional argument "
                "to read the entry payload from stdin."
            ),
        )

    if sources_set > 1:
        return _PayloadFailure(
            error_type="conflicting_payload_sources",
            message="--file, --json, and a positional payload argument are mutually exclusive.",
        )

    if request.payload_arg is not None:
        if request.payload_arg != "-":
            return _PayloadFailure(
                error_type="invalid_positional_payload",
                message=(
                    "Positional payload argument must be '-' (read from stdin); "
                    f"got {request.payload_arg!r}."
                ),
            )
        if machine_mode:
            return _PayloadFailure(
                error_type="stdin_unsupported_in_json_mode",
                message=(
                    "Reading the entry payload from stdin is only supported in the human CLI; "
                    "JSON mode already uses stdin for the request envelope."
                ),
            )
        return _PayloadText(text=sys.stdin.read())

    if request.file is not None:
        try:
            return _PayloadText(text=Path(request.file).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return _PayloadFailure(
                error_type="payload_file_missing",
                message=f"Payload file not found: {request.file}",
            )
        except OSError as exc:
            return _PayloadFailure(
                error_type="payload_file_unreadable",
                message=f"Failed to read payload file {request.file}: {exc}",
            )

    assert request.json_literal is not None
    return _PayloadText(text=request.json_literal)


@clinkr_operation(
    name="record-entry",
    help=(
        "Upsert a state entry in the master-branch state.json for a memjective slug. "
        "Reads the entry payload from --file/-f, --json/-j, or '-' (stdin)."
    ),
    human_renderer=render_exec_record_entry,
)
def run_exec_record_entry(
    ctx: click.Context,
    request: ExecRecordEntryRequest,
) -> ClinkrExit[ExecRecordEntryResult]:
    mctx = load_typed_context(ctx, MemjectiveCliContext)

    source = _resolve_payload_source(request, machine_mode=is_machine_mode(ctx))
    if isinstance(source, _PayloadFailure):
        return ClinkrExit.failure(
            error_type=source.error_type,
            message=source.message,
        )

    try:
        payload = json.loads(source.text)
    except json.JSONDecodeError as exc:
        return ClinkrExit.failure(
            error_type="payload_invalid_json",
            message=f"Entry payload is not valid JSON: {exc.msg}",
        )

    validation = validate_entry_payload(payload)
    if isinstance(validation, EntryInvalid):
        return ClinkrExit.failure(
            error_type=validation.error_type,
            message=validation.reason,
        )

    state = load_state(slug=request.slug, brmem_gateway=mctx.brmem_gateway)
    match state:
        case StateAbsent():
            return ClinkrExit.failure(
                error_type="state_uninitialized",
                message=(
                    f"State for {request.slug!r} is uninitialized; "
                    f"run `memjective exec init {request.slug}` first."
                ),
            )
        case StateInvalid(reason=reason):
            return ClinkrExit.failure(
                error_type="state_invalid",
                message=f"Existing state for {request.slug!r} is invalid: {reason}",
            )
        case MemjectiveState():
            pass

    if validation.raw.get("resolution") in INCORPORATION_RESOLUTIONS:
        bundle = compute_evidence(
            slug=request.slug,
            brmem_gateway=mctx.brmem_gateway,
            git_gateway=mctx.git_gateway,
            pr_gateway=mctx.pr_gateway,
        )
        cross_check = _validate_incorporation_against_evidence(
            validation,
            bundle=bundle,
            state=state,
            force=request.force,
        )
        if cross_check is not None:
            return ClinkrExit.failure(
                error_type=cross_check.error_type,
                message=cross_check.message,
            )

    upsert = apply_upsert(state, validation, force=request.force)
    if isinstance(upsert, UpsertReject):
        return ClinkrExit.failure(
            error_type=upsert.error_type,
            message=upsert.message,
        )

    new_state = MemjectiveState(
        version=state.version,
        slug=state.slug,
        root=state.root,
        entries=upsert.entries,
    )
    content = _serialize_state(new_state)

    try:
        commit_sha = mctx.brmem_gateway.put(
            STATE_NAMESPACE,
            state_key(request.slug),
            STATE_BRANCH,
            content,
        )
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or str(exc)).strip()
        return ClinkrExit.failure(
            error_type="git_failure",
            message=f"Failed to write state.json: {details}",
        )

    return ClinkrExit.ok(
        ExecRecordEntryResult(
            slug=request.slug,
            entry_id=validation.id,
            action=upsert.action,
            commit_sha=commit_sha,
        ),
    )

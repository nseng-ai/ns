#!/usr/bin/env python3
"""Assemble and validate cutover-plan.json for the ji→ns core cutover.

Re-instantiated from .ji/objectives/ji-core-cutover/cutover/assemble-plan.py
(the sdl→ji pipeline). Instance changes: post_mv() maps .ji/→.ns/,
.pi/extensions/ji.ts→ns.ts, skills/ji-flow-*→skills/ns-flow-* and has NO toml
mapping (ji.toml is a phase-two surface); SKIP_REASONS gains "phase-two-surface";
baselines carry four survivor counts protecting phase two's input.

Consumes, from the directory this script lives in:
  anchors.json                    fixed changeset membership + simple hints + mv-only
  brief.md                        the shared engine brief
  invariants.json                 the verify-stage invariant catalog
  lists/candidates.txt            frozen generator output (rerun generate-candidates.sh to refresh)
  lists/auto-{skills,docs,dottree,tests}.txt   path-rule buckets from prepass.sh
  lists/baseline-*.txt            survivor baselines
  classification-decisions.json   frozen classifier output (rerun classify-workflow.js to refresh)

Emits cutover-plan.json next to itself and hard-fails on any validation error:
totality (every candidate lands in exactly one bucket), pairwise disjointness of the
engine work-list, anchor coverage, and skip-audit. Run: uv run --no-project python assemble-plan.py
"""

import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
LISTS = HERE / "lists"

COHORT_SIZE = 10
SKIP_REASONS = {
    "only-atji-imports", "only-identifier", "only-src-ji-path-segment",
    "only-package-or-skill-or-slug-name", "post-window-branding", "false-positive-match",
    "historical-record", "phase-two-surface",
}

SKILL_DIR_MVS = {
    "skills/ji-flow-autobranch": "skills/ns-flow-autobranch",
    "skills/ji-flow-branch-latest-commit": "skills/ns-flow-branch-latest-commit",
    "skills/ji-flow-cp": "skills/ns-flow-cp",
    "skills/ji-flow-submit": "skills/ns-flow-submit",
}


def post_mv(path: str) -> str:
    # NO ji.toml mapping this window — the toml move is phase two (PR-5).
    if path == ".pi/extensions/ji.ts":
        return ".pi/extensions/ns.ts"
    if path.startswith(".ji/"):
        return ".ns/" + path[len(".ji/"):]
    for old, new in SKILL_DIR_MVS.items():
        if path == old or path.startswith(old + "/"):
            return new + path[len(old):]
    return path


def read_list(name: str) -> list[str]:
    p = LISTS / name
    if not p.exists():
        return []
    return [l.strip() for l in p.read_text().splitlines() if l.strip()]


def chunk_of(path: str) -> str:
    """Assign every work-list entry to exactly one sequential engine invocation."""
    if "/test/" in path or "/tests/" in path or path.endswith(".test.ts"):
        return "2-tests"
    if path.startswith("ts/packages/") and "/src/" in path and path.endswith(".md"):
        # Production-embedded prompt/instruction md is consumed by production code
        # and asserted by tests: it must rename BEFORE the tests chunk (sdl→ji
        # dry-run-1 desync lesson).
        return "1-production"
    if path.startswith(("skills/", "docs/", ".ns/", ".ji/")) and path.endswith(".md"):
        return "3-skills-docs"
    if path.endswith((".md", "TESTING.md")) and not path.startswith("ts/packages"):
        return "3-skills-docs"
    if path.endswith((".md",)):
        return "3-skills-docs"
    return "1-production"


def main() -> int:
    anchors = json.loads((HERE / "anchors.json").read_text())
    brief = (HERE / "brief.md").read_text()
    invariants = json.loads((HERE / "invariants.json").read_text())
    decisions = json.loads((HERE / "classification-decisions.json").read_text())["decisions"]

    candidates = set(read_list("candidates.txt"))
    auto = {c: read_list(f"auto-{c}.txt") for c in ("skills", "docs", "dottree", "tests")}
    errors: list[str] = []

    # ── Buckets ──────────────────────────────────────────────────────────────
    changeset_files: dict[str, str] = {}
    for cs_id, cs in anchors["changesets"].items():
        for f in cs["files"]:
            if f in changeset_files:
                errors.append(f"changeset collision: {f} in {changeset_files[f]} and {cs_id}")
            changeset_files[f] = cs_id

    simple_anchor_files = set(anchors["simpleAnchors"].keys())
    mv_only = {
        k for k in anchors.get("mvOnly", {})
        if k not in (".ji", "comment") and not k.startswith("skills/ji-flow-")
    }
    classified_simple = {d["path"]: d for d in decisions if d["decision"] == "simple"}
    classified_skip = {d["path"]: d for d in decisions if d["decision"] == "skip"}

    # A classification decision may be superseded by a later changeset promotion
    # (suspectedNewCoupling review): changeset membership wins, with a printed note.
    for f in list(classified_simple):
        if f in changeset_files:
            print(f"NOTE classification for {f} superseded by changeset {changeset_files[f]}")
            del classified_simple[f]
    for f in list(classified_skip):
        if f in changeset_files:
            errors.append(f"changeset member was classified SKIP (contradiction): {f}")

    # auto lists may overlap each other; first class wins for cohort assignment
    auto_assigned: dict[str, str] = {}
    for cls in ("skills", "docs", "dottree", "tests"):
        for f in auto[cls]:
            auto_assigned.setdefault(f, cls)

    # ── Validation: totality and single ownership ────────────────────────────
    ownership: Counter = Counter()
    owners: dict[str, list[str]] = {}
    for name, bucket in (
        ("changeset", changeset_files.keys()),
        ("simple-anchor", simple_anchor_files),
        ("auto", auto_assigned.keys()),
        ("classified", set(classified_simple) | set(classified_skip)),
        ("mv-only", mv_only),
    ):
        for f in bucket:
            ownership[f] += 1
            owners.setdefault(f, []).append(name)

    for f in sorted(candidates - set(ownership)):
        errors.append(f"unclassified candidate: {f}")
    for f, n in sorted(ownership.items()):
        if n > 1:
            errors.append(f"multiple buckets own {f}: {owners[f]}")
        if f not in candidates:
            errors.append(f"bucketed file is not a candidate (stale list?): {f}")

    # ── Validation: skip audit ───────────────────────────────────────────────
    for d in decisions:
        if d["decision"] == "skip" and d.get("reason") not in SKIP_REASONS:
            errors.append(f"bad skip reason for {d['path']}: {d.get('reason')}")
        if d["decision"] == "simple" and not d.get("hint"):
            errors.append(f"classified simple without hint: {d['path']}")
        if d.get("suspectedNewCoupling"):
            print(f"REVIEW suspectedNewCoupling: {d['path']}: {d['suspectedNewCoupling']}")

    # ── Build engine entries (post-mv paths) ─────────────────────────────────
    complex_entries = []
    for cs_id, cs in anchors["changesets"].items():
        complex_entries.append({
            "id": cs_id,
            "files": [post_mv(f) for f in cs["files"]],
            "instructions": cs["why"] + ("\n\n" + cs["notes"] if cs.get("notes") else ""),
            **({"model": cs["model"]} if cs.get("model") else {}),
        })
    for cls, files in auto.items():
        uniq = [f for f in files if auto_assigned.get(f) == cls]
        rule_map = {
            "skills": anchors["pathRules"].get("skills/**/*.md", ""),
            "docs": anchors["pathRules"].get("docs/**", "") or "operative docs: rename per the brief",
            "dottree": anchors["pathRules"].get(".ji/extensions/**, .ji/reviews/**, .ji/prompts/**, .ji/pi/**", ""),
            "tests": anchors["pathRules"].get("ts/**/test/**", "") or "test files: rename inline literals per the brief; assertions must match their production siblings",
        }
        for i in range(0, len(uniq), COHORT_SIZE):
            batch = uniq[i:i + COHORT_SIZE]
            complex_entries.append({
                "id": f"cohort-{cls}-{i // COHORT_SIZE + 1}",
                "files": [post_mv(f) for f in batch],
                "instructions": f"Homogeneous cohort — apply the shared brief to each listed file independently. Class guidance: {rule_map[cls]}",
            })

    simple_entries = []
    for f in sorted(simple_anchor_files):
        simple_entries.append({"path": post_mv(f), "hint": anchors["simpleAnchors"][f]})
    for f, d in sorted(classified_simple.items()):
        simple_entries.append({"path": post_mv(f), "hint": d.get("hint", "")})

    # ── Validation: engine work-list pairwise disjointness ───────────────────
    seen: dict[str, str] = {}
    for e in simple_entries:
        if e["path"] in seen:
            errors.append(f"work-list collision: {e['path']} (simple vs {seen[e['path']]})")
        seen[e["path"]] = "simple"
    for ce in complex_entries:
        for f in ce["files"]:
            if f in seen:
                errors.append(f"work-list collision: {f} ({ce['id']} vs {seen[f]})")
            seen[f] = ce["id"]

    if errors:
        print(f"\n{len(errors)} validation error(s):")
        for e in errors:
            print(f"  ERROR {e}")
        return 1

    # ── Chunks ───────────────────────────────────────────────────────────────
    chunks: dict[str, dict] = {
        "1-production": {"simple": [], "complex": []},
        "2-tests": {"simple": [], "complex": []},
        "3-skills-docs": {"simple": [], "complex": []},
    }
    for e in simple_entries:
        chunks[chunk_of(e["path"])]["simple"].append(e)
    for ce in complex_entries:
        if ce["id"].startswith("cs"):
            chunks["1-production"]["complex"].append(ce)
        elif ce["id"].startswith("cohort-tests"):
            chunks["2-tests"]["complex"].append(ce)
        elif ce["id"].startswith(("cohort-skills", "cohort-docs", "cohort-dottree")):
            chunks["3-skills-docs"]["complex"].append(ce)
        else:
            chunks[chunk_of(ce["files"][0])]["complex"].append(ce)

    plan = {
        "comment": "Locked args content for refactor-swarm-workflow, chunked into sequential invocations. All paths are POST-MV (.ns/…, .pi/extensions/ns.ts, skills/ns-flow-*; ji.toml does NOT move this window). Invoke each chunk as Workflow({name:'refactor-swarm-workflow', args:{brief, simple, complex, invariants, repoRoot, model:'sonnet', complexModel:'sonnet'}}) — invariants ONLY on the final chunk (empty engine runs skip invariants).",
        "brief": brief,
        "model": "sonnet",
        "complexModel": "sonnet",
        "chunks": [{"name": k, **v} for k, v in chunks.items()],
        "invariants": invariants,
        "baselines": {
            "atJiFileCount": int((LISTS / "baseline-atji-filecount.txt").read_text().strip()),
            "srcJiOccurrences": int((LISTS / "baseline-srcji-occurrences.txt").read_text().strip()),
            "jiTomlFileCount": int((LISTS / "baseline-jitoml-filecount.txt").read_text().strip()),
            "manifestKeyFileCount": int((LISTS / "baseline-manifestkey-filecount.txt").read_text().strip()),
        },
        "skips": [
            {"path": f, "reason": d.get("reason", ""), **({"note": d["hint"]} if d.get("hint") else {})}
            for f, d in sorted(classified_skip.items())
        ],
        "mvOnly": anchors.get("mvOnly", {}),
    }
    out = HERE / "cutover-plan.json"
    out.write_text(json.dumps(plan, indent=1) + "\n")

    n_simple = len(simple_entries)
    n_cs = sum(1 for c in complex_entries if c["id"].startswith("cs"))
    n_cohort = len(complex_entries) - n_cs
    n_p2 = sum(1 for s in plan["skips"] if s["reason"] == "phase-two-surface")
    print(f"OK cutover-plan.json: {n_simple} simple, {n_cs} changesets, {n_cohort} cohorts, "
          f"{len(plan['skips'])} skips ({n_p2} phase-two-surface — audit these against PR-5 targets), "
          f"{len(invariants)} invariants, "
          f"chunks: " + ", ".join(f"{c['name']}={len(c['simple'])}s/{len(c['complex'])}c" for c in plan["chunks"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())

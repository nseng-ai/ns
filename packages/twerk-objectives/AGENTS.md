# twerk-objectives

`twerk-objectives` provides branch-scoped planning documents built on top of the `brmem` package's storage. An objective is a directory of files (`body.md` plus optional `roadmap.md` / `notes.md`) tracked across branches via git refs under `refs/brmem/ns/objectives/...`. The package owns the schema, slug rules, canonical-record semantics, and the `objective` CLI surface that drives the `objective-*` skill family.

This package is a `twerk` plugin discovered via the `twerk.plugins` entry-point and also installs a standalone `objective` CLI binary. `brmem` is its own package; the namespace string (`OBJECTIVE_NAMESPACE`), filename constants, and slug rules live here so `brmem` stays generic.

## Rules

- **Allowed `twerk-core` imports**: `twerk_core.clinkr`, `twerk_core.git`, `twerk_core.gh`, plus the shared utilities `twerk_core.console` (rich tables / consoles for CLI output) and `twerk_core.plugin` (`TwerkPluginSpec` for the plugin entry point). New imports from `twerk_core.format` / `twerk_core.click_utils` / etc. should be justified.
- **`brmem` is a hard runtime dependency** declared in `pyproject.toml`. Import storage primitives from `brmem.*` (e.g. `brmem.gateway`, `brmem.fake`); never reach into `twerk_core.brmem` (that path no longer exists).
- **`brmem` must never import from `twerk_objectives`**. If `brmem` ever needs an objective-specific concept, that concept belongs here, not there.
- **No default Graphite dependency**. Objective commands are generic objective workflows, not Graphite workflows. Do not import `twerk_core.gt`, add `GtGateway` to objective contexts, or call `gt` for trunk, ancestor, or stack discovery. Use `twerk_core.git` for ordinary repository facts. Any future Graphite-specific objective behavior must live behind an explicit Graphite-named command or command group; existing Graphite references are migration debt, not precedent.
- **Self-contained tests**. Tests for `twerk_objectives` must not depend on `twerk_core` subpackages outside the allowed import set above.
- **Third-party deps**: only what is reachable from the `clinkr` / `git` / `gh` layer of `twerk-core` and from `brmem`. New third-party deps go in this package's `pyproject.toml`, not in `twerk-core` or `brmem`.

## Authority Boundaries

The objective subsystem spans three layers; place new rules at the lowest layer that owns them.

- **`twerk_objectives` (this package)** owns the deterministic objective mechanics it currently implements: namespace and slug rules (`OBJECTIVE_NAMESPACE`, slug-grouping, `body.md` / `roadmap.md` / `notes.md` / `.absorbed.jsonl` constants in `discovery.py`), patch-id-based branch snapshot freshness (`freshness.py`), the `objective list` / `show` / `tree` surface, and the hidden `objective exec` helpers (`current`, `digest`, `update-precheck`, `absorb-patches`). When a rule is testable, deterministic, and would otherwise live as drift-prone skill prose, push it down here. New rules of this shape belong in this package, not in `skills/objective/SKILL.md`.
- **`skills/objective/SKILL.md`** is conceptual behavior reference and shared grounding for the operation skills, not independent implementation authority. It documents vocabulary, the canonical-vs-branch model, lifecycle, and the mutation contract; when its prose disagrees with this package, this package wins. The mutation table in that skill is a summary view of `skills/objective/references/mutation-contract.md`.
- **`skills/objective/references/mutation-contract.md`** is mutation policy — which operation may write where, conservative rewrite rules for `body.md` / `roadmap.md` / `notes.md`, and how `update` differs from `reconcile`. It is not low-level mechanics: ref encoding, branch-name validation, key validation, and snapshot-ref shape are owned by `brmem`, not by this contract.

Storage primitives live one layer further down. `brmem` (`packages/brmem`) owns ref encoding (`refs/brmem/ns/<namespace>/<encoded-branch>:<key>`), the `/` -> `---` branch encoding, branch-name validation (rejecting names that contain `---`), namespace and key validation, and the snapshot-shaped storage model. Objective skills must not duplicate or contradict those rules — for example, manual `---` decoding in skill prose is migration debt, not a contract.

### Canonical Storage Branch

Canonical objective storage is permanently the literal branch name `master`, exposed as `MASTER_BRANCH` in `discovery.py`. The brmem ref shape (`refs/brmem/ns/objectives/<encoded-branch>`) makes the storage branch part of the schema rather than a configurable trunk, and migrating canonical state to a different branch would require coordinated rewrites of every existing canonical objective. `MASTER_BRANCH` is not a placeholder for repo trunk; do not parametrize it on `git_gateway.get_trunk_branch()`. Trunk resolution is still used for branch-snapshot freshness (`trunk..HEAD` patch-id ranges), but canonical reads and writes always target `master`.

### `objective exec digest` Boundary

`objective exec digest` emits deterministic facts (metadata table, merged-PR list, branch snapshot count, latest-snapshot pick), raw Markdown blocks (master `body.md`, master `roadmap.md`, per-snapshot `notes.md` blocks), and a literal output template. The final digest prose is **agent-authored** — the skill (`skills/objective-digest/SKILL.md`) fills the Thesis, Remaining work, and Key findings sections from the embedded raw Markdown. Tests for this command must assert the prompt/template contract (presence of metadata rows, raw-Markdown blocks, template scaffolding), not final digest prose wording. Pretending the digest is fully deterministic would require Markdown summarization in Python, which the project explicitly defers — see "Markdown prose is not schema" in the canonicalization plan.

### `objective show` Mixed-Source Fallback

Without `--branch`, `objective show <slug>` resolves each file independently: prefer the current branch's snapshot, fall back to canonical `master`. `body.md`, `roadmap.md`, and `notes.md` may therefore come from different sources in the same render — for example, a stale branch snapshot may carry an updated `notes.md` while `body.md` and `roadmap.md` come from canonical. This is intentional ("effective view" over the current branch's stack) but it is not a coherent snapshot from any single source. The human renderer labels each file with its source so the mixed view is unambiguous: canonical files render as `<filename> (canonical: master)` and branch snapshots render as `<filename> (branch: <name>)`. The JSON envelope carries the same fact via the `source_branch` field on each file. Callers that need a single-source view must pass `--branch <name>` (branch-strict, no canonical fallback).

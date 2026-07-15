---
name: ns-release
disable-model-invocation: true
description: "Runbook for publishing the coordinated public npm package set from this repo via the transactional release. Invoke when cutting a release, bumping the public package version, driving `just release` / `just release-plan`, or recovering a release that refused or was interrupted."
references:
  - references/refusals
metadata:
  internal: true
---

# ns-release

Operate the transactional public npm release. One command does the whole
release; this skill's job is to pick the right version, confirm it with the
user, drive the command, and read its refusals correctly.

Implementation lives in `ts/packages/internal/ns-dev/src/release/`. Do not
reimplement any stage by hand — the transaction's safety properties come from
running it end to end.

## Hard rules

- **Never pick the version silently.** Propose it, confirm with the user, then
  release. See step 1.
- **Never hand-edit `ts/dist/releases/<version>/report.json`** or the candidate
  `.tgz` files. The report is the transaction journal; editing it destroys the
  recovery guarantees and the next run will refuse.
- **Never improvise pre-checkpoint cleanup.** `just release-reset <version>` is
  the only supported path for restoring release-generated tracked changes and
  deleting that version's ignored release directory. Never run a broad cleanup
  of `ts/dist/`.
- **Never use `just publish` / `just publish-dry-run` / `just bump-version`.**
  Those are the legacy direct publisher; `just release` performs the bump and
  qualification itself. Use them only if the user explicitly asks to bypass the
  transaction.
- **A published version is burned.** If npm already has a version with bytes
  that differ from the frozen candidate, that version can never be released
  from this repo again. Pick a new one; never force or unpublish.
- **Publishing requires explicit authorization.** In a real TTY, use the default-no
  y/n prompt. For intentional non-interactive operation, pass `--yes`; otherwise the
  command fails before any release effects.

## Step 1 — Choose and confirm the version

The public packages share one coordinated version. Derive the current state
rather than assuming it:

```bash
rg -o '"version": "[^"]+"' ts/packages/hosts/ns/package.json   # what the workspace declares
npm view @nseng-ai/ns version                                   # what npm actually has
```

Then read `CHANGELOG.md`'s `[Unreleased]` section to see what is shipping. If it
is empty or stale, offer to run the `changelog-update` skill first.

Propose the next version to the user and **wait for confirmation before
releasing**. The default is always the next patch version; do not infer a minor
bump from the changelog. Propose a different version only when the user directs
you to. Summarize what `[Unreleased]` contains, then say, for example: "Current
is 0.1.3; the default patch bump is **0.1.4**. `[Unreleased]` contains internal
fixes. Confirm or give me a different version."

Do not proceed to step 3 without an explicit version from the user. This is the
one irreversible decision in the workflow.

## Step 2 — Plan (read-only)

```bash
just release-plan <VERSION>
```

This runs the preflight and prints the release branch, the nine stages, and the
package inventory. It writes nothing. It refuses unless:

- the worktree is clean;
- you are **not** on Graphite trunk, and the current branch **is** Graphite-tracked;
- the release branch `transactional-npm-release/v<VERSION>` does not exist;
- `<VERSION>` is a concrete semver (no ranges);
- the canonical source manifests match the intended public package inventory.

Fix any refusal here before releasing — a refusal at plan time costs nothing, a
refusal mid-transaction leaves state to reason about.

## Step 3 — Release

```bash
just release <VERSION>
```

Stages: preflight → bump-coordinated-version → qualify-public-package-set →
freeze-candidates → graphite-checkpoint → classify-registry → confirm-publish →
publish-tarballs → verify-registry.

Two properties worth understanding, because they explain every refusal:

- **Candidates are frozen before anything is published.** Each package is
  `npm pack`ed into `ts/dist/releases/<VERSION>/` and its integrity and shasum
  recorded. Those exact tarballs are what gets published and what verification
  compares against.
- **Every step is journaled** to `ts/dist/releases/<VERSION>/report.json`, and
  each npm write is bracketed by a `pendingWrite` marker, so an interrupted
  publish is recoverable rather than ambiguous.

At confirm-publish it asks a default-no y/n question:

```text
Publish frozen package tarballs at <VERSION> to npm? [y/N]:
```

Answer `y`/`yes` to publish or `n`/`no` (including the default) to decline with
no registry writes. The prompt only appears when there is actually something to
publish. An explicitly authorized non-interactive invocation can use
`just release <VERSION> --yes`.

The command reports each major stage, candidate pack, registry classification,
package publish, and verification attempt to stderr while preserving stdout for
the result envelope. Nested qualification diagnostics are streamed as they run.

Verification then reads each package back from npm and compares hashes against
the frozen candidates, retrying across a delay ladder to absorb registry
propagation lag. `finalStatus: "verified"` means done.

## Step 4 — After a verified release

The release left a Graphite checkpoint on `transactional-npm-release/v<VERSION>`
containing the version bump and any lockfile update. Land it like any other
branch — load the `graphite` skill and submit it. Then update `CHANGELOG.md` to
move `[Unreleased]` under the released version.

## Recovering a refused or interrupted release

First establish whether the transaction is provably before or after the
Graphite checkpoint. A deterministic release branch, a `checkpointing` or later
stage, release-branch identity in a `candidates-prepared` report, or any pending /
completed npm write means **do not reset**.

For a pre-checkpoint bump, qualification, or candidate-preparation failure, use
the typed reset workflow:

```bash
just release-reset <VERSION> --dry-run
just release-reset <VERSION>          # TTY: inspect, then default-no confirm
# or explicitly authorized non-interactive apply:
just release-reset <VERSION> --yes
```

Review every restore path and the exact release directory before authorizing.
Reset accepts a stale recorded commit only on the same source branch, only when
Git proves it is an ancestor of `HEAD`, and only when all local effects are
strictly release-owned. It refuses checkpointed or publishing state, a release
branch, unexpected tracked/untracked work, semantic or byte-representation
manifest edits beyond the version replacement, report/candidate inconsistency,
npm-write evidence, or changed state after confirmation. After reset succeeds, run `just release-plan <VERSION>` before
starting the release again.

For checkpointed or later state, **rerun the same command with the same version:**
`just release <VERSION>`. If a report exists it resumes automatically, skipping
packages already published with exactly matching hashes.

Resume validates hard, and refuses if the world moved. You must be:

- **on the release branch, at the checkpoint commit** (otherwise `wrong-branch` /
  `wrong-commit`);
- with a **clean worktree**;
- with manifests **still at the report's version** (otherwise `wrong-version`);
- with the **frozen candidate tarballs still on disk and unmodified** (otherwise
  `candidate-missing` / `candidate-hash-mismatch`).

For checkpointed/publishing state: do not clean `ts/dist/`, do not rebase, and do
not switch branches between a failed release and its resume. The typed reset
command owns the only pre-checkpoint exception and will refuse this state.

For what a specific refusal code means and what to do about it, read
`references/refusals.md`. Report the code and its remediation to the user rather
than improvising — several codes mean *stop and escalate*, not *retry*.

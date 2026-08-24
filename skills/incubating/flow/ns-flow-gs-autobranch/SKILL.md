---
name: ns-flow-gs-autobranch
disable-model-invocation: true
description: "Experimentally move dirty work onto a github/gh-stack child through the explicit `/ns:flow:gs:autobranch` Skill-Backed Command."
allowed-tools:
  - "Bash(git status --porcelain=v1*)"
  - "Bash(git symbolic-ref --quiet --short HEAD)"
  - "Bash(git symbolic-ref --quiet --short refs/remotes/origin/HEAD)"
  - "Bash(git rev-parse --verify*)"
  - "Bash(git show-ref --verify --quiet*)"
  - "Bash(git check-ref-format --branch*)"
  - "Bash(git switch -c*)"
  - "Bash(gh stack --version)"
  - "Bash(gh stack view --json)"
  - "Bash(gh stack add*)"
  - "Bash(gh stack init*)"
  - "Bash(ns flow cp*)"
---

# ns-flow-gs-autobranch

Experimental dirty-work autobranch for the official `github/gh-stack` provider (`gs`). Invocation explicitly selects GS and authorizes the scoped local mutations below. This workflow can create a branch and commit and can change gh-stack metadata. It does **not** delegate to an `ns flow gs` CLI.

## Scope and hard boundaries

Support exactly two paths:

1. dirty Git trunk → ordinary child → durable checkpoint → initialize that child as the first gh-stack branch;
2. dirty non-trunk already tracked as the current stack top → native `gh stack add` child → durable checkpoint.

Never extract the latest commit, initialize an existing non-trunk branch, access `.git/gh-stack`, fetch, push, submit, retry, roll back, delete a branch, or run `gh stack unstack`. Do not describe this prompt-driven workflow as atomic or transactional. Refuse before mutation unless every applicable preflight check passes.

## Common preflight

1. Run `gh stack --version`; require exit status zero and output that reports version `0.1.0`. Refuse before any mutation on command failure, a missing version, version drift, or help output.
2. Run bounded probes and retain their exact facts:
   - `git symbolic-ref --quiet --short HEAD` for the attached current branch; refuse detached HEAD.
   - `git rev-parse --verify HEAD` for the source SHA.
   - `git status --porcelain=v1 --untracked-files=all` for staged, unstaged, and untracked work; refuse empty output.
   - `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`; refuse if missing, then remove the `origin/` prefix from its short output to obtain cached Git trunk.
3. Accept an explicit child slug from the initial request or derive one semantic, conservative slug from the pending change. Validate it with `git check-ref-format --branch <child>`. Refuse invalid names.
4. Require `git show-ref --verify --quiet refs/heads/<child>` to report absence. Refuse an existing child ref.
5. Classify only by current branch versus cached trunk. Invocation is the provider selection; never infer provider choice from metadata.
6. Before the first mutation, show the user: path, source/trunk SHA, concise dirty-status summary, child name, intended commands, and the forward-only failure boundary.

A clean invocation is refused. If the user selected Graphite, direct them to `/ns:flow:gt:branch-latest-commit`; do not offer or simulate GS latest-commit extraction.

## Path A: dirty trunk bootstrap

1. Record trunk SHA and porcelain status. Run `git switch -c <child>`.
2. Re-probe current branch, `refs/heads/<trunk>`, `refs/heads/<child>`, and porcelain status. Continue only when the child is current, trunk and child both equal the recorded source SHA, and dirty work remains observable. Otherwise inspect and stop without cleanup.
3. Run `ns flow cp`. Verify the child advanced, trunk did not, and porcelain status is empty. If checkpointing fails, preserve and report the dirty child.
4. Only after that durable clean checkpoint, run `gh stack init <child>`.
5. Run `gh stack view --json`. Require valid JSON with expected `trunk`, `currentBranch === <child>`, and exactly one matching current child in `branches`. If init fails or the view is malformed/inconsistent, preserve the committed child and stop. Do not move work back or delete anything.

## Path B: dirty tracked-top extension

1. Before mutation run `gh stack view --json`. Require valid JSON with `trunk`, `currentBranch`, and ordered `branches` records containing `name`, `base`, and `isCurrent`.
2. Require the current Git branch to occur exactly once, be marked current, equal provider `currentBranch`, and be the last/topmost branch. Refuse an untracked non-trunk or tracked non-top branch; report the observed top. Never initialize either state.
3. Record source SHA and porcelain status, then run exactly `gh stack add <child>` without `-A`, `-u`, or `-m`.
4. Regardless of exit status, re-probe current branch, source ref SHA, child ref SHA, porcelain status, and `gh stack view --json`. Continue only if observations prove: source unchanged; child exists at the recorded source SHA; child is current; source and child are adjacent in the ordered provider branch list with the child directly above source and topmost; dirty work remains observable on the child.
5. If the command rejected the work or any fact is absent or ambiguous, stop. Do not retry, initialize, delete, unstack, edit metadata, or improvise rollback.
6. On verified attachment run `ns flow cp`. Verify child advanced, source did not, and porcelain status is empty. If checkpointing fails, preserve and report the attached dirty child.

## Invocation report and lesson feedback

After **every** outcome, proactively give one terminal report with exactly these eight labeled fields:

1. **Outcome:** `refused`, `completed`, `partial failure`, or `ambiguous failure`.
2. **Path:** `trunk bootstrap` or `tracked-top extension`.
3. **Mutations performed:** only observed branches, commits, and provider operations.
4. **Preserved state:** source/trunk SHA, child SHA/current branch, dirty/clean state, and recovery location.
5. **Error/observation:** failing step and bounded relevant evidence; do not dump logs.
6. **Recovery guidance:** safest next inspection/action; separate verified facts from hypotheses.
7. **Potential improvements:** concrete skill or future implementation improvements, including friction on success.
8. **Lesson disposition:** `new-generalizable`, `already-covered`, or `environment-specific`, with one reason.

Safety comes before lesson editing. After state is resolved and reported, turn a new evidence-backed general lesson into a compact normative change to the canonical skill when repository mutation is authorized. Sharpen checks, failure classes, recovery guidance, version caveats, or promotion requirements; do not add incident chronology, raw logs, secrets, branch-specific names, or speculation. If this effective skill is external or editing is not authorized, report a ready-to-apply proposed change and its authoritative path instead of editing silently. When an autoslot skill duplicates this procedure, reconcile shared lessons there too.

## Known operational lessons

- **Preflight:** cached trunk and child-ref absence are required facts; provider metadata never substitutes for explicit GS selection. `gh stack --version` is the verified version probe; `gh stack version` is invalid in the verified 0.1.0 surface and may show help, which is never version evidence.
- **Dirty-state transfer:** an ordinary Git branch switch carries trunk work without a stash; native dirty `gh stack add` remains empirical and requires post-command inspection even after nonzero exit.
- **Provider ambiguity:** command exit is not authoritative. Preserve observed state and stop when Git and `gh stack view --json` do not jointly prove postconditions.
- **Checkpointing:** checkpoint only after the work is observed on the child; initialize a trunk child only after its commit is durable.
- **Recovery:** forward-only preservation is safer than guessed repair because gh-stack offers no safe remove-one-layer rollback and owns private metadata.

## Prototype status and promotion

This skill is a temporary executable specification and evidence collector for provider-specific imperative Flow TypeScript. Happy paths are insufficient. Promotion requires evidence across staged, unstaged, untracked, and mixed dirtiness for both paths; stable typed eligibility/refusal and absent-versus-ambiguous mutation outcomes; bounded recovery data; fake-driven tests for every retained lesson; CLI danger-tier and machine-result review; and migration of command ownership without duplicate surfaces. Future GS orchestration may compose proven Git/provider mechanisms but must not create a universal GT/GS transaction or change GT behavior. Retain a thin skill only for guidance that still adds value after deterministic mutation moves into Flow.

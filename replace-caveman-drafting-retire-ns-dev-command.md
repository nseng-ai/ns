# Plan: Replace Caveman drafting with Simplified Technical English and retire `ns-dev caveman`

## Goal and user-visible outcome

Replace the Caveman-style compression pass in the public `pr-make-accountable` skill with the clearer approach represented by the vendored `wait-what` skill: professional ASD-STE100-inspired Simplified Technical English plus the target repository’s established vocabulary. The resulting PR descriptions must remain concise without dropping articles, using fragments, or sounding like a caricature.

Also fully retire the internal `ns-dev caveman` CLI command. It must disappear from command registration, help, implementation, tests, and command-specific dependencies. This is deletion, not a rename or compatibility alias.

Success means:

- `pr-make-accountable` performs one self-contained controlled-English editing pass and remains installable/usable with only Git and authenticated `gh`.
- The public skill does not require the separately installed vendored `wait-what` skill, ns, or a repository `CONTEXT.md`.
- `skills/public/prs/pr-make-accountable/caveman.md` no longer exists.
- `ns-dev caveman` is no longer advertised or executable as a known command.
- The `@internal/ns-dev` package no longer carries dependencies used only by Caveman.

## Provenance and drift anchors

Planning snapshot for human forensics: branch `master`, repository commit `4b647be0796f598035869a068f5b435bb41960c2`, 2026-08-06. This SHA is not implementation authority; compare these excerpts to live files before editing:

```text
skills/public/prs/pr-make-accountable/SKILL.md:
Read [`caveman.md`](caveman.md) and apply its **lite** rules once to the draft.
Retain professional full sentences, articles, exact technical terms, paths, and code.

ts/packages/internal/dev/ns-dev/src/cli.ts:
name: "caveman",
description: "Compress text or rewrite a file in place into caveman style."

.agents/skills/wait-what/SKILL.md:
Re-pitch that: give me a little bit of context, talk in ASD-STE100 Simplified Technical English,
and use the ubiquitous language from `CONTEXT.md`.
```

The vendored `wait-what` source is pinned by `docs/agents/matt-pocock-skills.md` to upstream `mattpocock/skills` commit `8b36d4fb2635b3c21998dcd8144439c9e5ba7302`. Preserve that single-source pin; do not duplicate or change it in the public skill.

## Non-negotiable decisions and constraints

- Edit the canonical first-party skill at `skills/public/prs/pr-make-accountable/`, not its `.agents` or `.claude` symlink overlays.
- Keep the skill standalone and public. Do not add an operational dependency on vendored `wait-what`, `CONTEXT.md`, ns, a harness feature, or any package beyond its existing Git/`gh` contract.
- Use ASD-STE100 as inspiration, not as a claim of formal certification or complete standard compliance. The vendored skill names the standard but does not provide a complete rule set.
- The editing pass must preserve substantive rationale, exact technical terms, code, paths, CLI commands, quoted errors, Markdown/template structure, and grammatical professional prose.
- Delete the CLI outright. Do not retain a deprecated stub, alias, migration warning, model operation, or historical test fixture.
- Do not update an ADR, Objective, or `CONTEXT.md`: this changes writing guidance and removes an internal utility; it does not establish new product-domain vocabulary.
- Do not commit on `master`. The implementation session must use its attached branch context or create an appropriate feature branch according to the repo’s current workflow; the provenance branch above is not a required implementation branch name.

## Scope boundary

### In scope

- `skills/public/prs/pr-make-accountable/SKILL.md`
- deletion of `skills/public/prs/pr-make-accountable/caveman.md`
- `docs/agents/matt-pocock-skills.md` provenance/registry bookkeeping
- the `pr-make-accountable` entry in `skills-lock.json`, if supported targeted regeneration changes its local hash
- `@internal/ns-dev` CLI composition root and CLI-shape scenario coverage
- deletion of the Caveman implementation and dedicated scenario test
- `@internal/ns-dev/package.json` and its importer in `ts/pnpm-lock.yaml` when command deletion makes a dependency unused

The semantic scope governs even if this is roughly 9–10 changed/deleted files; do not optimize for a guessed file count.

### Out of scope

- `.agents/skills/wait-what/`, its lock entry, exposure metadata, or `.claude` overlay: it is vendored upstream content.
- Other skills that merely use words such as “concise,” “plain prose,” or “no filler”: there is no evidence they consume Caveman.
- `pr-make-accountable/README.md`, unless implementation finds a directly false behavioral claim. Its current high-level “crisp, clear” language remains accurate.
- General model-policy, spinner, filesystem, or ns-dev context refactors. Remove only code made dead by this command.
- Historical commits or documentation that merely record past command existence.

## Implementation slices

### 1. Replace the public skill’s drafting pass

Delete `caveman.md`. In Phase 3 of `SKILL.md`, replace the Caveman reference and lite-mode instruction with a self-contained pass that tells the agent to:

- use short, direct sentences and one main point or action per sentence;
- prefer active voice when naming the actor improves accountability;
- use one consistent term for each concept and avoid unnecessary synonyms;
- remove filler, pleasantries, and unsupported hedging;
- preserve full grammatical sentences and articles rather than applying Caveman compression;
- preserve all technical substance and exact technical spellings;
- keep the existing PR sections, bullets, links, footer, and proportionality rules intact.

Vocabulary discovery must be portable: if the target repository has `CONTEXT-MAP.md`, follow it to the relevant `CONTEXT.md`; otherwise use an evident root or area-specific `CONTEXT.md`. If neither exists, use terminology established by the code, diff, existing documentation, and interview. Absence of glossary files is not an error.

Credit the external inspiration without creating a public dependency. Because public skills must not point users at ns-internal process documents, place only a concise source/provenance comment naming upstream `mattpocock/skills` path `skills/productivity/wait-what/SKILL.md` in the public source. Add the reverse bookkeeping row to the “Melded surfaces registry” in `docs/agents/matt-pocock-skills.md`, identifying `pr-make-accountable/SKILL.md` as an ASD-STE100/ubiquitous-language drafting adaptation and instructing maintainers to review it when upstream `wait-what` changes. Do not put the instance-doc path or commit hash into the installed public skill. This is a deliberate reconciliation of the melding traceability rule with the stricter public-skill no-internal-reference rule.

Gate: no independent behavioral automation is warranted for prose. Inspect the complete Phase 3 flow manually and confirm the new pass cannot erase rationale, distort technical strings, require ns-only files, or produce fragmentary “Caveman” prose. Formatting and stale-reference gates follow below.

### 2. Retire the CLI command and pin its absence

Delete:

- `ts/packages/internal/dev/ns-dev/src/commands/caveman.ts`
- `ts/packages/internal/dev/ns-dev/test/scenario/caveman.test.ts`

Remove the Caveman imports and root command registration from `src/cli.ts`. In `test/scenario/cli-shape.test.ts`, add focused retirement evidence: root help must not contain `caveman`, and invoking `caveman` should produce the standard unknown-command/usage failure. Assert stable public behavior (exit class and useful unknown-command signal), not incidental full output formatting.

Re-scan `@internal/ns-dev` imports. Current evidence shows `@nseng-ai/extension-kit` is imported only by the Caveman implementation, so remove that dependency from the package manifest if the live scan agrees. Run pnpm from the `ts/` workspace to regenerate the lockfile; retain only the expected `packages/internal/dev/ns-dev` importer change. `smol-toml`, Foundation, and Clinkr remain used elsewhere and must stay.

Targeted gate:

```sh
pnpm --dir ts --filter @internal/ns-dev test
```

Expected: all ns-dev tests pass; root CLI help excludes `caveman`; the retired command is unknown.

### 3. Refresh managed metadata without overlay churn

A first-party skill content edit may change its local `computedHash`. Use the documented targeted local workflow, not `npx skills check` (which only checks remote sources):

```sh
npx skills add "./skills/public/prs/pr-make-accountable" \
  --agent codex claude-code -y
```

Before running it, record the two existing symlink targets. Afterward, restore only this identity’s expected overlays if bootstrap replaced them:

```text
.agents/skills/pr-make-accountable -> ../../skills/public/prs/pr-make-accountable
.claude/skills/pr-make-accountable -> ../../.agents/skills/pr-make-accountable
```

Normalize only this lock entry’s `source` back to `skills/public/prs/pr-make-accountable` if the tool wrote an absolute path. Inspect `git diff -- skills-lock.json .agents/skills/pr-make-accountable .claude/skills/pr-make-accountable` and reject unrelated churn. Do not invent a hash manually and do not touch `wait-what` metadata.

External/tool provenance: planning inspected `skills` CLI 1.5.21 help on 2026-08-06. It confirms targeted local `add` accepts `--agent codex claude-code -y`; repository-owned `skill-management` guidance remains authoritative for symlink restoration and source normalization.

Gate:

```sh
ns skill-exposure check skills/public/prs/pr-make-accountable
```

Expected: explicit exposure check succeeds and both flat overlays still resolve to the canonical source.

## Execution strategy and checkpoints

Use precise semantic edits and exact file deletions. This is a small mixed prose/TypeScript retirement with no repeated same-shape refactor; do not use a codemod, ad hoc bulk replacement script, or refactor swarm.

This is one coherent change, so use one final commit rather than an intermediate `ns flow cp`. Do not checkpoint a state where the command registration and implementation/test deletion disagree.

Subagent orchestration opportunities: none for implementation. The skill rewrite, CLI deletion, and metadata cleanup are tightly coupled and small enough that delegation would add integration overhead. A review-only TypeScript style subagent is still required at closeout.

## Validation and expected results

Run focused checks first, then repo policy’s broader gates:

```sh
pnpm --dir ts --filter @internal/ns-dev test
pnpm --dir ts run check
pnpm --dir ts run fmt:check
pnpm --dir ts run lint
pnpm --dir ts run deps:check
ns skill-exposure check skills/public/prs/pr-make-accountable
dprint check
just
```

If the exact dependency-check script name has drifted, use the current `just ts-deps-check` equivalent rather than guessing. Expected: every command succeeds; the lockfile has no unrelated importer churn; full `just` remains green. Use repo autofix commands for formatter/linter output, then rerun the failed gate.

Run final stale-concept checks:

```sh
rg -n 'caveman|CAVEMAN_MODEL_OPERATION_ID|ns-dev\.caveman' \
  skills/public/prs/pr-make-accountable ts/packages/internal/dev/ns-dev
rg -n '@nseng-ai/extension-kit' ts/packages/internal/dev/ns-dev
```

Expected: no Caveman matches in either target area and no Extension Kit source/manifest dependency in ns-dev if the live import scan confirmed it was command-only. Repository-wide historical or unrelated matches are not a failure, but every live match in these two target areas must be explained or removed.

## STOP conditions

- Stop and ask for a dependency decision if live code shows another `@internal/ns-dev` feature uses `@nseng-ai/extension-kit`; do not remove or refactor that dependency opportunistically.
- Stop if targeted `npx skills add` produces unrelated skill, lockfile, or overlay changes that cannot be cleanly isolated while preserving the documented symlink topology; report the churn instead of normalizing it by guesswork.
- Stop if the desired controlled-English rules would require claiming formal ASD-STE100 compliance or copying a proprietary/full standard not present in the repository. Keep the wording explicitly “ASD-STE100-inspired.”
- Stop if a live consumer invokes `ns-dev caveman` outside the dedicated implementation/tests; identify that consumer and get a migration/deletion decision rather than silently breaking an unplanned workflow.

## Inherited evidence and revalidation

### Stable inherited evidence

- `pr-make-accountable` is the repository’s sole public skill and must remain operationally dependent only on Git and authenticated `gh`; this is why direct composition with vendored `wait-what` is rejected.
- `.agents/skills/pr-make-accountable` is a first-party symlink; `.agents/skills/wait-what` is a real vendored directory. Edit only the canonical first-party source.
- Upstream melding uses one commit-level pin in `docs/agents/matt-pocock-skills.md`; do not duplicate hashes in adapted surfaces.

### Revalidate during implementation

- Re-run scoped searches for Caveman consumers and `@nseng-ai/extension-kit` imports before deletion.
- Compare the drift-anchor excerpts with current files.
- Confirm package scripts and the standard unknown-command envelope before writing exact assertions.
- Confirm targeted skill installation behavior and inspect all generated metadata diffs.

### Explicitly unresolved

None. The user explicitly requested command deletion; compatibility behavior is intentionally rejected.

## Closeout review

After implementation and focused validation pass, run exactly one in-session `typescript-style` review-only subagent over the changed diff, using the review definition’s default model when available (for Pi/OpenAI review routing, `openai-codex/gpt-5.6-luna:medium` is an appropriate review-only example). Inspect its final status and text. Remediate only local, mechanical, low-risk findings and rerun focused checks; report judgment calls rather than guessing, and do not launch a second style review.

Finally, rerun the declared gates, compare changed files to the scope boundary, inspect deletions and generated lock changes, and read the new CLI-shape assertion and skill prose directly rather than trusting green output alone.
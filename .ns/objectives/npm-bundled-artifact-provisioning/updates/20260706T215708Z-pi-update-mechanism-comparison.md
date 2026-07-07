# Pi update-mechanism comparison: convergences, justified divergences, parked breadth

## Summary

Comparison of the decided `ns update` reconcile slice (plan
`resilient-wondering-scott`, built on decisions `20260706T191545Z` and
`20260706T194500Z`) against pi's package/update mechanism, read from source at
`earendil-works/pi` (formerly `badlogic/pi-mono`) `packages/coding-agent`
(`src/core/package-manager.ts`, `src/package-manager-cli.ts`, `docs/packages.md`);
exact commit and process provenance in **Lineage** below. Purpose: confirm where ns
independently converges with pi, justify every divergence explicitly, and catalog the
pi capabilities we have deliberately **not** built so future work borrows a debugged
design instead of reinventing one.

## Lineage

**Pi (comparison subject).** Pi is Mario Zechner's coding agent, originally
`github.com/badlogic/pi-mono` — the name ns's earlier research
(`docs/research/pi-extension-system-report.md`,
`docs/research/harness-skill-invocation.md`, both ~2026-06-13) cites. The repo has
since been transferred to `github.com/earendil-works/pi` (GitHub redirects the old
name), and the package is now `@earendil-works/pi-coding-agent`. Pi is doubly relevant
to this record: it is both prior art for module-bundled resource distribution and one
of ns's provisioning **target harnesses** (harness id `pi` in `ns.toml`), so its own
mechanism and the directories ns writes into belong to the same tool.

**Source read for this comparison.** Fresh shallow clone of
`earendil-works/pi` on 2026-07-06, commit `244f1deaf1ae0fc1a242d9df5cddf457cf3d36a7`
(2026-07-06, `@earendil-works/pi-coding-agent` v0.80.3). Files read directly, not from
docs alone: `packages/coding-agent/src/core/package-manager.ts` (resolve/install/
update/checkForAvailableUpdates), `src/package-manager-cli.ts` (command surface, trust
flow, self-update), `src/core/settings-manager.ts` (project-scope anchoring),
`docs/packages.md`. This supersedes-in-freshness (not in scope — it covers only the
package/update mechanism) the two 2026-06-13 research docs above.

**ns side of the comparison.** Slice plan `resilient-wondering-scott`
(`~/.claude/plans/`, outside the repo), which encodes the grilling-session decisions
`20260706T191545Z-npm-module-source-model-decision.md` and
`20260706T194500Z-reconcile-trigger-and-targeting-decisions.md`, checked against the
landed `@nseng-ai/harness-artifacts` core (`provision-apply.ts` manifest/hash/conflict
machinery) on branch `npm-module-artifact-discovery-slice`.

**Process.** Interactive comparison session, 2026-07-06, immediately following the
grilling sessions that produced the decisions above: user asked where the `ns update`
plan agrees with, and diverges from, pi's update mechanism, with every divergence
justified. Output: this update, the two plan amendments (trust limitation,
drift-detection follow-up), and the umbrella parked-row additions.

The root structural difference explains most mechanics: **pi loads resources in place;
ns materializes copies.** Pi owns its loader, so a package sitting in its managed cache
(`~/.pi/agent/npm/`, `.pi/npm/`, git clone dirs) *is* installed — resolution happens at
startup, nothing is copied, so pi needs no install manifest, no content hashing, no
locally-edited-conflict detection, and no orphan concept. ns provisions **foreign
harnesses** (claude-code, pi itself, codex) that expect plain files in their own
directory layouts and offer ns no runtime hook, so copy-plus-manifest is forced, and
the hash/conflict/orphan machinery is a consequence, not a style choice.

## Convergences (independent agreement with pi)

- **npm module as distribution unit, declared via a static `package.json` key** — pi's
  `pi` key vs our `ns.harnessArtifacts`; both treat a module as a bag of typed
  resources with skills first-class.
- **Uniform install-new + refresh as reconcile-toward-declared-state** — pi's startup
  `resolve()` installs missing sources and reinstalls on configured↔installed version
  mismatch; our decision §3 (uniform across first-party and npm-module sources) is the
  same posture.
- **Update as reconciliation, not advancement** — pi reconciles an existing git clone
  back to its pinned ref rather than moving the ref; our manifest-driven refresh brings
  targets back in line with source.
- **Shared project-scope selection file** — pi's `.pi/settings.json` packages list ↔
  our repo-root `ns.toml` `harnesses = [...]`.
- **Git-root awareness, done more consistently than pi** — pi walks ancestors to the
  git root for `.agents/skills` discovery (`.git` checked with `existsSync`, matching
  worktree files too) but anchors project settings at literal `cwd`
  (`settings-manager.ts:194`), so `pi -l` behaves differently from a subdirectory. Our
  walk-up-to-git-root for `ns.toml` (user-confirmed) avoids that wart.

## Divergences, each justified

1. **Materialization vs in-place loading** — forced by provisioning foreign harnesses
   (above). Not revisitable while ns targets harnesses it does not own.
2. **Hash-manifest conflict detection (`locally_edited_conflict` + `--force`)** — pi
   has none: its caches are hidden implementation dirs and `npm install` clobbers them
   freely. ns writes into user-visible harness dirs where hand-edits are plausible.
   Nothing to borrow; pi does not have the problem.
3. **Hard plan-time collision errors vs silent precedence** — pi dedupes same-identity
   packages project-over-global and ranks resource precedence silently; a shadowed
   resource simply doesn't load, with no signal. Safe for pi (in-memory pick, no
   writes); unsafe for ns (one module's file would overwrite another's at the same
   target path). Decision §5 (error, not precedence) stands and is the safer design.
4. **No acquisition story** — pi's mechanism is dominated by source acquisition: the
   `npm:pkg@1.2.3` / `git:host/user/repo@ref` / local-path spec grammar, pinning
   semantics (versioned npm spec = pinned = skipped by updates; git ref = configured
   checkout target = reconciled, reset+clean+`npm install` on change), registry version
   checks, `npmCommand` wrapper setting, offline mode. ns consumes modules already on
   disk (committed `.ns/extensions/`, XDG root), so acquisition is out of scope
   (decision §6, objective non-goals) — and vendored modules get pinning for free from
   git, which is more git-native than pi's parallel settings-based pin registry.
5. **`update` verb stays artifact-only** — `pi update` defaults to self-update with
   packages behind `--extensions`/`--all`/`--extension <src>`/positional-source/
   `self`/`pi` aliases and ~40 lines of pairwise flag-conflict checks — the accumulated
   cost of one verb doing two jobs. Minimal `ns update` avoids inheriting it; if ns
   ever needs self-update, give it a separate surface.
6. **Explicit-command trigger vs startup self-healing** — see follow-up below; the gap
   (drift between pulled module updates and provisioned artifacts) is real and
   acknowledged, related to the parked load-time fingerprint backstop (decision §7).
7. **No trust model** — see follow-up below; accepted while ns is private/unreleased
   with trusted-repo assumptions, now recorded in the slice plan's limitations rather
   than diverging silently.
8. **Report-only orphans vs immediate `pi remove`** — pi deletes cache installs
   because nothing user-owned lives there; ns never deletes files in foreign harness
   dirs. Uninstall stays parked (decision §3).
9. **No per-resource filtering** — pi has per-package filter objects (globs, `!`
   exclusions, `+`/`-` exact overrides, `pi config` TUI, `autoload:false` deltas over a
   global entry). Decision §3 already frames selective install as a future
   desired-state filter on top of reconcile; pi's filter-object shape is the template
   when that day comes.

## Parked-feature catalog (pi-informed, none in scope here)

Recorded so future rows borrow rather than reinvent. Breadth ownership stays with the
umbrella `skill-management-subsystem` (rows updated there referencing this analysis):

- **Remote acquisition sources.** Pi supports npm-registry, git (https/ssh/shorthand),
  and local-path package sources with a uniform spec grammar and pinning semantics
  (§4 above). If ns grows fetch-from-registry provisioning (anticipated `ns.toml`
  `artifact-packages` list, decision §6), port pi's grammar and pin semantics.
- **Project trust gating.** Pi refuses to install or load project-scoped packages
  until the project is explicitly trusted (trust store + `--approve`/`--no-approve`,
  `resolveProjectTrusted`); docs lead with a security warning. Threat is identical for
  ns: a cloned repo's `.ns/extensions` module provisions skill files (prompt-injection
  payloads by design) into harness dirs on `ns update`. Eventual model if audience
  widens.
- **Drift detection / staleness nudge.** Pi self-heals every startup (auto-install
  missing, reinstall on version mismatch) and exposes non-blocking
  `checkForAvailableUpdates()`. ns equivalent: a read-only desired-vs-manifest diff
  (the reconcile pure planner already computes it) surfaced as a nudge; complements the
  parked load-time fingerprint backstop.
- **Per-resource filtering / enable-disable** (pi filter objects + `pi config` TUI) —
  future desired-state filter on reconcile.
- **Uninstall / orphan cleanup** (pi `remove` deletes install + settings entry) —
  parked; ns orphans stay report-only until a deliberate uninstall surface exists.
- **Self-update surface** (pi `update --self`, release-note rendering, install-method
  detection) — not an ns concern while unreleased; if built, keep it a separate verb.

## Objective Impact

- No scope change; no open question resolved or added. All parked items above remain
  non-goals of this record per `objective.md`.
- Slice plan `resilient-wondering-scott` amended: trust-model gap added to "Known
  accepted limitations"; drift-detection recorded as a follow-up — both citing this
  update.
- Umbrella `skill-management-subsystem/roadmap.md` Parked section: acquisition-source,
  trust-gating, and drift-detection rows added/annotated with pointers here (parked-row
  disposition edits, per this record's runner policy).

## Follow-Ups

- When any parked row above activates, start from pi's corresponding design
  (`earendil-works/pi` `packages/coding-agent`, commit pinned in Lineage) rather than a
  blank page — and re-check upstream first; pi moves fast (v0.80.3 at read time).
- The two 2026-06-13 research docs and any other repo reference to `badlogic/pi-mono`
  now point at a redirected name (`earendil-works/pi`); fix opportunistically when
  those docs are next touched (drift note, not a widened slice).
- Drift-detection nudge: candidate next slice after `ns update` lands, reusing the
  reconcile pure planner read-only.

# Drift audit of existing context files

Asset for the [Ontology Reshape map](./map.md) ticket "Drift audit of existing
context files". Audited 2026-07-10 against checked-in source (tracked files only;
untracked leftover directories under `ts/packages/` excluded via `git ls-files`).

Verified inventory baseline used throughout:

- **29 tracked packages** under `ts/packages/` role directories
  (`git ls-files 'ts/packages/*/package.json' 'ts/packages/*/*/package.json'`).
- **13 context files**: root `CONTEXT.md` + 12 package `CONTEXT.md` files
  (capabilities: branch-context, ccc, flow, handoffs, objectives, plans, reviews,
  slots; capability-kit/src/graphite; hosts/pi; infra/brmem; kernel).

Verdict scale per claim: **VERIFIED** (matches source), **STALE** (was true, source
moved on), **WRONG** (does not match source), UNVERIFIABLE (intent/vocabulary with no
source ground truth — not drift).

## Summary

| File                                     | Verdict                                    |
| ---------------------------------------- | ------------------------------------------ |
| `CONTEXT.md` (root)                      | Clean — all checkable claims verified      |
| `CONTEXT-MAP.md`                         | 4 wrong                                    |
| `capabilities/branch-context/CONTEXT.md` | 1 wrong                                    |
| `capabilities/ccc/CONTEXT.md`            | Heavy drift — 5 stale/wrong claim clusters |
| `capabilities/flow/CONTEXT.md`           | Clean                                      |
| `capabilities/handoffs/CONTEXT.md`       | Clean                                      |
| `capabilities/objectives/CONTEXT.md`     | 1 wrong, 2 stale                           |
| `capabilities/plans/CONTEXT.md`          | Clean                                      |
| `capabilities/reviews/CONTEXT.md`        | Clean (one wording note)                   |
| `capabilities/slots/CONTEXT.md`          | Clean                                      |
| `capability-kit/src/graphite/CONTEXT.md` | Systemic wrong — `@ns/` scope throughout   |
| `hosts/pi/CONTEXT.md`                    | 1 stale                                    |
| `infra/brmem/CONTEXT.md`                 | Clean                                      |
| `kernel/CONTEXT.md`                      | Systemic wrong — `@ns/` scope throughout   |

## Cross-file themes

1. **`@ns/` scope residue** (kernel, capability-kit/graphite). Both docs name their
   packages under the retired `@ns/` scope (`@ns/kernel`, `@ns/kernel/sdk`,
   `@ns/capability-kit/graphite`, "all `@ns/*` packages"). The scope exists in no
   `package.json` name, tsconfig path, or import; current scope is `@nseng-ai/`
   (`ts/packages/kernel/package.json:2`, `ts/packages/capability-kit/package.json:2`).
   The map's standing rules already ban recreating retired `@ns/*` identity; these two
   docs are the remaining prose residue. Decision-free fix.
2. **Worktree-status ownership contradiction** (ccc vs. hosts/pi source). The ccc
   glossary claims CCC owns worktree-status observability; the renderer, status logic,
   and parity registration live entirely in `hosts/pi` with no `@nseng-ai/ccc` import.
   Feeds the "Reexamine CCC and the orchestration layer" grilling ticket directly.
3. **Retired `/ns:objective:stack-impl` residue** (ccc). The surface was retired into
   `objective-autorun` (2026-07-05); the ccc glossary still defines its orchestration
   term and cites the command as a stable example.
4. **`CONTEXT-MAP.md` inventory undercount**. The Inventory Baseline says 26 packages
   and "Thirteen have present package context files"; truth is 29 packages and 12
   package contexts (+ root). Its own line 12 enumeration is correct and contradicts
   line 11. Decision-free fix.

## Per-file findings

### CONTEXT.md (root) — clean

All checkable code-fact claims verified; the remainder is intent/vocabulary
definition. Spot-verified highlights:

- Capability-Kit gateway subpaths `./git`, `./github`, `./graphite`, `./cmux`
  (`ts/packages/capability-kit/package.json` exports).
- `ns objective exec load-orientations` registered
  (`ts/packages/capabilities/objectives/src/ns/extension.ts:30`).
- `ns skills list|path|install` group
  (`ts/packages/capabilities/harness-artifacts/src/ns/extension.ts:7`).
- Package Tier canonical list matches the taxonomy enum
  (`ts/packages/internal/typescript-style-guard/src/package-tier-taxonomy.ts`);
  `capability-pi` is a valid tier with zero current members.
- Retired `transitional`/`capability-gateway-backend` tiers and
  `@nseng-ai/domain-primitives-transitional` confirmed absent.

### CONTEXT-MAP.md — 4 wrong

- **WRONG** (line 11): "26 repo-local packages under `ts/packages/`" with inline check
  `git ls-files 'ts/packages/**/package.json' | wc -l` = 26. Truth: **29** tracked
  packages; the doc's own glob undercounts.
- **WRONG** (line 11): "Thirteen have present package context files." Truth: **twelve
  packages** have contexts; thirteen is the total only when root `CONTEXT.md` is
  counted, and root is not a package context. Self-contradicted by the correct
  enumeration on line 12.
- **WRONG** (line 11): scoped internal-space exceptions listed as `@internal/pi-tools`
  and `@internal/typescript-style-guard` only. Truth: `@internal/ns-dev` also exists
  (`ts/packages/internal/ns-dev/package.json`); the non-`@nseng-ai` set is four
  (three `@internal/*` + unscoped `nscc`).
- **WRONG** (lines 41, 70, 71): `@nseng-ai/flow-pi` listed as a Planned package
  context and used in Candidate Relationships as if inventory. No such tracked package
  exists; the only match is a test file inside flow
  (`ts/packages/capabilities/flow/test/pi/flow-pi-parity.test.ts`). Phantom package.
- Verified: the line-12 present-context enumeration (exact match with the 13 tracked
  files); planned-context claims for areg/packagechk/retros/vibechk/ns-pi-subagents
  (packages exist, contexts genuinely absent); out-of-scope `kernel-initiatives` /
  `kernel-reviewer` absent as claimed; command-surface relationship claims.

### capabilities/branch-context/CONTEXT.md — 1 wrong

- **WRONG** (lines 29–31, "Branch Context Presentation Boundary"): claims Pi
  slash-command registration and command names "are owned by Pi/CCC presentation code,
  not by `@nseng-ai/branch-context`." Truth: the capability's own `pi` subpackage
  defines the command-name constants and registers the commands
  (`src/pi/surfaces.ts:1-4`, `src/pi/from-plan-commands.ts:1243`
  `registerBranchContextCommands`); `hosts/pi` merely delegates via
  `@nseng-ai/branch-context/pi`
  (`ts/packages/hosts/pi/src/runtime/parity-extension.ts:67`).
- Verified: namespace `branch-context` (`src/core/constants.ts:3`), attached-plan key
  shape, `./api` export, plans dependency, all three slash-command names.

### capabilities/ccc/CONTEXT.md — heavy drift

- **STALE/WRONG** (line 3): container described as `core`, `autobranch`, and `cmux`
  subpackages plus `pi`. Truth: declared `ns.subpackages` are `api, cmux, ns, pi`; no
  `core` subpackage exists and `autobranch` is a directory under `src/ns/autobranch/`.
- **STALE** (line 40): cites `/ns:objective:stack-impl` as a stable non-CCC
  orchestration surface. The command no longer exists; registered objective slash
  commands are `create, list, refresh, retro, update`. Retirement recorded in
  `.ns/objectives/objective-runner/updates/20260705T202919Z-stack-impl-retired-into-autorun.md`.
- **STALE/WRONG** (lines 43–45, "Objective stack implementation orchestration"): the
  entire term describes the retired `/ns:objective:stack-impl` path; no stack-impl
  orchestration code exists in `ccc/src`.
- **STALE/WRONG** (lines 59–61, "Worktree status observability"): claims CCC owns the
  worktree-status operational model/presentation. Truth: renderer, status logic, and
  parity registration live in hosts/pi (`ts/packages/hosts/pi/src/worktree-status/status.ts`,
  `ts/packages/hosts/pi/src/parity/registry.ts:3,12`) with no `@nseng-ai/ccc` import;
  CCC's `ownedConcerns` (`src/api/index.ts:5-9`) lists `worktree-flow-coordination`
  only. Internally contradicted by the doc's own "Orchestration candidate" term
  (line 80), which still lists worktree-status as something to *move into* CCC.
- **STALE/WRONG** (lines 63–65, "Graphite metadata status"): same ownership root
  cause — the fact is part of the hosts/pi worktree-status renderer, not CCC.
- Verified: package/bin identity, `/ns:ccc:workspace:*` and `/ns:ccc:sidebar:*`
  surfaces (`src/cmux/command-surfaces.ts:9-38`), hidden `ccc exec autobranch`
  (`src/ns/cli.ts:90-105`), public `ns flow autobranch` / `/ns:flow:land` lifecycle
  surfaces.

### capabilities/flow/CONTEXT.md — clean

Export seams (`./api`, `./land/api`, `./land/testing`, `./land/*`), the `land`
subpackage split, the full `ns flow` command roster, and Capability API entry points
all match source. (Minor: prose says "copy" where the command is `cp`; list is
prefaced "such as" — not drift.)

### capabilities/handoffs/CONTEXT.md — clean

Namespace `handoff` singular (`src/core/identity.ts:3`, matching its own `Avoid:
handoffs`), key shape, `ns handoff list|pickup|create|delete|gc` face, `./api` and
`./identity` exports, and domain-core operations all match source.

### capabilities/objectives/CONTEXT.md — 1 wrong, 2 stale

- **WRONG** (line 8): claims a `@nseng-ai/objectives/command-face` export. No
  `./command-face` entry exists in the exports map (`package.json:5-21`) and no such
  file exists; likely copied from slots, which does export `./command-face`
  (`ts/packages/capabilities/slots/package.json:11`). The mountable surface is
  `./ns-extension` plus `./ns/commands/*`.
- **STALE** (line 28): hidden `ns objective exec` roster given as 3 helpers
  (`list-candidates`, `read-objective`, `runner-subagent-usage`). Truth: 7 —
  plus `load-orientations`, `runner-begin`, `runner-finish`, `tracking-gate`
  (`src/ns/extension.ts:21-71`).
- **STALE** (line 20, minor): EDGES described as the column right of LATEST UPDATE;
  actual order puts it right of BRANCHES
  (`src/core/operations/list-objectives-pretty.ts:88,99`).
- Verified: `check`/`list`/`show` surface, no `bin`, blocked-status glyphs, Capability
  API client and its consumers (ccc, nscc, objectives/pi), runner core and Runner
  Checkpoint, Pi optional-peer boundary.

### capabilities/plans/CONTEXT.md — clean

Local Plan Store XDG path and per-repo/per-branch keying (`src/saved-plan-file.ts:129,149-154`),
Saved-Plan Selection, directory-evidence shape, `./api` surface and its
branch-context/ccc consumers, and the `enriched-plan` bin all match source.

### capabilities/reviews/CONTEXT.md — clean (one wording note)

Command face (`list`, `ls`, `log`, `run`, hidden `exec record-findings|publish-findings`),
`./api` client, `.ns/reviews/<key>/review.md` definition path, `model_profile`
quick/deep, finding/findings-comment/review-log shapes all match source. Note (not
drift): the doc calls Reviews "an ns Capability" while `ns.tier` is
`"standalone-tool"` (`package.json:36`) — vocabulary-vs-tier tension for the
"review and feedback naming residue" grilling ticket.

### capabilities/slots/CONTEXT.md — clean

`ns slot` lifecycle roster, `shell` and `gt` groups, hidden `gt exec` helpers
(`src/ns/ns-extension.ts:21-50`), `./api` and `./command-face` exports, Shell
Directive, and navigation result shapes all match source.

### capability-kit/src/graphite/CONTEXT.md — systemic wrong

- **WRONG** (lines 1, 3, 7, 8, 16, 36): package/subpath named
  `@ns/capability-kit/graphite` throughout. Truth: `@nseng-ai/capability-kit`
  (`package.json:2`) with subpath `@nseng-ai/capability-kit/graphite`
  (`package.json:33`). The `@ns/` scope exists nowhere in source. Decision-free fix.
- Verified: all six graphite subpath exports; the sqlite3 metadata seam
  (`src/graphite/metadata.ts`); passive status worker lifecycle; the direct-`gt`
  boundary path.

### hosts/pi/CONTEXT.md — 1 stale

- **STALE** (line 28): "export map is intentionally limited to these families"
  enumeration omits `./skills/lookup`, `./worktree-status`, and
  `./worktree-status/extension` (`package.json:22,38-39`) — the last being a
  project-local extension entrypoint, not a neutral helper family.
- Verified: package identity, `commands/ack` seam, `@internal/pi-tools` subpaths,
  `@nseng-ai/ns-pi-subagents/runner-subagents`, per-capability `pi` subpackages,
  Capability API list, branch-context command names, `.pi/extensions/worktree-status.ts`.

### infra/brmem/CONTEXT.md — clean

Base Namespace `base`, ref layouts `refs/brmem/base/<encoded-branch>` and
`refs/brmem/ns/<namespace>/<encoded-branch>` (`src/ref-layout.ts:12,158-167`), Entry
Locator shape (`ref-layout.ts:180`), and the full CLI operation roster all match
source. Cleanest file audited.

### kernel/CONTEXT.md — systemic wrong

- **WRONG** (title; lines 3, 9, 48, 51–53, 55–56, 92): package named `@ns/kernel`,
  SDK `@ns/kernel/sdk`, and "all `@ns/*` packages". Truth: `@nseng-ai/kernel`
  (`package.json:2`) and `@nseng-ai/kernel/sdk`. Decision-free fix.
- Verified: `./sdk` as sole `publicPluginApi` entry, `internalWorkspaceExports`,
  `sdk-reference.md`, descriptor `exports["./ns-extension"]` enforcement
  (`src/extensions/install-command.ts:184`), `[points]` table and prompt paths,
  `ns extension points|point` read-only introspection, catalog precedence.

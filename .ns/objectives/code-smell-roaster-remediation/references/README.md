# Reference: code-smell-roaster sweep findings

These files capture the full findings from the automated, codebase-wide run of
`.sdl/reviews/code-smell-roaster.md` (the Fowler-style code-smell-only roaster
review) against every production TypeScript/TSX source file in this repo. They
preserve file:line evidence, roast, and concrete remedy per finding so a future
implementer can act without re-deriving the analysis.

## How the sweep was run

A `Workflow` run partitioned 849 production source files (test files and
vendored skill code excluded, per the review's own scope) into 70
package-local chunks. One reviewer agent per chunk applied the review's
12-smell Fowler baseline (Mysterious Name, Duplicated Code, Feature Envy, Data
Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent
Change, Speculative Generality, Message Chains, Middle Man, Refused Bequest),
capped at the 2-3 highest-conviction findings per chunk. Every raw finding then
went through an independent adversarial verification pass (a second agent
re-read the actual file and either confirmed or rejected the finding) before
being counted.

Raw findings: 174. Confirmed after verification: 162 (12 rejected as
inaccurate, mislabeled, or unconvincing). All counts in this directory refer to
the 162 confirmed findings.

Because each reviewer agent only saw its own package partition, **identical
logic shapes repeated across unrelated packages may be under-counted** as
Duplicated Code — this sweep does not claim cross-package duplication
coverage.

Out of scope by the review's own definition (do not treat as findings here):
spec correctness, repo coding standards, formatting/lint issues, missing
tests, commit organization, stack shape, PR process, VCS hygiene. Test source
files (`**/test/**`, `*.test.ts`) were excluded from the sweep entirely.

## Re-verification note

Re-verify file paths, line numbers, and that the smell is still present at
pickup time — the repo moves between the sweep and implementation, and a
finding may already be partly addressed by unrelated work.

## Severity legend (assigned by the reviewer agent, not re-calibrated)

- **high** — meaningfully hurts changeability/understanding (29 findings).
- **medium** — real but localized (90 findings).
- **low** — minor (43 findings).

## Files

One file per package/area cluster, each grouped by sub-package, ordered
high → medium → low severity within the cluster:

| File                    | Area                                                                                                                                               | Findings (high/med/low) |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `infra.md`              | `ts/packages/infra/*` (brmem, clinkr, core, exec, git, github, graphite, cli-runtime, cli-theme, time, test-kit)                                   | 29 (4/13/12)            |
| `capabilities.md`       | `ts/packages/capabilities/*` (flow, slot, land)                                                                                                    | 24 (7/13/4)             |
| `local-pi-tools.md`     | `ts/packages/local-pi-tools/*` (context-profiler, grill, pr-feedback-watch, pr-previews, runner-subagents, thermo-council, backing-skill-commands) | 19 (5/12/2)             |
| `capability-pi.md`      | `ts/packages/capability-pi/*` (branch-context, ccc, flow, handoff, objective)                                                                      | 13 (1/6/6)              |
| `tools.md`              | `ts/packages/tools/*` (areg, packagechk, vibechk)                                                                                                  | 12 (3/7/2)              |
| `hosts.md`              | `ts/packages/hosts/*` (pi, sdlcc)                                                                                                                  | 8 (2/4/2)               |
| `objective-package.md`  | `ts/packages/objective` (named to avoid clashing with this Objective record's own top-level `objective.md`)                                        | 6 (0/4/2)               |
| `roaster.md`            | `ts/packages/roaster`                                                                                                                              | 6 (0/4/2)               |
| `pi-extensions.md`      | `.pi/extensions`, `.pi/lib`                                                                                                                        | 5 (0/3/2)               |
| `aretro.md`             | `ts/packages/aretro`                                                                                                                               | 5 (0/3/2)               |
| `ccc.md`                | `ts/packages/ccc`                                                                                                                                  | 4 (1/3/0)               |
| `handoff.md`            | `ts/packages/handoff`                                                                                                                              | 4 (0/2/2)               |
| `branch-context.md`     | `ts/packages/branch-context`                                                                                                                       | 3 (1/2/0)               |
| `cmux.md`               | `ts/packages/cmux`                                                                                                                                 | 3 (1/2/0)               |
| `kernel.md`             | `ts/packages/kernel`                                                                                                                               | 3 (1/2/0)               |
| `plans.md`              | `ts/packages/plans`                                                                                                                                | 3 (1/2/0)               |
| `sdl-capability-kit.md` | `ts/packages/sdl-capability-kit`                                                                                                                   | 3 (1/1/1)               |
| `address.md`            | `ts/packages/address`                                                                                                                              | 3 (0/1/2)               |
| `worktree-status.md`    | `ts/packages/worktree-status`                                                                                                                      | 3 (0/2/1)               |
| `ts-root.md`            | `ts/scripts`, `ts/vitest.*.config.ts`                                                                                                              | 2 (0/2/0)               |

Total: 21 files, 162 findings.

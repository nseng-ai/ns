# PR6 latency and install closure evidence recorded

## Summary

This update records the evidence-only closure slice for the extension descriptor contract stack.
No objective was closed. The evidence covers:

- descriptor catalog/help/completion latency before and after the stack;
- the accepted eager group-help path for module-owned summaries;
- the cheapness-policy escalation trigger and the PR1 guard test that now restricts first-party
  descriptor imports;
- a scratch-project end-to-end `ns install <local-package-dir>` transcript using the packaged
  `@nseng-ai/ns` CLI from `dist/publish`.

## Latency evidence

`hyperfine` was not available in this checkout, so timings were collected with a small Node loop
using `spawnSync` and `performance.now()`. Each case ran 3 warmups and 15 measured iterations.
The before checkout was a detached temp worktree at the stack parent/PR1 branch tip
`ac8d7a62c338ae7a37d97cd5988eeeaa3c8cb3a1` (`extension-descriptor-command-contract-neutralization`).
The after checkout was this branch at `25e09c6a29371f2faba3e6261b813128bace0529`.

Command shape for both checkouts:

```bash
node ts/packages/hosts/ns-cli/src/cli.ts --help
node ts/packages/hosts/ns-cli/src/cli.ts objective --help
node ts/packages/hosts/ns-cli/src/cli.ts completion exec resolve -- objective
```

Results:

| Case                                      | Before mean / median | After mean / median | Notes                                                                                                                                                         |
| ----------------------------------------- | -------------------: | ------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ns --help`                               |    515.5ms / 501.8ms |   522.2ms / 517.2ms | Top-level descriptor catalog path stayed essentially flat for this local source-dev invocation.                                                               |
| `ns objective --help`                     |    233.2ms / 231.7ms |   373.2ms / 324.7ms | Eager group-help path now loads command modules to render module-owned summaries; this is the intended tradeoff. One after outlier (611.0ms) raised the mean. |
| `ns completion exec resolve -- objective` |    231.9ms / 230.5ms |   259.3ms / 255.0ms | Completion resolve remained in the same order of magnitude after descriptor routing.                                                                          |

Raw output:

```text
# before ac8d7a62c PR1 parent (/tmp/ns-pr6-latency-base)
top_help: mean=515.5ms median=501.8ms min=486.4ms max=586.4ms n=15
group_help_objective: mean=233.2ms median=231.7ms min=223.0ms max=248.7ms n=15
completion_resolve_objective: mean=231.9ms median=230.5ms min=227.5ms max=243.2ms n=15
# after 25e09c6a PR5 current (/Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01)
top_help: mean=522.2ms median=517.2ms min=506.6ms max=567.9ms n=15
group_help_objective: mean=373.2ms median=324.7ms min=300.4ms max=611.0ms n=15
completion_resolve_objective: mean=259.3ms median=255.0ms min=229.0ms max=333.2ms n=15
```

Cheapness-policy interpretation:

- The descriptor import-light policy remains convention-first.
- The top-level and completion paths did not show a large local regression in this source-dev
  measurement.
- The eager `ns <group> --help` cost is visible and expected because descriptor entries no longer
  duplicate summaries; summaries are module-owned, so group help loads the group's command modules.
- PR1 added the mechanical guard test for the first escalation tier:
  `NS_TS_BAN_EXTENSION_DESCRIPTOR_STATIC_IMPORT` in
  `ts/packages/internal/typescript-style-guard/src/source-rules.ts`, with coverage in
  `ts/packages/internal/typescript-style-guard/test/typescript-style-guard/typescript-style-guard.test.ts`.
  It rejects first-party `ns-extension` descriptor modules that statically import implementation
  modules instead of keeping them behind load thunks.
- The second escalation tier remains available if future evidence warrants it: a per-descriptor
  load-time diagnostic budget (rough target recorded in the objective: around 10ms).

## Scratch-project end-to-end transcript

Scratch directory: `/tmp/ns-pr6-scratch-e2e` (outside this repo).
Transcript file during the run: `/tmp/ns-pr6-scratch-e2e-transcript.txt`.

The run built `@nseng-ai/ns` from `ts/packages/hosts/ns-cli/dist/publish`, installed it into a fresh
project, installed this worktree's `@nseng-ai/objectives` package with `npx ns install`, verified the
recorded `ns.toml` source spec and managed root, ran `npx ns objective list` against copied real
`.ns/objectives` records, then reran install and confirmed the source spec was already recorded.

```text
+ cd /tmp/ns-pr6-scratch-e2e
+ pwd
/tmp/ns-pr6-scratch-e2e
+ npm init -y
Wrote to /private/tmp/ns-pr6-scratch-e2e/package.json:

{
  "name": "ns-pr6-scratch-e2e",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs"
}


+ npm install --no-save /Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/hosts/ns-cli/dist/publish

added 1 package, and audited 3 packages in 109ms

found 0 vulnerabilities
+ npx ns --version
0.1.2
+ git init
Initialized empty Git repository in /private/tmp/ns-pr6-scratch-e2e/.git/
+ mkdir -p .ns
+ cp -R /Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/.ns/objectives .ns/objectives
+ npx ns install /Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/capabilities/objectives
Installed @nseng-ai/objectives@0.1.2
source: /Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/capabilities/objectives
managed root: /private/tmp/ns-pr6-scratch-e2e/.ns/managed-extensions/npm/node_modules/@nseng-ai/objectives
ns.toml: /private/tmp/ns-pr6-scratch-e2e/ns.toml (recorded)

+ printf '\n--- ns.toml ---\n'

--- ns.toml ---
+ sed -n 1,80p ns.toml
extensions = ["/Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/capabilities/objectives"]
+ printf '\n--- managed root ---\n'

--- managed root ---
+ test -e .ns/managed-extensions/npm/node_modules/@nseng-ai/objectives
+ ls -la .ns/managed-extensions/npm/node_modules/@nseng-ai/objectives
lrwxr-xr-x@ 1 schrockn  wheel  123 Jul  8 10:13 .ns/managed-extensions/npm/node_modules/@nseng-ai/objectives -> ../../../../../../../../Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/capabilities/objectives
+ printf '\n--- objective list ---\n'

--- objective list ---
+ npx ns objective list
Objective records in this checkout
13 records  ·  filter active  ·  root .ns/objectives

OBJECTIVE                           STATUS        LATEST UPDATE  BRANCHES  EDGES
code-smell-roaster-remediation      ● open     x  23 hours ago   0
cross-harness-parity                ● open     x  23 hours ago   0         1
the retired website Objective                ● open     x  23 hours ago   0         1
extension-descriptor-contract       ● open     x  —              0
flow-land-incremental-perf-rollout  ● open     x  23 hours ago   0         1
prod-submit-roast-and-fix           ● open     x  —              0
remote-artifact-module-acquisition  ● open     x  23 hours ago   0         1
repo-ontology                       ● open     x  23 hours ago   0
ship-objectives-to-customers        ● open     x  22 hours ago   0         4
skill-management-subsystem          ● open     x  4 hours ago    0         6
standing-test-performance-boundar…  ● open     x  20 hours ago   0
subagent-run-observability          ● open     x  —              0
vibechk-v1                          ● open     x  3 days ago     0

x = uncommitted changes not yet recorded in an update
+ printf '\n--- rerun install ---\n'

--- rerun install ---
+ npx ns install /Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/capabilities/objectives
Installed @nseng-ai/objectives@0.1.2
source: /Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/capabilities/objectives
managed root: /private/tmp/ns-pr6-scratch-e2e/.ns/managed-extensions/npm/node_modules/@nseng-ai/objectives
ns.toml: /private/tmp/ns-pr6-scratch-e2e/ns.toml (already recorded)

+ printf '\n--- ns.toml after rerun ---\n'

--- ns.toml after rerun ---
+ sed -n 1,80p ns.toml
extensions = ["/Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-01/ts/packages/capabilities/objectives"]
```

## Objective Impact

- Supplies the latency evidence requested by the deletion row and the Objective completion
  criteria.
- Supplies the scratch-project `ns install <local-package-dir>` end-to-end evidence requested by
  the install row and the Objective completion criteria.
- Confirms idempotent source-spec recording for the installed local extension package.
- Confirms the managed install root exists and resolves to the source package as npm's local-dir
  symlink, matching the design assumption recorded in the Objective.
- Does not close the Objective; closure still requires parent inspection, commit, and whatever final
  validation policy the parent chooses to enforce.

## Follow-Ups

- Watch `ns <group> --help` timing as more command modules grow, because eager summary rendering is
  the cost-bearing path.
- If future help/completion evidence regresses materially, promote the recorded load-time budget
  diagnostic from fallback to implementation work.

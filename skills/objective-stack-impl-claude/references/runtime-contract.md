# Runtime contract — `objective-stack-impl-claude`

This is the **forked, self-contained** contract between the pre-flight skill and the autonomous
Workflow. It mirrors (but does not depend on) Pi's `/objective-stack-impl`. The JavaScript in
`.claude/workflows/objective-stack-impl-claude.js` is the **canonical source of truth** for the
schemas and the briefs; this document is the prose companion. If they ever disagree, the JS wins.

## Roles

- **Pre-flight skill** (`SKILL.md`, runs in the main session): pick the Objective, inspect records +
  repo state, run the tracking gate and clean-tree gate, preview a 1–3 slice plan, get explicit
  confirmation, assemble `args`, invoke the Workflow, and render the returned digest.
- **Workflow** (`objective-stack-impl-claude.js`, background): a strictly serial `for` loop over the
  approved slices. Per slice it runs three agents — Implement → Verify → (one bounded retry) →
  Track — and stops the loop on any failed verdict, blocker, or question. The script itself has no
  Bash/git/filesystem access; every git/validation/Objective-file action happens **inside an
  `agent()` call**.

## `args` — the approved plan

Assembled by the pre-flight skill on explicit user confirmation. Kept lean: slice agents have Bash
and read the Objective files themselves, so narrative is not inlined.

```jsonc
{
  "slug": "<objective-slug>",
  "trunkBranch": "<trunk, e.g. master>",
  "validateCommand": "just",            // optional; defaults to "just" in the script
  "objectiveSummary": "<short orienting prose>",
  "slices": [
    {
      "index": 1,
      "title": "<slice title>",
      "thesis": "<one sentence>",
      "baseRef": "<branch the FIRST slice builds on>",  // later slices ignore this
      "branchName": "<stack-feature>/<terse-change>",
      "scope": "<in-scope / non-goals>",                // string or array of strings
      "validation": "<command/evidence>",               // optional; falls back to validateCommand
      "downstreamNotes": "<notes for later slices>"     // optional; string or array
    }
  ]
}
```

**Base threading.** Slices are serial — each branch builds on the previous one. The script computes
each slice's base as `prevBranch || slice.baseRef || trunkBranch`, so only the first slice's
`baseRef` matters; after that the actual branch the implementer created becomes the next base. This
is robust to amends because branch _names_ are stable.

## Control flow (per slice)

1. **Implement** — `agent(buildBrief(...), { schema: HANDOFF })`. Builds the slice, creates the
   stacked `gt` branch, runs `validateCommand`, emits a HANDOFF. A `status: "question"` handoff stops
   the loop immediately (no verify).
2. **Verify** — `agent(buildVerify(...), { schema: VERDICT })`. A separate, adversarial agent that
   resolves the branch, checks `head == head_sha`, inspects `git diff base...branch` for scope drift,
   and **re-runs** `validateCommand`. Defaults to `ok: false` when uncertain.
3. **Bounded retry** — exactly one. On a failed verdict (or `status: "failed"`), a fresh implementer
   gets the concrete failure reasons and amends the _same_ branch; then re-verify. Still failing →
   record and `break`.
4. **Track** — only on `status: "ok"` + ok verdict. `agent(buildObjectiveUpdate(...), { schema:
   TRACK })` writes a Semantic Update + roadmap checkbox and **folds the tracking into the slice
   commit** via `gt modify` (asdl ships code + Objective edit together), then reports the new head.
5. **Stop conditions** — `break` on question, on verification failure after retry, or on a reported
   blocker (after tracking). Otherwise set `prevBranch = handoff.branch` and continue.

The script never pushes or submits; it returns a structured digest for the main session to render.

## Schemas (forked, self-contained)

### HANDOFF — `objective-stack-impl-claude/handoff/v1`

```jsonc
{
  "schema": "objective-stack-impl-claude/handoff/v1",
  "status": "ok" | "failed" | "question",
  "branch": "<branch created>",
  "head_sha": "<git rev-parse HEAD on branch>",
  "base_ref": "<base the branch was created on>",
  "changed_files": ["<path>", "..."],
  "validation": { "command": "<validateCommand>", "exit_code": 0 },
  "objective_update": { "recorded": false },   // implementer never records; Track phase owns it
  "blockers": "<optional>",
  "question": "<required when status == question>",
  "next_step": "<optional>"
}
```

### VERDICT (independent verifier)

```jsonc
{
  "ok": true,                  // true only if branch resolves, head matches, scope ok, validation == 0
  "reasons": ["<finding>", "..."],
  "validation_exit_code": 0,   // the exit code the verifier actually observed (-1 if not run)
  "scope_ok": true
}
```

### TRACK (Objective-update agent)

```jsonc
{
  "recorded": true,
  "path": ".asdl/objectives/<slug>/updates/<timestamp>-<slice>.md",
  "summary": "<one line>",
  "head_sha": "<HEAD after folding tracking into the slice commit>"   // optional
}
```

## Brief structure (documented; `buildBrief` is canonical)

Each per-slice implementer brief includes: the Objective slug + `objectiveSummary`; an instruction to
read the Objective records itself (`objective exec read-objective <slug> --format md`); the slice
goal/thesis/scope; the exact `gt create <branchName>` instruction off the computed base (citing the
`graphite` skill, including its untracked-branch handling); the `validateCommand` plus the
`just fix` / `just dprint-fix` autofix policy; downstream notes from prior slices; hard constraints
(one slice only, never push/submit, do not record Objective updates); and the instruction to emit a
single `objective-stack-impl-claude/handoff/v1` JSON object as the final message.

Agents run with **`isolation` unset** (shared cwd), so the real Graphite stack is built on the live
checkout. The serial awaited loop guarantees only one agent mutates the worktree at a time.

## Deliberate omissions vs Pi

- **No `objective exec runner-subagent-usage` telemetry.** That command parses Pi JSONL session logs
  the Claude parent never receives. The digest states token telemetry is unavailable in the Claude
  harness and optionally surfaces the coarse `budget.spent()` aggregate.
- **No per-slice human gate.** Pi stops and asks mid-run; here the loop runs autonomously and
  stops-and-reports instead. Recovery is manual, from inspectable git/Graphite state, the Objective
  files, and the Workflow digest.

## Manual recovery

If the run stops on a blocker/question/failure, recover from inspectable artifacts: `git status`,
diffs, commits, and `gt ls` for stack state; the Objective files and `updates/`; and the Workflow
digest surfaced in the main session. There is no hidden state, durable stack schema, or Branch Memory
ledger.

---
name: sdl-cli-design
disable-model-invocation: true
description: "Authoring discipline for sdl-tools CLIs, grounded in Clinkr. Invoke when designing, authoring, or reviewing an sdl CLI command, command group, `exec` subgroup, machine output shape, exit/error behavior, or destructive/confirmation flow. Covers hard gates, the human tier (clig.dev), the agent/`exec` tier, danger tiers, naming, and a pre-ship checklist mapped to ADRs 0010-0014 and the Clinkr API."
metadata:
  internal: true
---

# sdl-cli-design

Canonical authority for **authoring** well-designed CLIs in sdl-tools. CLIs here
serve two audiences at once — humans in a terminal and AI agents reading output
back into a context window — so a command is not done when it parses; it is done
when both audiences get a stable, bounded, recoverable contract.

This skill is Clinkr-grounded: every rule maps to the Clinkr API that satisfies
it, or is explicitly flagged "design around until ADR/change lands." It is about
*authoring* CLIs, not driving/consuming them.

Decision provenance: `docs/agent-era-cli-design-survey.md` (competing positions
with sources), the Clinkr gap audit
(`.sdl/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`),
and ADRs `docs/adr/0010`–`0014`.

## How to use this skill

1. Read this `SKILL.md` for the hard gates, naming, and the pre-ship checklist.
2. Load only the `references/` file for the tier you are working in:
   - `references/human-tier.md` — clig.dev-style human UX.
   - `references/agent-exec-tier.md` — schema-first machine contracts and `exec`.
   - `references/danger-tiers.md` — the four danger tiers and confirm/force verbs.
   - `references/clinkr-api-map.md` — rule → Clinkr symbol/file map and ADR index.
3. Apply the pre-ship checklist before shipping.

## Hard gates (non-negotiable)

These apply to every sdl CLI command regardless of audience.

1. **Use the framework parser.** Build commands as `ClinkrGroup` /
   schema → handler → `ClinkrExit<T>`; do not hand-roll argv parsing or `process.exit`.
2. **`-h`/`--help`, `--version`, `--runtime` exist and work** for every CLI
   entrypoint, and are covered by scenario tests (see AGENTS.md "CLI Scenario
   Testing Convention").
3. **stdout is the result; stderr is for humans/logs/status.** Machine output
   (`--format json`) goes to stdout; human negative/status messaging goes to
   stderr.
4. **Stable, documented machine output.** Agent-facing results carry a
   `resultSchema`; `--json-schema` must publish the real shape. Human rendering
   (`renderHuman`) may evolve freely; the machine envelope may not, except
   additively.
5. **Process exit codes are coarse and stable:** `ok=0`, `negative=1`,
   `failure`/`usageError=2` (ADR 0010, ADR 0013). Detailed failure semantics live
   in the machine envelope (`errorType` + structured `data`), not in numeric exit
   codes.
6. **Non-interactive by default.** Prompts are allowed only when stdin is a TTY
   (`ClinkrInteraction.isInteractive()`); non-interactive invocation must fail
   fast with a `usageError` that names the missing flag, never hang on a prompt.
7. **Skill/agent-only operations live under a hidden `exec` subgroup** (ADR-aligned
   with AGENTS.md "Skill-Invoked CLI Commands"). Construct the subgroup
   `ClinkrGroup` with `isHidden: true`; do not mutate it after construction.

## Tiers (overview)

- **Human tier** — concise default help, examples, visible state-change feedback,
  useful rewritten errors, TTY/color/pager behavior. Detail: `references/human-tier.md`.
- **Agent/`exec` tier** — schema-first results, explicit stable envelopes,
  context-bounded output, structured actionable errors, no prompts, deterministic
  contracts, hidden `exec` subgroups. Detail: `references/agent-exec-tier.md`.
- **Danger tier** — four authoring danger tiers, TTY-gated confirmation, dry-run
  as `ok(...)`, and the `--yes`/`-y` (Tier 2 confirm) vs `--force`/`-f` (Tier 3
  precondition override) verb split (ADR 0014). Detail: `references/danger-tiers.md`.

## Naming

- Prefer fewer, higher-level commands that match real workflows over a thin
  wrapper per low-level operation.
- Namespace commands so boundaries are legible (`pkg verb`, `pkg exec verb`).
- `exec` subgroup commands use noun-or-verb phrases (`resolve-prompt`,
  `get-reviews`); the `exec` namespace already implies the agent actor, so the
  verb need not re-encode it.
- Treat command names, flags, subcommands, output formats, and config as
  long-lived interfaces; change them additively.
- `--yes`/`-y` means "I confirm this destructive action"; `--force`/`-f` means
  "override a failed precondition." Do not blur them (ADR 0014).

## Output volume (ADR 0012 — command-local, not a framework API)

Clinkr deliberately has **no** compact/pagination/truncation/JSONL framework API.
Bounded output is the command author's responsibility:

- Choose domain-appropriate bounds for lists/diffs/logs/search results.
- When output can be truncated or windowed, expose completion state, the applied
  bound, and continuation/narrowing guidance in the **result schema** itself.
- Do not claim Clinkr has compact/pagination primitives — it does not. Reopen
  framework extraction only on the ADR 0012 evidence threshold (repeated command
  pressure or one severe agent-context failure).

## Pre-ship checklist

Each item is anchored to its ADR and the Clinkr API that satisfies it. Verify
before shipping a command.

- [ ] **Parser/help/version:** command is a `ClinkrGroup`/rendered command;
      `-h`, `--version`, `--runtime` work and have scenario tests
      (AGENTS.md CLI Scenario Testing Convention).
- [ ] **Machine schema published:** the result has a `resultSchema`;
      `--json-schema` prints the real envelope shape (ADR 0011;
      `buildMachineEnvelopeSchema`, `machineEnvelopeSchema`).
- [ ] **Envelope contract:** `--format json` emits the camelCase discriminated
      envelope (`status`, `exitCode`, `errorType`, `message`, optional `data`) on
      stdout (ADR 0011; `toMachineEnvelope` in `ts/packages/clinkr/src/exit.ts`).
- [ ] **Exit codes:** `ok=0`, `negative=1`, `failure`/`usageError=2`; no
      ad-hoc numeric taxonomy (ADR 0010, ADR 0013; `exitCodeForExit`).
- [ ] **Negative is shell-visible:** a semantic "no/empty/not-found" returns
      `negative(...)` (exit 1) when that is a real non-success; a harmless empty
      success returns explicit `ok(...)` with empty data (ADR 0013).
- [ ] **Failure carries recovery data:** `failure(errorType, message, data)` uses
      a stable snake_case `errorType` and structured `data` an agent can act on;
      consider narrowing the failure schema for stable machine consumers (ADR 0010).
- [ ] **Usage errors are enveloped:** modeled/Zod validation failures surface as
      `usageError` envelopes with structured issue data, not bare stderr
      (ADR 0011; `usageError`, `requireInteractiveOrUsageError`).
- [ ] **Non-interactive safety:** prompts gate on
      `ClinkrInteraction.isInteractive()`; non-interactive missing-authorization
      fails fast with a `usageError` naming the flag (ADR 0014).
- [ ] **Danger tier chosen:** the command's tier (0–3) is identified; Tier 2 uses
      `--yes`/`-y`, Tier 3 uses `--force`/`-f`; any dry-run returns `ok(...)`
      (ADR 0014; `references/danger-tiers.md`).
- [ ] **Output bounded:** large results are bounded with completion/continuation
      state in the schema; no reliance on a nonexistent Clinkr pagination API
      (ADR 0012).
- [ ] **Hidden exec for agent-only ops:** skill-invoked operations live under an
      `isHidden: true` `exec` `ClinkrGroup` (AGENTS.md).
- [ ] **Tests:** scenario tests cover `--version`/`--runtime`/`-h`, machine
      output, a representative `usageError`, and a representative `failure`
      envelope.

## Raw-exit is a narrow exemption (ADR 0015)

`rawCommand` / `isRawExit` opts out of the envelope, `resultSchema`, and
`--json-schema`. It is sanctioned **only** when the command's core contract is a
TUI, a streaming protocol, or process-control / third-party command passthrough.
Ordinary agent-facing, finite-result commands must use the Clinkr envelope; do not
reach for `rawCommand` as a shortcut. Even a genuinely-raw command must map real
backend failures to exit `2`, never exit `1` (exit `1` is semantic non-success).

## Known Clinkr limitations (design around until an ADR lands)

- No framework compact/pagination/truncation/JSONL mode (ADR 0012 parked).
- No first-class danger-tier metadata type; tiers are authoring discipline, and
  `ClinkrInteraction.confirm` is the only confirmation primitive (ADR 0014).
- No typed `--confirm` phrase primitive; parked until a concrete command needs it.
- Commander-level (pre-handler) parse errors are not always enveloped in JSON
  mode (ADR 0011 accepted scope); the Zod/modeled-arg path is enveloped.
- First-class command aliases and a declarative dry-run convention are backlog.

When a rule needs one of these, state "design around until ADR/change lands" and
implement the behavior command-locally rather than pretending the API exists.

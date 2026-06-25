# Pre-ship checklist for a Clinkr command

The completion criterion for `sdl-cli-design`: a command's design is done only
when every box below is checked. Each maps to a rule in `SKILL.md`; a failure is
a design bug, not a style nit.

## The result envelope

- [ ] Success returns `ok(data)` with a typed result schema; that schema is the
      documented machine interface (`--json-schema` reflects it).
- [ ] Process exit stays coarse: `ok=0`, `negative=1`, `failure`/`usageError=2`.
      No `process.exit`, no richer numeric taxonomy (ADR 0010).
- [ ] Machine output is a camelCase discriminated envelope on `status`; no
      parallel snake_case/Python-parity shape (ADR 0011).
- [ ] `negative(...)` is reserved for shell-visible non-success; a harmless
      empty/no-op result returns `ok(...)` with empty data (ADR 0013).
- [ ] `failure`/`negative` carry structured `data`; `errorType` is a stable,
      disciplined per-command string with no global enum (ADR 0010).
- [ ] Invalid invocation returns `usageError(...)` whose `data` names the
      bad/missing argument, instead of throwing.

## Streams, help, output volume

- [ ] Primary/machine output → stdout; errors/logs/status/prompts → stderr.
- [ ] Concise default help + complete `-h`/`--help`; help, examples, and
      `--json-schema` agree.
- [ ] Large results are bounded per command (filters/limits/ranges/summaries);
      a bounded result exposes completion state, applied bound, and
      continuation/narrowing guidance (ADR 0012).
- [ ] No promise of `--compact`/pagination/JSONL the framework does not ship.
- [ ] Raw exit is used only for a TUI, streaming protocol, or process-control /
      third-party passthrough contract; ordinary finite agent-facing commands use
      the Clinkr envelope (ADR 0015).

## Danger tier (ADR 0014)

- [ ] Tier classified (0/1/2/3) and reflected in options and help text.
- [ ] Tier 2 destructive writes authorize non-interactively with `--yes`/`-y`;
      Tier 3 high-blast-radius ops with `--force`/`-f`. `--yes` and `--force`
      are not synonyms.
- [ ] Every interactive prompt gates behind `isInteractive()`; non-TTY callers
      never block.
- [ ] Non-interactive + missing authorization → `usageError` naming the missing
      flag. Refusal-by-impact → `negative` with impact data.
- [ ] If `--dry-run` is offered, it returns `ok(...)` with the computed plan,
      not `negative(...)`.

## Placement and tests

- [ ] Agent/skill-only operations live under a nested `exec` `ClinkrGroup`
      constructed with `isHidden: true`, with plain noun/verb operation names.
- [ ] Scenario tests cover the user-facing surface: when part of the contract,
      `--version`, `--runtime`, `-h`, plus machine output, a usage error, and a
      representative failure envelope (root `AGENTS.md` scenario convention).
- [ ] Targeted validation run; broadened when shared Clinkr/workspace config is
      touched. Record commands run and any unrelated blockers.

## Objective tracking

- [ ] If the change alters an Objective-relevant CLI design contract, record it
      via `objective-update` under `agent-cli-design-discipline`.

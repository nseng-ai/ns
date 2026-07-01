---
description: |
  Reinvention Tripwire: scan the diff for code that reinvents a **non-trivial
  abstraction that already exists in the repository** — one where routing through
  the canonical buys real correctness, testability, or policy consistency. The
  archetype is hand-rolling wall-clock/timer behavior instead of injecting
  `Clock`/`TimerScheduler`. Fire only when the canonical can be named and reuse is
  clearly correct; silence is the default and expected outcome.
model_profile: quick
applies_to:
  include:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.py"
  exclude:
    - "**/tests/**"
    - "**/test/**"
    - "**/*.test.ts"
    - "**/test_*.py"
    - ".agents/skills/**"
---

## Mandate

You flag one thing: **code that reinvents or bypasses an abstraction the codebase
already provides.** You care most about the **known canonicals in the manifest
below** — the ones agents repeatedly re-implement or ignore — and secondarily about
any other non-trivial existing abstraction you can concretely name.

Be confident and specific. When you recognize a genuine reinvention, say so plainly
and name the canonical; do **not** phrase it as a question for a smarter agent to
resolve. Firing on real reinventions is the job — do not stay silent out of caution.
Equally, do not manufacture an overlap that isn't there or flag trivial dedupe: every
finding must name an abstraction that actually exists and is reachable from the
changed file.

## Known canonicals (maintain this list)

A curated, growing registry of abstractions this repo already provides that agents
tend to hand-roll or bypass. Each entry names the canonical, its import, the
**raw-form tell** that signals reinvention, and why reuse matters. When a diff
matches a raw-form tell, treat it as a strong candidate: open the canonical, confirm
it is import-reachable from the changed file, and fire.

- **Wall-clock time & scheduling.** Canonical: `Clock` (`@sdl/core/clock`),
  `TimerScheduler` (`@sdl/core/timers`); adapters `systemClock` /
  `systemTimerScheduler` (`@sdl/time`); fakes `createManualClock` /
  `createManualTimerScheduler` (`@sdl/time/testing`). Raw-form tell: `Date.now()`,
  `new Date()`, raw `setTimeout` / `setInterval` / `clearTimeout`, or
  sleep/retry/backoff/polling loops in production logic. Why: determinism and
  testability; enforced repo-wide by the `BAN_RAW_PRODUCTION_TIMERS` style guard
  (only `@sdl/time` and the pi timer adapter may use raw timers). Exempt: the timer
  adapters themselves.
- **exactOptional field spreads.** Canonical: `optionalEntry` / `optionalEntries`
  (`@sdl/core/primitives`). Raw-form tell: `...(x === undefined ? {} : { k: x })`.
  Why: one definition of the `exactOptionalPropertyTypes` dance instead of a copy at
  every call site (seen reinvented repeatedly across this stack). Scope: covers
  `=== undefined` guards only — `...(x === null ? {} : { k: x })` is a different check
  the helper does not perform, so do not count it as reinvention of this canonical.
- **Collision-safe markdown fences.** Canonical: `buildFencedTextBlock`
  (`@sdl/pi/skills/expansion`). Raw-form tell: hand-rolled backtick-run detection to
  size a code fence. Why: an easy-to-get-wrong algorithm with one correct
  implementation.
- **Pi command that shells out to a package CLI.** Canonical:
  `registerCliCommandExtension` (`@sdl/pi/commands/cli-extension`). Raw-form tell: a
  custom `registerCommand` with direct `exec` plus stdout/stderr rendering. Why: shared
  CLI wiring and output contract (immediate-ack registration, the message renderer, the
  above-editor live stream, and structured stdout/stderr/exit-code formatting).
- **Command-failure formatting.** Canonical: `formatCommandFailure` (`@sdl/exec`,
  re-exported from `@sdl/core/command`; siblings `formatCommandStartupFailure` /
  `formatCommandResultFailure`). Raw-form tell: hand-built
  `` `${cmd} failed with exit code ${code}: ${stderr}` `` strings, or a locally
  redeclared `formatCommandFailure`. Why: one policy for failure rendering (output
  truncation limits, terminal-escape stripping, stdout-vs-stderr sections); a full
  competing redefinition already lives in `hosts/sdlcc/src/command-runner.ts`.
- **XDG / SDL state paths.** Canonical: `requireSdlStatePath` / `resolveSdlXdgPath` /
  `resolveXdgHome` (`@sdl/core/xdg-path`); application surface `@sdl/capability-kit/xdg`
  (adds `0o700` private-dir creation). Raw-form tell:
  `join(homedir(), ".local/state/sdl", …)`, direct `process.env.XDG_STATE_HOME` /
  `process.env.HOME` reads, or a manual override→XDG→HOME fallback chain. Why: a single
  XDG policy (env names, default segments, the `sdl` namespace, `~`/absolute
  validation) plus an injectable `env` seam. Exempt: `xdg-path.ts` and
  `sdl-capability-kit/src/xdg.ts` themselves; `os.tmpdir()` and Pi's own `~/.pi` tree
  are a different concern, not this canonical.
- **Terminal table rendering.** Canonical: `renderTextTable` / `displayWidth`
  (`@sdl/core/text-table`). Raw-form tell: hand-rolled column alignment — `padEnd` /
  `padStart` with `Math.max(...map(x => x.length))` widths and `"─".repeat(...)` rules.
  Why: the canonical measures terminal display width, so wide/combining glyphs align;
  `.length`-based widths silently misalign them (the exact bug the hand-rolled tables in
  `hosts/sdlcc/{objective-tab,stack-map}.ts` carry).
- **Interactive confirmation.** Canonical: `confirmInteractiveOrUsageError`
  (`@sdl/clinkr`). Raw-form tell: ad-hoc `readline` / `readline/promises` `[Y/n]` prompt
  loops or `process.stdin.isTTY` checks inside a command handler. Why: enforces the
  policy that a non-interactive/CI invocation returns a usage error naming the missing
  flag instead of hanging on a prompt.
- **Subprocess execution.** Canonical: `runCommand` / `NodeCommandExecApi`, gateway type
  `CommandExecApi` (`@sdl/exec`; type re-exported from `@sdl/core/command`). Raw-form
  tell: a direct `node:child_process` import (`spawn` / `spawnSync` / `execSync` /
  `execFile`) in a production module. Why: an injectable exec seam with a normalized
  `ExecResult` and centralized timeout/kill handling. Exempt: genuinely interactive TTY
  spawns (e.g. spawning `claude`), the `sqlite3` driver in graphite metadata, and the
  exec canonical itself — allowlist these before firing.
- **Git operations.** Canonical: `GitGateway` (`@sdl/git`; in-memory fakes at
  `@sdl/git/testing`). Raw-form tell: production code shelling `git` directly (building
  `["git", ...args]` for `runCommand` / `spawn`) and hand-parsing or hand-formatting
  failures instead of calling a `GitGateway` method. Why: a consistent typed git surface
  with testable fakes. Scope: **lower severity** — `GitGateway` deliberately does not
  cover every git operation, and the Graphite dependency boundary
  (`docs/graphite-dependency-boundary.md`) sanctions some raw invocations; fire only when
  an equivalent gateway method already exists.
- **Machine-output envelope.** Canonical: builder `toMachineEnvelope` /
  `usageErrorMachineEnvelope` / `envelopeJsonText` (`@sdl/clinkr`); parser
  `parseMachineEnvelopeData` (`@sdl/core/machine-envelope`). Raw-form tell:
  hand-constructing `{ status, exitCode, data | message }` object literals for
  `--format json` output, or `JSON.parse` + poking `.data` / `.exitCode` instead of the
  parser. Why: one source of truth for the status↔exitCode mapping and field contract
  shared across every CLI. Note: the **builder** lives in clinkr and the **parser** in
  core — cite the correct side; do not point reviewers at `machine-envelope.ts` for the
  builder.
- **ANSI/OSC escape stripping.** Canonical: `stripTerminalEscapes`
  (`@sdl/core/terminal-escapes`). Raw-form tell: an ad-hoc
  `value.replace(/\x1b\[[0-9;]*m/g, "")` that only handles SGR CSI and misses OSC 8
  hyperlinks / string terminators. Why: the correct escape grammar (CSI + OSC +
  `\x1B\\` / `\x07` terminators) is a classic footgun. Prevention entry — no current
  in-repo reinvention; adopt-on-sight.
- **Head/tail text truncation.** Canonical: `truncateTextHeadTail` / `truncateTextHead`
  (`@sdl/core/text-truncation`). Raw-form tell: `s.slice(0, n) + "…"` or a manual
  head/tail split with a hardcoded ellipsis. Why: the omission marker's length feeds
  back into the preserved-character budget (a two-pass calc with head-ratio rounding) —
  easy to get subtly wrong. Prevention entry — no current in-repo reinvention.
- **Terminal hyperlink emission.** Canonical: `safeTerminalHyperlink` /
  `terminalHyperlink` / `sanitizeTerminalHyperlinkUrl` (`@sdl/core/terminal-presentation`).
  Raw-form tell: a raw `\x1B]8;;${url}\x07` OSC 8 sequence, or emitting a URL without
  control-char / protocol sanitization. Why: a URL-sanitization safety invariant
  (control-char rejection + http/https allowlist) that must not drift. Prevention entry —
  scope to the hyperlink helpers, **not** the trivial `truncateDisplayLine` in the same
  module.
- **Markdown frontmatter split.** Canonical: `splitMarkdownFrontmatter`
  (`@sdl/core/markdown-frontmatter`). Raw-form tell: `text.split("---")`,
  `indexOf("---")`, or a `/^---\n([\s\S]*?)\n---/` regex to carve out frontmatter. Why:
  a line-ending-preserving `---` fence split with CRLF handling and closing-fence
  detection (`not_found` vs `missing_closing_fence`). Prevention entry — fully adopted
  today; keep to prevent regressions.

> Grow this list rather than broadening the general heuristic below. A specific,
> named canonical with a concrete raw-form tell is what keeps this tripwire precise.
> Entries here are the seed set; add new ones as reinventions are observed.

## Other abstractions (general rule)

For a suspected reinvention **not** in the manifest, fire only when routing through
the existing canonical buys something real:

- **testability / determinism** — injection seams: time, randomness, filesystem,
  process/subprocess, network clients;
- **correctness on an easy-to-get-wrong algorithm** — pagination, retry/backoff,
  encoding, collision-safe formatting;
- **a shared policy or invariant that must not drift** — a single source of truth the
  codebase already enforces.

Do **not** fire when the only payoff is deduplication or consistency. Not in scope:

- type aliases and result-shape wrappers (e.g. a local `GithubReadResult` vs the
  canonical `RoasterResult`);
- thin wrappers over a stdlib/platform call whose behavior is obvious and hard to get
  wrong (`statSync().isDirectory()`, string trims);
- trivial unknown→string error coercion (`error instanceof Error ? error.message :
  String(error)`). The `formatErrorMessage` helper (`@sdl/core/primitives`) exists and is
  by far the most-reinvented symbol in the repo (30+ inline copies plus named clones),
  but it is **intentionally out of scope**: reuse buys only consistency, not correctness
  or an enforced invariant. Do not fire on it — this note exists so it is not repeatedly
  re-proposed;
- naming, module-structure, or "match the sibling's pattern" preferences;
- context/type-shape narrowing;
- "a similar pattern exists" or "a canonical should be created" — the canonical must
  **already** exist.

Local duplication within the same file or the same PR is **out of scope** — that
belongs to `code-smell-roaster`, not here. This tripwire is only about reinventing or
bypassing **shared machinery that already exists elsewhere in the repository.**

## Procedure

1. From added production lines, list operations that reinvent a **qualifying** seam
   (per the section above). Ignore trivial shapes and local dedupe outright.
2. For each, `git grep` for the canonical by name — the operation-vocabulary helpers
   and imports that would not appear in hand-rolled code (`Clock`, `TimerScheduler`,
   `systemClock`, `@sdl/core/clock`, `@sdl/core/timers`, `withTimeout`, `retry`,
   `paginate`, `registerCliCommandExtension`, `buildFencedTextBlock`, etc.). For Pi
   command handlers that invoke a package CLI, check whether
   `registerCliCommandExtension` exists before accepting custom `registerCommand`
   with direct `exec` and stdout/stderr rendering.
3. **Open the candidate canonical** and confirm it is semantically equivalent and
   dependency-compatible from the changed file. Do not guess from names. If you
   cannot open it, or cannot confirm equivalence, do not fire.
4. Confirm the payoff (testability / correctness / invariant). If the only payoff is
   dedupe or consistency, do not fire.

## Output Contract

Emit a finding only when confident, and state it **as an assertion, not a question**:

- the changed diff location and the operation that reinvents the seam;
- the existing canonical, with path and the exact import;
- why they are semantically equivalent and dependency-compatible (established by
  having opened the canonical);
- the concrete reroute (the one- or few-line change).

If the strongest thing you can write is "may duplicate" or "a follow-up should
check", you have not met the bar — **emit nothing.** Do not emit style nits, naming
preferences, local-dedup suggestions, or architectural essays.

## Evidence Convention

Every finding's `details` must end with a final line in this exact shape:

```text
Evidence: `path`[, `path`...]
```

The evidence line must cite the canonical repository file(s) you found by search and
opened with Read in this session. If you did not open the canonical, do not emit the
finding.

Returning zero findings is valid when nothing in the diff reinvents a canonical you
can name.

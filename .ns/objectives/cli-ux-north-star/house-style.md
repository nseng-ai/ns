# CLI side-effect house style

The single normative spec for how `sdl flow` (and peer) side-effect commands render
human-facing results and progress. It **consolidates** — does not supersede — the
signed-off `objective.md` surface language and the by-feel `updates/*.md` sign-offs, and
it pins down the choices the four already-ported renderers (`flow push`, `flow pull-trunk`,
`flow submit`, `flow cp`) made divergently so the next commands cite one source instead of
re-deriving the style.

Read this before porting any side-effect command. For stdout/stderr/exit-code *mechanics*
(not visuals) read `skills/sdl-cli-design/SKILL.md`; this spec owns the visual and
structural grammar only.

Scope: human-facing terminal output for side-effecting commands — finite git/Graphite
result blocks and live multi-phase progress. It does **not** cover buffered list/detail
surfaces (`objective list` is the reference there), machine `--format json` payloads, or
hidden `exec` surfaces.

## 1. Foundations: build only on the theme, never hand-rolled ANSI

All styling goes through the opt-in `@sdl/cli-theme` and `@sdl/clinkr/stream` subpaths.
Never emit raw SGR escapes or hand-roll color/glyph fallbacks — the theme already folds the
full caps ladder (truecolor → 256 → 16 → mono, unicode → ascii) for free, and the
import-boundary guard keeps these subpaths opt-in.

Theme vocabulary to build on (`@sdl/cli-theme`):

| Tool                          | Use                                                                     |
| ----------------------------- | ----------------------------------------------------------------------- |
| `paint(caps, intent, text)`   | Foreground color for a semantic intent; degrades to mono honestly.      |
| `bold(text)`                  | Emphasis that **survives mono** — load-bearing for headlines.           |
| `dim(text)`                   | Supporting/plumbing weight.                                             |
| `glyph(caps, name)`           | Status mark (`done`/`open`/`fail`/`skip`/`bullet`), unicode→ascii.      |
| `spinnerFrame(caps, tick)`    | Active-phase spinner frame (braille → `\|/-\`).                         |
| `resultBlockHeadline`         | Shared finite-block headline: bold + intent paint + result glyph.       |
| `renderResultBlock`           | Generic finite domain-authored block: headline/body/guidance/cwd.       |
| `statusLine({...})`           | One composed phase row (pending→active→done/skipped/failed).            |
| `renderTable` / `kv` / `cell` | Aligned tabular / key-value layout when a result has structured fields. |
| `truncatePlain` / `padPlain`  | Width-aware truncation/padding (visible-cell, not byte, width).         |

Caps are resolved through the clinkr IO / host-extension seam, never by sniffing `process.*`
inside a renderer:

- Finite commands resolve buffered caps via `resolveFlowStreamCaps(ctx)` (host caps hint →
  settled non-interactive caps for hosted/callback/pipe → real process caps for a direct
  attached TTY).
- Streaming commands resolve the same caps and wire sink seams with `flowStreamDeps(ctx, caps)`.

Renderers are **pure string builders**: they take `caps` + typed facts and return a string
(or drive the stream sink). They do no I/O and do no `process.*` access of their own.

## 2. The two output shapes and the decision rule

A side-effect command renders in exactly one of two shapes. Pick by the **nature of the
work**, not by taste:

- **Finite result block** (`@sdl/cli-theme` `renderResultBlock` for generic
  domain-authored outcomes; `shared/git-result-block.ts` layers git transcript plumbing
  around `resultBlockHeadline`). Use when the command runs one (or a few) git/Graphite
  subprocesses or reports a single settled domain outcome. The user sees the result, not
  the journey. `flow push` and `flow pull-trunk` use this; they deliberately ship **no
  live region** because their buffered subprocess evidence is sufficient.
- **Streaming phase progress** (`shared/phase-stream.ts` + `phase-stream-specs.ts` are the
  reference). Use when the command runs an ordered, multi-step workflow whose *journey* is
  worth watching — checkpoint, preflight, network round-trips, verification. `flow submit`
  and `flow cp` use this.

Decision rule: **one settled outcome → finite block; an ordered multi-step journey with
per-step progress → streaming.** When a command is borderline (a couple of fast
subprocesses), prefer the finite block — a live region earns its cursor ownership only when
there is genuine multi-phase progress to show. Do **not** force a streaming command through
`git-result-block.ts`, and do **not** synthesize fake phases to dress up a finite command.

## 3. Intent → glyph/color mapping

The semantic palette (signed off 2026-06-27; GitHub-derived intents, cyan `#22d3ee` brand
accent) and glyph set are fixed. Map command outcomes onto them as:

| Outcome       | Intent    | Glyph (`glyph` name) | Notes                                                   |
| ------------- | --------- | -------------------- | ------------------------------------------------------- |
| success       | `success` | `done` (`✓`/`v`)     | Headline only; concise body.                            |
| failure       | `error`   | `fail` (`✗`/`x`)     | Headline + promoted cause + dimmed plumbing/transcript. |
| refusal       | `warn`    | `fail` (`✗`/`x`)     | A guardrail declined to run; not a subprocess failure.  |
| active phase  | `accent`  | spinner              | Streaming only.                                         |
| done phase    | `success` | `done`               | Streaming only; settled detail dimmed.                  |
| skipped phase | `muted`   | `skip` (`–`/`-`)     | Streaming only.                                         |
| pending phase | `muted`   | `bullet` (`•`/`*`)   | Streaming only; whole row dimmed.                       |

`open` (`●`/`o`) is the status-dot glyph (open objective / submitted-PR dot); it is not a
side-effect outcome marker. Note the deliberate distinction: `open` (`●`) is heavier than
the `bullet` (`•`) pending marker — do not swap them.

Headline convention (both shapes): **bold + intent-paint + leading status glyph**, via
`resultBlockHeadline(caps, { kind, headline })` for finite blocks. The underlying invariant is:

```ts
bold(paint(caps, "success", `${glyph(caps, "done")} ${headline}`));
```

The headline is the one strongly-colored line; everything below it leans on weight (normal vs dim), not more
color. Bold is applied unconditionally because it survives mono, where color is gone and the
glyph + bold carry the whole signal.

## 4. The finite result block

Reference: `@sdl/cli-theme` `renderResultBlock` for generic domain-authored finite blocks, and
`ts/packages/capabilities/flow/src/shared/git-result-block.ts` for git/Graphite subprocess blocks
that need local command/cwd/exit/transcript/cause plumbing. Three kinds: `success`, `failure`,
`refusal`.

### Success — stay concise

A successful side effect shows: the bold success headline, an optional normal-weight
`guidance` line ("what happened / what to do next"), and **dimmed** `Command:` / `Cwd:`
evidence. That is all.

- **Do not** print exit code, killed flag, or stdout/stderr transcripts on success. Those
  are failure/debug evidence, not routine success UI (live review of `flow pull-trunk`
  settled this — see `updates/2026-06-27-flow-pull-trunk-result-block.md`).
- Keep the headline a single already-phrased prose line. Structured fields (new branch,
  moved commit, etc.) belong in the body via `kv`/normal-weight lines, not stuffed into the
  headline.

### Failure — three visual tiers

A failure reads in three tiers so the actionable cause stands out without drowning in red:

1. **Headline** — bold + `error` + `✗`. The only red line.
2. **Cause lines** — the salient transcript lines at **normal foreground weight** (not
   error-colored: error-coloring them was tried by feel and rejected as too much red — see
   `updates/2026-06-27-flow-submit-failure-tiers.md`). These brighten the real cause out of
   the dimmed noise.
3. **Plumbing + transcript** — `Command:` / `Cwd:` / `Exit:` / `Killed:` and the full
   stdout/stderr transcript, all **dimmed** as supporting context.

### Refusal — guardrail declined, no subprocess ran

A `warn`-intent `✗` headline, then the actionable detail at **normal weight** under a dimmed
`stdout:` label (the porcelain status — e.g. which paths are dirty — is the actionable
content, so it is not dimmed with the plumbing), then dimmed `Command:` / `Cwd:` evidence.
Refusal is a first-class kind: a guardrail that declined to run is **not** a subprocess
failure and must not be rendered as one (red `error`). This is the reconciliation of the
"refusal kind exists only in git-result-block" divergence — see §7.

## 5. The streaming phase surface

Reference: `phase-stream.ts`, `phase-stream-renderer.ts`, `phase-stream-specs.ts`,
`status-line.ts`. A streaming command declares an ordered `PhaseSpec[]` and drives a
`PhaseStream` (`begin(title)` → `emit(event)` / `note(text)` / `fail()` → `finish()`).

Structure of a frame:

- **Bold title** at the top (e.g. `sdl flow submit`) — streaming surfaces carry a title;
  finite blocks do not.
- **One status line per phase**, each a two-tier `label`/`detail` pair:
  - `label` is the IN-FLIGHT text, shown while the phase is active (and reused as the cause
    when failed). Phrase it as a present participle — `"checking submit readiness…"`.
  - `detail` is the SETTLED text, shown dimmed once the phase reaches done/skipped —
    `"ready to submit"`. When a phase does not distinguish the two, omit `label` and the
    line reuses `detail` in every state.
- **Dimmed truncated tail line** under the active phase: the latest raw subprocess line
  (`stream.note(...)`), `dim` + `truncatePlain` to the region width. This is the log-tail.

Behavior:

- **In-place only on a TTY** (`log-update` live region; spinner → `✓`; settled frame
  persists as scrollback). Append was dropped from the design entirely (see
  `updates/2026-06-27-streaming-default-inplace.md`).
- **Settled non-TTY frame** for Pi/callback/pipe/CI: one static settled frame with per-phase
  transients routed through `onOutput`/the host live channel — **zero cursor escapes**. This
  is wired by `flowStreamDeps`; do not write to `process.*` directly.
- **The raw transcript rides INSIDE the live region** as the tail line via `stream.note`, so
  the sink's writer stays the sole owner of stdout. Writing the transcript straight to the
  context desyncs `log-update` and scrolls/duplicates the region. Non-TTY keeps streaming the
  transcript to the context.
- **Spinner repaints independently of step duration** (~90ms cadence) so a long network step
  keeps animating instead of freezing on one glyph. The dwell-weighting model (network steps
  linger ~2.6× local steps) is a property of real subprocess timing, not something the
  renderer fabricates — see `updates/2026-06-27-streaming-cadence.md`.
- **Result payloads print as scrollback below the settled region** after `finish()` — the
  checkpoint summary, then the success text or interpreted failure.

## 6. Caps degradation — handled by the theme, verified by the command

Because all rendering goes through the theme, degradation is automatic: truecolor → 256 → 16
→ mono drops color (mono keeps `dim` for muted hierarchy and leans on bold + glyph), and
unicode → ascii swaps the glyph/spinner/rule sets. A command author does **not** write ladder
branches.

What a command author **does** owe: verify degradation in tests (truecolor and mono paths,
unicode and ascii glyphs) via `stripAnsi` for human-text assertions plus focused renderer
unit tests for style/caps behavior, and never bypass the theme with a literal escape that
would skip the ladder.

## 7. Reconciled divergences

The four ported renderers diverged. Each divergence below is resolved here as a normative
rule or an explicit command-discretion call. Later PRs follow these; a PR that must deviate
**amends this spec in the same PR** rather than silently forking.

### 7.1 Failure-detail strategy — cause-marker extraction is the default

Three strategies exist in prior art: marker extraction (`git-result-block` scans for
`error:`/`fatal:`/`rejected`/`not fast-forward`/`denied`), LLM interpretation (`flow submit`
sends the transcript to a model for a written diagnosis), and direct message (`flow cp`
returns a domain-authored string).

**Normative default — finite git/Graphite blocks use cause-marker extraction.** Promote
salient transcript lines to normal weight via the marker list; keep the rest dimmed. The
marker list is extended per observed need (pull-trunk added `not fast-forward`/`denied`); keep
matching conservative and local.

**Discretion — LLM interpretation is allowed only for streaming subprocess failures whose raw
transcript is large and unstructured** (the `gt submit` case), where a model diagnosis plus a
raw-log path genuinely beats marker extraction. It is **not** the default; a command choosing
it must (a) still fall back to the original stderr when the model is unavailable/empty, and
(b) write the raw transcript to a private log file and surface only the path. Do not reach for
LLM interpretation for ordinary finite git results.

**Direct message** is correct when the failure is already a typed, domain-authored string with
no subprocess transcript to mine (e.g. "Working tree is clean; nothing to checkpoint."). Use
it for guardrail/domain failures; use marker extraction when there is a real `ExecResult`.

### 7.2 Transcript handling — inline vs file-with-path vs omit

- **Success: omit.** No transcript on success, ever (§4).
- **Finite failure: inline, dimmed.** The full stdout/stderr transcript prints dimmed below
  the promoted cause lines. Finite git transcripts are small enough to read in place.
- **Streaming failure with a large raw transcript: file-with-path.** When the transcript is
  large/unstructured (the `flow submit` case), write it to a private (`0700`) log file and
  surface only `Raw log: <path>`. This pairs with 7.1's LLM-interpretation discretion.

The deciding factor is transcript size/structure, not command identity: a small finite git
failure inlines; a large streaming subprocess transcript goes to a file.

### 7.3 Refusal kind — first-class, not a failure

`refusal` is a first-class outcome (warn intent), distinct from `failure` (error intent). A
guardrail that declines to run (clean worktree, dirty worktree, trunk branch, missing
confirmation channel) is a refusal and renders warn, with actionable detail at normal weight
and a pointer to the right command where one exists. Do not render a refusal as a red failure,
and do not collapse it into success. Finite commands use the `git-result-block` `refusal`
kind; streaming/domain commands that return a typed guardrail result render the equivalent
warn headline + actionable detail.

### 7.4 Title presence — streaming yes, finite no

Streaming surfaces carry a bold title (`sdl flow submit`). Finite result blocks do **not** —
their bold headline is the title. Do not add a separate title line to a finite block.

### 7.5 Guidance line — optional, normal weight

The finite block's `guidance` ("what to do next" / "no full gt sync was run") is optional and
rendered at normal weight after the cause/detail. Include it when there is genuinely useful
next-step or scope-clarifying information; omit it rather than padding with restatement of the
headline.

## 8. Routing and mechanics (cross-reference)

Visuals are this spec's concern; routing is `skills/sdl-cli-design/SKILL.md`'s. The
load-bearing mechanics these renderers assume:

- Successful human result → **stdout** via `ok(...)`; refusal/failure/cancellation → **stderr**
  via `failed(...)`. The rendered house-style block is the argument to `ok`/`failed`.
- Transient progress → `onOutput` / `CommandIo`, never `process.*` from a renderer.
- Exit codes preserve existing per-command semantics (these `sdl-sdk` extension commands keep
  `ok(...)`/`failed(...)`; this work does not convert them to Clinkr envelopes). No raw exit.
- No new machine output contract is introduced for these side-effecting commands; the human
  surface may evolve freely.

## 9. Porting checklist

For a cold subagent porting a command from this spec alone:

1. Resolve caps via `resolveFlowStreamCaps(ctx)` (+ `flowStreamDeps` for streaming).
2. Pick the shape by §2's rule (one settled outcome → finite; ordered journey → streaming).
3. Build the headline bold + intent-paint + glyph per §3.
4. Finite: concise success (§4); three-tier failure with marker-extracted causes (§4, §7.1);
   warn refusal as a first-class kind (§4, §7.3). Streaming: title + `label`/`detail` phase
   specs + log-tail (§5).
5. Transcript: omit on success; inline-dimmed on finite failure; file-with-path on large
   streaming failure (§7.2).
6. Route stdout/stderr via `ok(...)`/`failed(...)` (§8); keep transient progress on
   `onOutput`/`CommandIo`.
7. Test the success/failure/refusal paths under `stripAnsi` plus focused caps/renderer units
   (§6); preserve existing safety/semantics.
8. Update Objective tracking (audit status, roadmap note, a new Semantic Update).

If this spec lacks an answer the port needs, resolve it with evidence and **amend this spec in
the same PR** — do not fork the style silently.

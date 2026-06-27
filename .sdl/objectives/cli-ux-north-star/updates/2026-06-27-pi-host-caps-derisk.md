# Derisk: running the commands inside Pi (host caps must flow through the IO seam)

## Summary

Derisked the experience of running these commands **inside Pi**, where wrapper extensions invoke the
same domain logic in-process rather than as a TTY subprocess. Traced the real seam
(`packages/hosts/pi/src/commands/cli-extension.ts`): Pi registers slash-commands via
`registerCliCommandExtension` and calls `runCli(argv, deps)`, filling `CliCommandRunDeps` with
**callback** `stdout`/`stderr`, an optional `onOutput` (transient live-progress → widget), and an
async `confirm`. Two patterns exist: in-process (flow commands) and subprocess via `pi.exec`
(`objective list` today). Pi's output surface is **append-only, plain text, no ANSI rendering, no
in-place re-render, and provides no column width**; progress streams through `onOutput` to a widget,
final output becomes a structured custom message.

**Verdict: the signed-off north star is Pi-compatible.** non-TTY-settles-to-one-frame, in-place-only
streaming, mono honesty (glyph carries meaning), and unicode glyphs all land correctly in Pi. The
only real risk is in the *wiring*, and it is load-bearing for the upcoming theme/stream rows.

## The load-bearing constraint (caps wiring rule)

Today `canEmitAnsi: false` under Pi is inferred by `resolveIo`'s heuristic — "a stdout override is
present, so this is a redirected sink" — **not** by sniffing `process.*`. In the **in-process** Pi
path, `process.stdout.isTTY` / `.columns` / `COLORTERM` describe **Pi's host terminal, not the
rendering region**, so they are actively wrong. If the theme/stream rows resolve caps via
`resolveProcessCaps()` at the CLI entry, they bypass the override mechanism and reintroduce the bug
the io heuristic already solved — a Pi command could believe it is on a truecolor TTY and fire the
`log-update` in-place renderer into an append-only surface.

Therefore:

- **Caps flow through the same host-override seam as IO, never resolved independently from
  `process.*`.** When a sink override is present (Pi, pipe, test), the CLI entry defaults to settled
  non-interactive caps `{ isTty: false, colorDepth: "none", columns: DEFAULT_COLUMNS, unicode: true }`
  unless the host explicitly supplies richer caps. `resolveProcessCaps()` is used **only** for the
  real `process.stdout`.
- **The `stream` sink degrades to the settled frame whenever `!caps.isTty` (no motion)**, routing
  per-phase lines through `onOutput`/`phaseTransient` — the path Pi's widget already consumes. This
  makes the deferred cursor-ownership risk a non-issue under Pi by construction.
- This is why the core foundation was built as a **pure `resolveCaps(snapshot)` over an injected
  `CapsEnv`** with the `process` reader (`readProcessCapsEnv`) split out: the in-process Pi path can
  hand in its own snapshot (or a settled `Caps`) instead of sniffing. The foundation already supports
  host injection; the risk lives entirely in how the next rows wire it.

## Objective Impact

- The clinkr core capability foundation row is **done** and is Pi-safe as-is: it sniffs nothing on
  its own (pure resolver + separable process reader).
- The **stream** row gains a hard requirement: branch on `caps.isTty` and degrade to the settled
  frame + `onOutput` lines under a callback/redirected sink; never run `log-update` when there is no
  cursor to own.
- The **rebuild** row gains a hard requirement: the CLI entry resolves caps through the IO override
  seam (callback sink → settled non-interactive caps), not via `resolveProcessCaps()`.
- The Parked "UI-bridge caps override" item is promoted from "maybe later" to **the seam the stream
  row targets**: at most one optional caps hint on the command seam (`CliCommandRunDeps` /
  `SdlExtensionApi`) so the in-process Pi path can be precise (e.g. unicode-rich plain frames, region
  width). It stays a single optional field; `SdlExtensionApi` is not otherwise grown.

## Follow-Ups

- Build the `theme` + `stream` rows against the caps wiring rule above; add the optional caps hint to
  the command seam when the stream row needs it (not before).
- `CliCommandRunDeps` currently has no caps field — that is the extension point to add, minimally,
  at the stream/rebuild step.

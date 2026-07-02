# Decision records landed; npm plan simplified to the @ji scope

## Summary

Authored and landed the rename decision records: ADR 0024
(`docs/adr/0024-rename-sdl-to-ji.md`) recording the sdl→ji rename, the hard-cutover
stance, rejected alternatives (sdl, asdl, erk, jib), accepted collisions, the
lowercase-always rule (including sentence starts), and the npm plan; and the naming brief
(`docs/ji-naming-brief.md`) carrying the marketing spine ("Engineers are not factory
managers; they are sorcerers"), the name-origin story (jib displaced on sight by ji: loop
variables, djinn homage, two-letter-CLI aesthetic per `uv`/`ty`), pronunciation ("jee"),
and usage rules. Re-recorded `checkout-free-sdl-distribution`'s publish-name open
question as resolved by this Objective.

During the authoring session the npm plan changed: **no dispute** is filed for the
squatted unscoped `ji` slug (abandoned 2013 v0.0.0 placeholder — now just another
accepted collision). Instead, publish under the **`@ji` scope** registered as an org
owned by the `schrockn` npm account; the CLI bin installs as `ji` regardless of inner
package
name, which stays `checkout-free-sdl-distribution`'s call. Registry evidence as of
2026-07-02: no npm user `ji`, zero packages under the scope.

## Objective Impact

- Decision-records roadmap row complete.
- Dispute roadmap row replaced by a one-shot owner action: create the `ji` org on npm.
- The external long pole (weeks-long dispute) is eliminated; nothing about the rename
  waits on external parties.
- Completion criterion and assumption rewritten for the `@ji`-scope plan, with
  `@nseng-ai/ji` retained only as the fallback if the scope turns out taken.
- Open questions resolved: ADR number/filename (0024); `@ji` scope claimability (now the
  plan, backed by registry evidence and the fallback).

## Follow-Ups

- Owner: create the `ji` org under the `schrockn` npm account and record it.
- Next semantic slice: the core cutover landing window (bin, `.sdl/` → `.ji/`, `/ji:*`,
  XDG, kernel/tooling paths, `cross-harness-parity` table).

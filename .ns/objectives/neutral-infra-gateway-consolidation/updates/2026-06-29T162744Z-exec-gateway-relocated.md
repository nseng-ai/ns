# Semantic Update — exec gateway relocated out of @sdl/core

## Summary

The raw process-execution door `@sdl/core/exec` is removed. Real child-process execution now lives
in a new standalone package `@sdl/exec`; the pure command types and formatting/normalization helpers
live in the new neutral `@sdl/core/command` subpath. `@sdl/core` no longer performs or exposes raw
process spawning.

## What changed

- New `@sdl/core/command` (neutral-infra) owns the pure command surface: `ExecResult`/`ExecOptions`/
  `CommandRunner`/`CommandExecApi`/`StdinCapableCommandExecApi`/Pi-adapter types and the pure helpers
  (`formatCommand*`, `tailText`, `formatOutputSection`, `normalizeExecResult`, `runNormalizedExecResult`,
  `commandSucceeded`, `execApiToCommandRunner`, `piExecApiToCommandExecApi`, etc.). No I/O.
- New `@sdl/exec` package owns the real Node adapter only: `runCommand`, `NodeCommandExecApi`,
  `defaultCommandResolver`. It depends on `@sdl/core` and `export *`s `@sdl/core/command`, so consumers
  get one ergonomic door.
- `@sdl/core/exec` source file and `./exec` package export are deleted.
- `sdl-sdk` keeps only its minimal structural `ExecResult` and `ctx.exec` option/stream/extension
  types. Public re-exports of command-formatting/evidence helpers and `withTemporaryFile` were
  removed from the SDK surface; the kernel virtual `sdl-sdk` module and SDK reference docs were
  narrowed to match. (`@sdl/core/temp-files` itself was NOT relocated — only its SDK re-export.)
- Two `@sdl/core`-internal command gateways that defaulted to the real adapter now require injection
  so core stays free of process I/O: `RealGithubPrFeedbackGateway` (runner is required) and the
  `DroppingOptionsCommandExecApi` test helper (delegate is required). Their few default-relying call
  sites now pass `runCommand`/`new NodeCommandExecApi()` from `@sdl/exec`.
- Real-adapter integration tests live under `@sdl/exec/test/integration`; pure-helper tests moved to
  the kit unit suite.

## Tier decision (deviation from ADR 0019/0020 wording)

ADR 0019 anticipated `ExecResult`/formatting stabilizing at the SDK/kit boundary and ADR 0020 listed
`exec` as a candidate `capability-gateway-backend` (peer of `@sdl/git`/`@sdl/graphite`/`@sdl/cmux`).
Implementation chose a different, cleaner placement:

- The pure command layer stays **neutral** (`@sdl/core/command`) because a dependency cycle is
  otherwise unavoidable (`@sdl/exec` depends on `@sdl/core`, so `@sdl/core` cannot depend on
  `@sdl/exec`) and because neutral consumers (`@sdl/core` internals, `@sdl/brmem`), the `sdk`
  (`@sdl/kernel`), and `local-pi-tool` packages all need these helpers/types and can only legally
  reach a neutral package.
- `@sdl/exec` is tiered **`neutral-infra`**, not `capability-gateway-backend`. `exec` is the
  foundational execution primitive the domain gateways build on (`@sdl/git`/`@sdl/graphite`/`@sdl/cmux`
  call `runCommand`), so it belongs at the foundation rather than as their peer. A neutral home makes
  it universally dependable, which removes all per-package debt edges, local duplicate copies, and
  host-injection workarounds that a backend tier would have forced on the neutral/sdk/local-pi-tool
  consumers. `@sdl/exec` is registered in the style guard's `neutralPeerPackageNames`.

This keeps the Objective's intent — remove raw process I/O from `@sdl/core` — while avoiding triple
duplication of pure formatting logic. A future ADR refinement may record the neutral placement of the
execution primitive explicitly.

## Source-search proof

```text
$ rg -n 'from "@sdl/core/exec"|@sdl/core/exec' ts/packages ts/scripts -S --glob '*.ts'
# (no live import sites)

$ rg -n '"./exec"' ts/packages/infra/core/package.json
# (no export)

$ test -f ts/packages/infra/core/src/exec.ts
# (deleted)

$ rg -n '@sdl/capability-kit/exec' ts -S
# (none — no kit exec seam was introduced)
```

## Validation

`just ts-deps-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`
(3626 passed), and `just ts-test-integration` (175 passed) all pass.

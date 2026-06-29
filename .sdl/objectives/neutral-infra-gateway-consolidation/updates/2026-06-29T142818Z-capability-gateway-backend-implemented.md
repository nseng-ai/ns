# Semantic Update — Capability Gateway Backend implemented

## Summary

ADR 0020's Capability Gateway Backend tier is now realized in code for the Git/Graphite/cmux slice.

## What changed

- `@sdl/git`, `@sdl/graphite`, and `@sdl/cmux` declare `sdl.tier: "capability-gateway-backend"`.
- The TypeScript style guard recognizes `capability-gateway-backend` and proves the intended direction:
  - backend → kit is rejected;
  - kit → backend is allowed;
  - neutral-infra/sdk → backend is rejected;
  - backend → neutral-infra and backend → backend are allowed.
- `@sdl/git` owns the canonical Git gateway contract (`GitGateway` plus result/error/parameter types) and exports it from the package root.
- `readLocalBranchRefs` and its supporting local-ref-reader types moved from `@sdl/capability-kit/git` to `@sdl/git`.
- `@sdl/capability-kit/git/testing` remains the fake surface and imports the contract from `@sdl/git`.
- `@sdl/capability-kit/git` no longer carries temporary contract re-export shims; it keeps kit-owned helper/value exports such as worktree parsing and SDL CLI Git helpers.
- `@sdl/graphite` imports `readLocalBranchRefs` from `@sdl/git` and no longer depends on `@sdl/capability-kit`.
- `@sdl/git` no longer depends on `@sdl/capability-kit`.

## Source-search proof

```text
$ rg -n 'from "@sdl/capability-kit/git"' ts/packages -S --glob '*.ts'
```

Remaining hits are kit-owned helper/value imports or tests only: `createSdlCliExecAdapter`, `execSdlCommand`, `execSdlGit`, `readSdlGitPorcelainStatus`, `parseGitWorktreePorcelain`, `planLocalBranchRefreshFromWorktrees`, plus a style-guard fixture. No contract-only imports remain.

```text
$ rg -n 'from "@sdl/capability-kit/git/testing"' ts/packages -S --glob '*.ts'
```

Hits remain intentionally for `InMemoryGitGateway` fake usage.

```text
$ rg -n 'from "@sdl/git"' ts/packages -S --glob '*.ts'
```

The command reports 77 Git backend imports, including contract type imports, `RealGitGateway`, and the graphite local-ref-reader import.

```text
$ rg -n '"@sdl/capability-kit"' ts/packages/infra/git/package.json ts/packages/infra/graphite/package.json ts/packages/cmux/package.json || true
```

No backend package manifest depends on `@sdl/capability-kit`.

```text
$ rg -n '"tier": "capability-gateway-backend"' ts/packages/infra/git/package.json ts/packages/infra/graphite/package.json ts/packages/cmux/package.json
ts/packages/infra/git/package.json:21:    "tier": "capability-gateway-backend"
ts/packages/infra/graphite/package.json:27:    "tier": "capability-gateway-backend"
ts/packages/cmux/package.json:26:    "tier": "capability-gateway-backend"
```

## Validation evidence

PR-slice validations passed during implementation:

- `pnpm --dir ts --filter @sdl/git run check`
- `pnpm --dir ts --filter @sdl/git run test`
- `pnpm --dir ts --filter @sdl/capability-kit run check`
- `pnpm --dir ts --filter @sdl/capability-kit run test`
- `pnpm --dir ts --filter @sdl/graphite run check`
- `pnpm --dir ts --filter @sdl/graphite run test`
- `pnpm --dir ts --filter @sdl/cmux run check`
- `pnpm --dir ts run check`
- `pnpm --dir ts run test`
- `pnpm --dir ts run test:integration -- packages/infra/core/test/integration/typescript-style-guard.test.ts`
- `pnpm --dir ts run deps:check`
- `pnpm --dir ts run fmt:check`

## Still open

This does not complete the broader neutral-infra Objective. The `exec` gateway, GitHub gateways, SDK-provided services, runtime harness residuals, and final purity proof remain separate roadmap rows. `@sdl/brmem` remains parked for separate SDK-provided relocation work; this slice only repointed its Git contract type imports as needed.

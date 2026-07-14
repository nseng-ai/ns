# Dispatch deployment contract

## Ownership

This living reference owns the current deployment-artifact contract for
`@nseng-ai/vercel`: project roots, Build Output composition, API runtime closure, Workflow
consumer inventory, local validation, relocation, promotion, and post-promotion checks.

User-facing setup remains in `README-draft.md`. Vercel incident chronology and vendor
feedback remain in `vercel-workflow-deployment-feedback-report.md`. Witnessed deployments
and runs are recorded in `dispatch-live-evidence.md`.

## Current verified state

Production deployment `dpl_He9jnMkZmH7fTYg9K3DcHp1mKbds` was promoted from this durable
contract on 2026-07-14. Its stable alias is `https://ns-dispatch.vercel.app`. The promoted
inventory contained all four API functions and the then-current Workflow artifacts. Hello
run `wrun_01KXFYJS9N6D2JNTKA6D3B2MYP` completed on that deployment. The production command
below is implemented locally but has not yet produced newer live evidence.

## Project and command roots

The Vercel project's configured Root Directory is:

```text
ts/packages/capabilities/vercel
```

Package-local operations run there because it owns `.vercel/project.json`, `.env.local`,
`vercel.json`, package dependencies, workflows, and `pnpm build:deployable`:

- `vercel link`;
- `vercel env pull .env.local --environment=development`;
- `pnpm build:deployable`;
- Workflow CLI inspection and controlled package-owned probes.

The final prebuilt production deployment runs from the repository boundary. The canonical
command builds, verifies, fingerprints, and transactionally promotes the complete
package-local output before invoking Vercel from that boundary:

```sh
just dispatch-deploy-prod
```

On success it verifies that the stable production alias identifies the returned immutable
deployment and emits one JSON result on stdout. Progress is stderr. The underlying Vercel
shape remains `deploy --prebuilt --scope schrockns-projects --prod --yes --format=json`.

Do not run package-local prebuilt deployment while also relying on the configured monorepo
Root Directory. That caused doubled path resolution. Do not replace the prebuilt path with
a normal source deployment: a Ready source deployment omitted Workflow consumers.

## Production deployment rules and known foibles

The production path is intentionally stricter than an ordinary Vercel deploy:

- Only the explicitly production-named `just dispatch-deploy-prod` target may deploy. Default
  `just`, tests, checks, and `build:deployable` remain local-only and must never reach it
  transitively.
- The repository must be clean, including untracked files. Otherwise the reported commit SHA
  would not truthfully identify all deployed source bytes, so deployment fails before build or
  upload and reports the dirty paths.
- Package-local `.vercel/project.json`, repository-root `.vercel/project.json`, and the
  `ns.toml` dispatch project/team IDs must agree before promotion. Package-root link, env, and
  build operations do not change the repository-root prebuilt deployment boundary.
- The command never passes credentials on argv and keeps progress and redacted diagnostics on
  stderr. Successful stdout is exactly one bounded JSON object; failure emits no success object.
- Vercel CLI JSON is an external, version-sensitive boundary. Parse only the deployment ID,
  URL, and readiness fields needed for identity verification; malformed or missing identity
  fails closed rather than weakening the check.
- A nonzero deploy result can occur after Vercel accepted the upload. If the output includes an
  inspectable locator, inspect it before retrying; automatically uploading again could create a
  duplicate deployment. A successful command requires both a Ready immutable deployment and
  the stable alias resolving to that same deployment ID.
- Deploy and alias failures retain the newly promoted local Build Output. Only a failure in the
  local staged promotion restores the previous output. Fixed staging/backup siblings also act
  as a concurrency and crash-residue guard: ambiguous residue is preserved for manual
  diagnosis, not silently deleted.
- Promotion rejects symlinked transaction boundaries, symlinks inside the Build Output, and
  unsupported path types. The rename sequence prevents partially copied files from becoming
  the destination, but it is a staged replacement with rollback—not an atomic exchange of two
  non-empty directories and not a zero-observation-gap promise.
- Deployment verification is identity-only. Public health is the separate read-only
  `just dispatch-verify-prod-health` target. Neither target starts a Workflow, creates a
  Sandbox, pushes a branch, or mutates a PR; authenticated and billable probes remain separate
  operator actions.

Platform behaviors that forced these rules are easy to miss: Vercel has exited successfully
while printing TypeScript diagnostics; `filePathMap` passed local source-path checks but did
not make relocated functions runtime-closed; the Workflow builder overwrites the application
`config.json`; a normal source deployment became Ready without Workflow consumers; and one
CLI polling failure occurred after a deployment had already become Ready. The gates below
encode those incidents instead of trusting a Ready status alone.

## Build pipeline

`pnpm build:deployable` owns this ordered gate:

1. Run the repository-native TypeScript check.
2. Run `vercel build --prod`.
3. Reject `TS####` diagnostics even if Vercel exits successfully.
4. Derive the expected API functions from immediate `api/*.ts` sources.
5. Bundle each emitted API handler with esbuild:
   - platform: Node;
   - format: CommonJS;
   - target: Node 24;
   - packages bundled;
   - no external sourcemap assumption.
6. Rewrite each API `.vc-config.json` to its `.cjs` handler and remove `filePathMap`.
7. Verify expected versus emitted API function directories.
8. Verify each configured handler exists and no API config retains `filePathMap`.
9. Verify the Vercel-emitted relative JavaScript module graph.
10. Run `workflow validate --strict`.
11. Run `workflow build --target vercel-build-output-api`.
12. Verify Workflow artifacts, Queue triggers, source discovery, and route-started workflow
    IDs.
13. Merge Workflow routes ahead of the original Vercel routes without accepting unknown
    Workflow config keys.
14. Print a bounded inventory summary; never claim live behavior from a local build.

## API function runtime closure

A portable API function is a hermetic function directory whose configured handler is
present and whose runtime packages are included in the bundle. `filePathMap` is not accepted
as the project closure contract.

The live failure that established this rule:

- generated configs mapped packages such as `zod`, `workflow`, and `jose` to cwd-relative
  source paths;
- relocation retained mapping strings;
- the CLI's source-path checks passed;
- deployment became Ready;
- the Lambda failed on first invocation with `ERR_MODULE_NOT_FOUND` for `zod`.

The artifact must be closed at the function boundary, not merely resolvable from the local
workspace that built it.

### Why CommonJS

A proof ESM rebundle failed on a transitive dynamic `require("tty")`. The CommonJS proof
executed successfully. The durable API bundle therefore uses CommonJS for mixed dependency
graph compatibility rather than assuming ESM and CommonJS bundling are equivalent.

## Workflow artifact contract

The beta.34 Workflow v5 Build Output uses one unified ESM flow consumer, not the retired v4
flow-plus-step pair. It must contain at least:

```text
.well-known/workflow/v1/flow.func/index.mjs
.well-known/workflow/v1/flow.func/.vc-config.json
.well-known/workflow/v1/webhook/[token].func/index.mjs
.well-known/workflow/v1/webhook/[token].func/.vc-config.json
.well-known/workflow/v1/manifest.json
```

The flow config must retain its `queue/v2beta` trigger on `__wkf_workflow_*`. Every source
carrying a `"use workflow"` directive must appear in the manifest, every route-started
Workflow ID must be present, and the dispatch manifest must contain the current package-owned
step names (including `createSandboxAndLaunchHarness` and `checkHarnessCompletion`) while
rejecting retired `launchDispatchStep`, `pollDispatchStep`, and `landDispatchStep` names.

The Workflow builder overwrites `.vercel/output/config.json`. The build gate captures the
Vercel config first and merges Workflow routes over the Vercel routes afterward. Neither
builder independently owns the complete final artifact.

Workflow-generated `nodejs22.x` consumers executed successfully in the linked Node 24
project. Keep that as a verified compatibility fact, not a general promise across arbitrary
runtime combinations.

## Promotion checks

Promotion is a staged transactional replacement with rollback, not an atomic exchange of two
non-empty directories. It copies to a fixed clean staging sibling, verifies and fingerprints
that inventory, renames the old root output to a backup, installs staging by rename, and
reverifies the installed digest before removing the backup. A failure during promotion
restores the old output. A deployment or alias-verification failure deliberately retains the
newly promoted output for diagnosis and retry.

Before promotion:

- the complete build gate passes;
- API configs contain `.cjs` handlers and no `filePathMap`;
- Workflow unified flow, webhook, manifest, Queue, current-step-inventory, and route-ID checks pass;
- the output is relocated as one complete inventory, not rebuilt piecemeal.

The deploy command's default post-promotion verification is identity-only: bounded JSON
inspection must show that the configured stable alias and returned locator identify the same
Ready immutable deployment. Public health is a separate read-only opt-in check:

```sh
just dispatch-verify-prod-health
```

Authenticated preflight, hello Workflow, Sandbox, and dispatch checks remain separate and
proceed only under Objective policy.

A CLI transport error after upload is ambiguous. Inspect the returned deployment URL or ID
before retrying; an earlier `EADDRNOTAVAIL` polling failure still produced a Ready deployment.

## Known platform gaps and Vercel feedback

Vercel should provide an enforceable prebuilt package contract:

- upload every `filePathMap` dependency and transitive dependency;
- reject mappings that escape or cannot survive the upload boundary; or
- require hermetic function directories and reject non-empty mappings.

It should also:

- expose Workflow flow/step/webhook/manifest and Queue registration in deployment inventory;
- make a run with no eligible consumer diagnostically actionable rather than indefinitely
  pending;
- document application-builder plus Workflow-builder Build Output composition;
- accept an explicit Build Output directory without reapplying the configured Root Directory;
- include both resolved roots in path-composition failures.

The complete vendor-facing chronology, acceptance tests, and provenance are in
`vercel-workflow-deployment-feedback-report.md`.

## Evidence and open work

Evidence: `dispatch-live-evidence.md` entries for the durable production deployment, hello
run, and first completed prompt dispatch.

Open work:

- preserve the final-inventory contract as API functions and Workflow consumers change;
- rerun at least the hello probe after any deployment-pipeline change;
- do not claim a source deployment is equivalent until its promoted inventory proves it.

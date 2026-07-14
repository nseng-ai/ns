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
inventory contained all four API functions and the required Workflow flow, step, webhook,
and manifest artifacts. Hello run `wrun_01KXFYJS9N6D2JNTKA6D3B2MYP` completed on that
deployment.

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

The final prebuilt production deployment runs from the repository boundary. The complete
package-local `.vercel/output` must first be materialized at the repository deployment
boundary alongside the linked project metadata. Deploy with:

```sh
vercel deploy --prebuilt --scope <team-slug> --prod --yes
```

Do not run package-local prebuilt deployment while also relying on the configured monorepo
Root Directory. That caused doubled path resolution. Do not replace the prebuilt path with
a normal source deployment: a Ready source deployment omitted Workflow consumers.

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

The final Build Output must contain at least:

```text
.well-known/workflow/v1/flow.func/index.js
.well-known/workflow/v1/flow.func/.vc-config.json
.well-known/workflow/v1/step.func/index.js
.well-known/workflow/v1/step.func/.vc-config.json
.well-known/workflow/v1/webhook/[token].func/index.js
.well-known/workflow/v1/webhook/[token].func/.vc-config.json
.well-known/workflow/v1/manifest.json
```

The flow and step configs must retain their `queue/v2beta` triggers on the expected Workflow
topics. Every source carrying a `"use workflow"` directive must appear in the manifest, and
every workflow started by an HTTP route must have its expected manifest-derived ID.

The Workflow builder overwrites `.vercel/output/config.json`. The build gate captures the
Vercel config first and merges Workflow routes over the Vercel routes afterward. Neither
builder independently owns the complete final artifact.

Workflow-generated `nodejs22.x` consumers executed successfully in the linked Node 24
project. Keep that as a verified compatibility fact, not a general promise across arbitrary
runtime combinations.

## Promotion checks

Before promotion:

- the complete build gate passes;
- API configs contain `.cjs` handlers and no `filePathMap`;
- Workflow flow, step, webhook, manifest, Queue, and route-ID checks pass;
- the output is relocated as one complete inventory, not rebuilt piecemeal.

After promotion:

1. `vercel inspect <stable-alias>` identifies the exact deployment and function inventory.
2. The health route responds.
3. The authenticated read-only identity preflight succeeds.
4. A hello Workflow starts and completes on the promoted deployment.
5. Higher-cost Sandbox or dispatch verification proceeds only under Objective policy.

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

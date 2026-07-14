# Vercel Workflow Deployment Feedback Report

**Observed:** 2026-07-14\
**Objective:** `cloud-execution`\
**Vercel project:** `ns-dispatch`\
**Scope:** Vercel Workflow deployment and observability through a custom Build Output API pipeline in a monorepo

## Executive summary

The live proof validated Vercel's execution substrate: Workflow and Queues executed successfully, a Workflow step created a Vercel Sandbox, the Sandbox cloned a private GitHub repository at an exact revision, and Workflow supervision carried a detached command for 840 seconds to terminal completion after 873 seconds.

The difficult failures were all in the deployment boundary. A production deployment could be marked **Ready**, and `start()` could return a valid Workflow run ID, while the deployment contained no Workflow Queue consumers capable of executing the run. The resulting run remained `pending` indefinitely with no actionable diagnostic. Resolving that exposed a second class of ambiguity around monorepo Root Directory handling, relocatable prebuilt output, and `filePathMap` dependencies.

The main conclusion is:

> Vercel's Workflow-supervised execution substrate passed the proof. The custom-framework and monorepo deployment path produced failures that were ambiguous, late, and insufficiently diagnosed.

This report focuses on six concrete product and documentation improvements:

1. Give permanently pending runs an actionable missing-consumer diagnostic.
2. Expose Workflow registration state as part of deployment readiness.
3. Document custom Build Output API composition explicitly.
4. Improve monorepo `--prebuilt` path ergonomics.
5. Validate or package `filePathMap` dependencies reliably.
6. Avoid broad `.gitignore` mutations during `vercel env pull`.

## Environment and architecture

The tested application is a deliberately Vercel-native capability package in a pnpm monorepo:

- Repository: private GitHub monorepo.
- Vercel project Root Directory: `ts/packages/capabilities/vercel`.
- Project framework preset: Other / `null`.
- Project Node.js version: 24.x.
- Project function region: `iad1`.
- Fluid compute: enabled in project resource configuration.
- Local Vercel CLI: `54.6.1`.
- Vercel deployment build CLI: `55.0.0`.
- Workflow SDK: `4.6.0`.
- Workflow-generated consumer runtime: `nodejs22.x`.
- Application API function runtime: `nodejs24.x`.

The package contains:

- four HTTP functions: health, mint, trigger, and run status;
- four workflows: hello, Sandbox checkout, long-run supervision, and dispatch;
- Workflow-generated flow and step Queue consumers;
- the Workflow webhook function and manifest;
- an authenticated trigger route calling `start()`;
- an authenticated run-status route calling `getRun()`.

The local deployability sequence was:

```sh
vercel build --prod
pnpm exec workflow validate --strict
pnpm exec workflow build --target vercel-build-output-api
```

The package then verified the generated Build Output before deployment:

- all four API function bundles existed;
- emitted relative imports were closed;
- all Workflow sources appeared in the Workflow manifest;
- flow and step functions existed;
- Queue triggers targeted `__wkf_workflow_*` and `__wkf_step_*`;
- the webhook function existed;
- Workflow routes were merged back into `.vercel/output/config.json` after the Workflow builder rewrote it.

That local gate passed. The later failures demonstrate the distinction between **artifact generation** and **the inventory actually promoted by Vercel**.

## Timeline and observed behavior

### 1. Local Build Output generation passed

The local gate reported:

```text
Verified 56 emitted modules and their relative imports across 4 source-derived API function bundles.
Verified workflow packaging: 9 workflow source(s), 7 required function artifacts, Queues wiring, 4 route-triggered workflow id(s) in the manifest, and merged Build Output routes.
```

The local output included these generated functions:

```text
.well-known/workflow/v1/flow.func
.well-known/workflow/v1/step.func
.well-known/workflow/v1/webhook/[token].func
api/health.func
api/mint.func
api/runs.func
api/trigger.func
```

The flow and step configurations contained the expected Queue triggers:

```json
{
  "runtime": "nodejs22.x",
  "experimentalTriggers": [
    {
      "type": "queue/v2beta",
      "topic": "__wkf_workflow_*",
      "consumer": "default"
    }
  ]
}
```

and:

```json
{
  "runtime": "nodejs22.x",
  "experimentalTriggers": [
    {
      "type": "queue/v2beta",
      "topic": "__wkf_step_*",
      "consumer": "default"
    }
  ]
}
```

### 2. A normal production deployment was marked Ready without Workflow consumers

The repository-root deployment command was:

```sh
vercel deploy . \
  --project ns-dispatch \
  --scope schrockns-projects \
  --prod \
  --yes
```

The deployment completed and was aliased to the production hostname. Vercel reported it as Ready.

However, `vercel inspect` showed only four application API functions:

```text
api/health
api/mint
api/runs
api/trigger
```

The Workflow flow, step, and webhook functions were absent from the deployed inventory. The normal source deployment had not composed the separately generated Workflow Build Output into what Vercel promoted.

### 3. `start()` succeeded but the run remained pending indefinitely

The authenticated hello trigger returned a valid Workflow run ID:

```text
wrun_01KXFTW63EXACF6EEHBMK460JW
```

Repeated `getRun()` calls returned:

```json
{
  "runId": "wrun_01KXFTW63EXACF6EEHBMK460JW",
  "status": "pending"
}
```

The run remained pending beyond the probe's observation window.

Workflow CLI inspection showed:

- status: `pending`;
- deployment: the Ready deployment missing Workflow consumers;
- exactly one event: `run_created`;
- no steps;
- no flow invocation or failure event.

The trigger function logs were clean. The Vercel public status page reported Workflow and Queues operational. The decisive evidence was therefore the deployed function inventory: the run existed and its initial event was durable, but the target deployment had no consumer capable of receiving the queued flow message.

### 4. Prebuilt deployment exposed Root Directory and artifact-relocation problems

Deploying the generated output directly from the package directory failed because Vercel reapplied the configured monorepo Root Directory to the current path:

```text
The provided path
…/ts/packages/capabilities/vercel/ts/packages/capabilities/vercel
 does not exist.
```

Moving `.vercel/output` to the repository root allowed `--prebuilt` to find it, but made the Node builder's dependency-relative `filePathMap` entries point at the wrong filesystem context.

The API function configuration contained mappings such as:

```json
{
  "filePathMap": {
    "node_modules/zod": "node_modules/zod",
    "node_modules/workflow": "node_modules/workflow",
    "node_modules/jose": "node_modules/jose"
  }
}
```

The first prebuilt attempt failed early because a mapped package path was absent. After local linked package paths were made visible, deployment succeeded and was marked Ready, but `/api/trigger` failed at runtime:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'zod'
imported from /var/task/src/http/wire.js
```

The resulting behavior was especially confusing because the CLI had performed a dependency-presence check and the deployment had succeeded, yet the dependency was not present in the Lambda artifact.

### 5. A hermetic prebuilt artifact proved the execution path

For the live proof, the three API functions with package dependencies were rebundled into self-contained CommonJS artifacts and their external `filePathMap` entries were removed. CommonJS was necessary because a first ESM bundle exposed a dynamic CommonJS `require("tty")` incompatibility inside a transitive `debug` dependency.

This rebundling was a controlled proof workaround, not the intended long-term deployment contract. With hermetic API functions and the generated Workflow functions in one prebuilt deployment, `vercel inspect` showed the Workflow webhook and the two previously hidden Queue-consumer output items in addition to the four API functions.

All live probes then passed.

## Validated execution evidence

### Hello Workflow and Queue delivery

Run:

```text
wrun_01KXFVZ9QJ5M8NHJB034YNS3JP
```

Observed transition:

```text
running → completed
```

This proved that the Workflow run, flow consumer, step consumer, and run-status observation path functioned once the required artifacts were actually deployed.

### Private-repository Sandbox checkout

Run:

```text
wrun_01KXFVZYEFN23G79G38DGW7YRG
```

Dispatched revision:

```text
946907af2429470dc2de6f9febb72583f761ab9b
```

Observed transition:

```text
running → completed
```

This proved in-process GitHub App credential minting, Workflow-step Sandbox creation, private-repository clone at an exact remotely reachable SHA, revision verification, and cleanup.

### Short supervision smoke test

Run:

```text
wrun_01KXFW0NCR93B316X0NERCNBPY
```

Requested detached-command duration: 15 seconds.

Observed transition:

```text
running → completed
```

### Long-run supervision proof

Run:

```text
wrun_01KXFW232K09QFBPSP82HTF6NX
```

Requested detached-command duration: 840 seconds.\
Observed terminal completion: 873 seconds after trigger.

Observed transition:

```text
running → completed
```

This exceeded the single-function invocation ceiling and validated the intended architecture: short Workflow poll steps and durable sleeps supervised a long-running process in the Sandbox without hosting that process inside one function invocation.

## Feedback 1: pending runs need an actionable diagnostic

### Current behavior

A deployment with no matching Workflow flow consumer allowed `start()` to:

1. create a durable run;
2. record `run_created`;
3. return a valid run ID to the caller;
4. leave the run `pending` indefinitely.

Neither `start()`, `getRun()`, deployment readiness, application logs, nor the run event stream identified the missing consumer.

### Why this is costly

`pending` is compatible with several very different conditions:

- ordinary queue delay;
- platform degradation;
- account or project entitlement problems;
- malformed Queue trigger configuration;
- a deployment with no matching consumer;
- a message that was never queued;
- a consumer that is registered but repeatedly failing before recording a Workflow event.

Without a diagnostic, the operator must inspect multiple systems and infer absence from negative evidence. In this session, the trigger route, authentication, run creation, storage, and status API all worked. That made the system appear mostly healthy while the one component required for progress did not exist.

### Recommended behavior

At least one layer should make this state explicit:

- `start()` rejects creation when its target deployment has no registered flow consumer for the workflow topic.
- The run transitions to `failed` with a stable code such as `workflow-consumer-missing`.
- Run observability reports: “Initial flow message was queued, but the target deployment has no matching consumer.”
- A bounded startup deadline transitions a never-delivered run out of `pending` with a classified failure.
- The event stream records queue publication and consumer-match outcomes separately.

A useful diagnostic should include safe identifiers:

- run ID;
- deployment ID;
- expected topic pattern;
- whether a queue message was created;
- whether a matching consumer was registered;
- whether any delivery attempt occurred.

It should not require decrypted workflow input.

### Suggested acceptance test

Deploy an API route capable of starting a known workflow but deliberately omit the flow consumer. Start the workflow and assert that, within a bounded period, either:

- creation is rejected with a stable missing-consumer code; or
- the run reaches a classified failed state that identifies the absent consumer.

An indefinitely pending run with only `run_created` should fail the test.

## Feedback 2: Ready should expose Workflow registration state

### Current behavior

The deployment was marked Ready because its uploaded functions were deployable. That status did not communicate that the deployment's application API could start workflows whose generated consumers were absent.

### Recommended deployment inventory

The dashboard, `vercel inspect`, or a machine-readable deployment endpoint should expose:

- discovered workflow IDs and names;
- the emitted Workflow manifest version;
- registered flow consumers;
- registered step consumers;
- Queue trigger type, topic pattern, and consumer name;
- Workflow webhook registration;
- runtime and region for each consumer;
- validation that every workflow-starting deployment contains executable handlers.

An example machine-readable status could be:

```json
{
  "workflowRegistration": {
    "status": "complete",
    "workflows": 4,
    "flowConsumers": 1,
    "stepConsumers": 1,
    "webhooks": 1,
    "problems": []
  }
}
```

For the broken deployment, the same surface should have reported `incomplete` and named the missing function classes.

### Readiness semantics

Vercel may reasonably keep generic deployment readiness separate from application-level completeness. If so, Workflow registration should still be a first-class deployment check with one of these states:

- complete;
- not applicable;
- incomplete;
- registration failed;
- unknown because the application uses a custom integration.

The essential requirement is that “Ready” not be the only visible signal when Workflow execution is structurally impossible.

### Suggested acceptance test

Deploy a Build Output tree containing a workflow manifest but no flow consumer. Assert that the deployment receives an incomplete Workflow-registration check visible through both dashboard and API/CLI inspection.

## Feedback 3: document custom Build Output composition explicitly

### Documentation gap

The Vercel World documentation correctly says that Vercel automatically provisions storage, queuing, and authentication. That zero-configuration statement applies to the backend, but it can be read as also covering custom build integration.

A custom framework still has to compose two independently produced output sets:

1. Vercel's Node/API function output;
2. Workflow's flow, step, webhook, manifest, and route output.

In this proof, the Workflow builder also rewrote `.vercel/output/config.json`, so the application routes and Workflow routes had to be merged deliberately.

### Recommended canonical guide

Provide a complete custom-framework example that performs:

```sh
vercel build --prod
workflow validate --strict
workflow build --target vercel-build-output-api
# Merge or preserve the application and Workflow Build Output configuration.
vercel deploy --prebuilt
```

The guide should explain:

- which command owns each output artifact;
- whether `workflow build` replaces or augments existing output;
- how to preserve routes and cron configuration;
- how to verify flow, step, webhook, and manifest artifacts;
- how Node function package dependencies are represented;
- how to deploy from a monorepo with a configured Root Directory;
- how to inspect the resulting deployment inventory;
- that a normal source deployment will not automatically run an out-of-band local Workflow build unless the project explicitly integrates it.

### Recommended reference validator

A supported command such as the following would reduce custom integration errors:

```sh
workflow validate-deployment-output .vercel/output
```

It should validate not just static files but the final deployment contract:

- workflow manifest and sources agree;
- flow and step Queue triggers exist;
- webhook route exists;
- config routes retain both application and Workflow entries;
- function dependencies are self-contained or valid for prebuilt upload;
- no Root Directory relocation invalidates dependency paths.

## Feedback 4: improve monorepo `--prebuilt` ergonomics

### Current behavior

The project Root Directory was already configured as:

```text
ts/packages/capabilities/vercel
```

Building in that package directory correctly produced:

```text
ts/packages/capabilities/vercel/.vercel/output
```

Running `vercel deploy --prebuilt` from the same directory attempted to resolve:

```text
ts/packages/capabilities/vercel/ts/packages/capabilities/vercel
```

Moving the output to the repository root avoided that doubled path but invalidated package-relative dependency mappings.

### Recommended CLI contract

Provide an explicit way to deploy an exact Build Output directory without reapplying project-root discovery. Possible command shapes include:

```sh
vercel deploy --prebuilt-dir ts/packages/capabilities/vercel/.vercel/output
```

or:

```sh
vercel deploy --prebuilt --project-root-already-applied
```

or:

```sh
vercel deploy --prebuilt --cwd ts/packages/capabilities/vercel --ignore-configured-root
```

The command should clearly separate three concepts:

1. repository root;
2. configured Vercel project Root Directory;
3. directory containing the already-built `.vercel/output` artifact.

For prebuilt deployment, the third is authoritative. The CLI should not require physically relocating the artifact merely to satisfy source-deployment path conventions.

### Error-message improvement

If the CLI detects the configured Root Directory already suffixes the current working directory, it should say so directly and recommend the exact supported invocation rather than reporting only that the doubled path does not exist.

## Feedback 5: validate `filePathMap` dependencies in prebuilt deployments

### Current behavior

Generated Node function configurations used `filePathMap` to associate package imports with source-tree dependency paths. After relocation:

1. the CLI correctly rejected an absent mapped package;
2. linked package paths were made visible;
3. prebuilt deployment succeeded;
4. the Lambda still lacked `zod`;
5. the first request failed with `ERR_MODULE_NOT_FOUND`.

The early presence check therefore did not guarantee runtime closure.

### Recommended contracts

Vercel should choose and document one strong contract for prebuilt Node functions:

#### Option A: package every `filePathMap` entry

Follow and upload every mapped dependency into the resulting function artifact. Validate symlinks, pnpm virtual-store paths, and transitive package dependencies.

#### Option B: reject mappings that are not safely portable

If a mapping relies on a symlink, escapes the project root, or cannot be represented in the uploaded Lambda, reject deployment with the exact problematic path and reason.

#### Option C: require hermetic function directories

Specify that prebuilt Node functions must include all runtime dependencies beneath the function directory and reject non-empty `filePathMap` values for portable prebuilt artifacts.

Any of these is safer than accepting a deployment that deterministically fails on its first import.

### Recommended pre-promotion check

Before marking a prebuilt deployment Ready, execute a static module-closure validation over each Node function:

- resolve every relative import;
- resolve every package import through its mapped or embedded package tree;
- reject dangling symlinks;
- reject mappings outside the uploaded file inventory;
- optionally load the handler in an isolated Node process matching the declared runtime.

The local project gate already checked relative imports. Vercel is better positioned to verify that package dependencies survived the final upload and Lambda assembly.

### Suggested acceptance test

Create a prebuilt Node function importing `zod`, represent it through `filePathMap`, and deploy from a monorepo package using pnpm symlinks. Assert that either:

- the deployed function can import and execute `zod`; or
- deployment is rejected before promotion with a classified dependency-packaging error.

## Feedback 6: avoid broad `.gitignore` changes

### Current behavior

The command:

```sh
vercel env pull .env.local --environment=development --yes
```

created the requested ignored file but also appended:

```gitignore
.env*
```

The package already contained the narrower rule:

```gitignore
.env.local
```

The broad rule was unnecessary and was removed immediately.

### Why this matters

Repositories commonly commit intentional environment templates such as:

```text
.env.example
.env.schema
.env.test.template
```

Adding `.env*` silently hides those files from `git status`, which can prevent required configuration documentation from being committed.

### Recommended behavior

- If the requested output file is already ignored, do not modify `.gitignore`.
- Otherwise, add only the exact requested filename.
- If Vercel wants to recommend a broader pattern, present it as an explicit prompt rather than an automatic mutation.
- In non-interactive mode, prefer the narrowest safe rule.

### Suggested acceptance test

Given a repository whose `.gitignore` already contains `.env.local`, run `vercel env pull .env.local`. Assert that `.gitignore` remains byte-for-byte unchanged.

## Product-level recommendations by priority

### Highest priority

1. Detect or classify runs whose initial flow message has no matching deployment consumer.
2. Expose Workflow registration completeness in deployment inspection and readiness checks.
3. Prevent prebuilt deployments from reaching Ready with unresolved package dependencies.

These changes turn silent, indefinite failures into bounded and actionable failures.

### Medium priority

4. Publish a canonical custom Build Output composition guide.
5. Add an explicit prebuilt-output-directory option that behaves predictably with monorepo Root Directory settings.
6. Provide a machine-readable validator for final Workflow deployment output.

### Lower priority

7. Narrow automatic `.gitignore` edits made by environment-pull commands.

## What worked well

The report should not obscure the parts that worked:

- Vercel Development OIDC authenticated local trigger and observation calls without exposing credentials.
- Workflow run creation and durable status storage worked.
- Workflow CLI inspection exposed run metadata and event history without decrypting inputs.
- Queue delivery, flow execution, and step execution worked immediately once the correct consumers were present.
- Workflow-generated `nodejs22.x` consumers operated successfully in a Node 24 project.
- Workflow steps integrated successfully with `@vercel/sandbox`.
- In-process GitHub App token minting worked inside Workflow step compute.
- The private repository cloned at the exact requested SHA.
- Long-running detached work remained in the Sandbox while Workflow supervision used short invocations and sleeps.
- The 840-second command completed after 873 seconds, validating the central supervision architecture.

These results are why the recommendation is to improve deployment correctness and diagnosis, not to reconsider the Vercel Workflow execution model.

## Reproduction summary

A compact reproduction for Vercel engineering is:

1. Configure a monorepo project with Root Directory `ts/packages/capabilities/vercel`.
2. Create an HTTP trigger route that calls `start()` using an explicit manifest-derived workflow ID.
3. Generate application output with `vercel build --prod`.
4. Generate Workflow output separately with:

   ```sh
   workflow build --target vercel-build-output-api
   ```

5. Confirm locally that flow, step, webhook, and manifest artifacts exist.
6. Perform a normal source deployment from the repository root.
7. Observe that the deployment is Ready but contains only application API functions.
8. Call the trigger route.
9. Observe a valid run ID, one `run_created` event, no steps, and an indefinitely pending run.
10. Attempt to deploy the package-local prebuilt output with the configured Root Directory and observe doubled path resolution.
11. Relocate the output to repository root and observe dependency-relative `filePathMap` complications.
12. Satisfy the CLI's package-path presence check and observe a Ready deployment whose API function fails with `ERR_MODULE_NOT_FOUND`.
13. Make the API function artifact hermetic, deploy the same Workflow consumers, and observe immediate successful execution.

## Provenance

### Direct live evidence

The commands, deployment inventories, function logs, Workflow CLI events, and run transitions in this report were observed directly against the linked `ns-dispatch` Vercel project on 2026-07-14. Secret values and decrypted Workflow inputs were neither printed nor recorded.

### External primary sources consulted

- Vercel World documentation: <https://workflow-sdk.dev/worlds/vercel>
  - Vercel World is zero-configuration for backend storage, queues, and authentication.
  - Workflow handlers use Vercel Queue `experimentalTriggers`.
  - Runs remain pegged to the deployment that started them.
  - Workflow 4.x is single-region in `iad1`.
- Vercel status: <https://vercel.statuspage.io/>
  - Workflow and Queues reported operational during this proof.
  - Historical status records show that pending Workflow runs have also occurred during past platform incidents, reinforcing the need to distinguish platform incidents from deployment-specific missing consumers.
- Workflow issue #451: <https://github.com/vercel/workflow/issues/451>
  - Contains prior reports of production runs remaining pending and discussion of missing callback/consumer configuration in custom framework integrations.
- Vercel Build Output API documentation: <https://vercel.com/docs/build-output-api>
- Vercel CLI build documentation: <https://vercel.com/docs/cli/build>
- Vercel custom workflow guide: <https://vercel.com/kb/guide/using-vercel-cli-for-custom-workflows>

## Final conclusion

The steel-thread probes materially de-risked Vercel Workflow as the supervisor for long-running Sandbox work. The backend executed correctly once the final deployment contained complete, runnable artifacts.

The developer experience problem is that several deployment states looked successful while execution was structurally impossible:

- a Ready deployment without Workflow consumers;
- a successfully created run with no possible executor;
- a successful prebuilt deployment with missing Node package dependencies.

Vercel can substantially improve this path by making consumer registration and package closure part of explicit, machine-readable deployment correctness, and by giving prebuilt monorepo users one unambiguous way to deploy an exact Build Output directory without relocation.

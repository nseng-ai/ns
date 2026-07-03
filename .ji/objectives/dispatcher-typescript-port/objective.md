# Dispatcher TypeScript Port

## Thesis

Complete the `dispatcher` capability slice for the TypeScript toolkit migration by deliberately retiring the existing Python `asdl-dispatcher` placeholder instead of porting it as a TypeScript placeholder.

This is a Child Objective of `port-asdl-toolkit-to-typescript`. It records that the current `asdl-dispatcher` / `dispatcher` surface had no durable operation contract to preserve: only standalone help/version discoverability and an `asdl.plugins` plugin mount with `operations=[]`.

## Scope

- Current standalone `dispatcher` CLI behavior.
- Current `asdl.plugins` plugin mount behavior for `dispatcher`.
- Workspace, build, and test references that needed deliberate removal during retirement.
- Caller and consumer evidence for whether keeping a placeholder command had value.
- Parent Objective evidence that retirement/no-port is a completed migration outcome.

## Non-Goals

- Do not invent GitHub Actions dispatch product behavior before product requirements exist.
- Do not create a TypeScript `dispatcher` package without future consumer or product evidence.
- Do not keep an operation-less Python package in active workspace/build/test paths.
- Do not create a dispatcher package context file for a retired placeholder.

## Current Contract Summary

The retired Python package was a thin placeholder. Its only durable behavior was discoverability:

- `dispatcher -h` showed the command name and help text.
- `dispatcher --version` worked through the standalone CLI wrapper.
- The package exposed an `asdl.plugins` entry point named `dispatcher` whose group mounted under a parent `asdl` command.

The dispatcher group had no operations, and its typed context carried no gateways or state.

## Decision

Retire the placeholder. Do not create `ts/packages/dispatcher` in this slice.

Fresh caller discovery found no active consumers that import `asdl_dispatcher`, invoke the `dispatcher` command, depend on the `asdl.plugins` dispatcher mount, or require placeholder discoverability to survive. The only package-specific references were its own smoke tests, root workspace/build/test wiring, context-map tracking language, and Objective history.

Future real dispatch work remains possible, but it should start from product requirements for concrete dispatch operations and GitHub Actions contracts rather than inheriting this operation-less placeholder.

## Completion Criteria

- The current contract inventory is recorded and validated against source, tests, and workspace references.
- The Objective records the deliberate retirement decision and why a TypeScript placeholder was not created.
- The Python placeholder package and active root workspace/build/test references are removed.
- The parent TypeScript migration Objective records dispatcher as retired/no-port.
- Rollback/reference evidence is recorded for restoring the deleted package if future requirements need it.

## Closure

This child Objective is complete. The contract inventory was recorded, fresh caller discovery found no active consumers, the retirement decision was made, `packages/asdl-dispatcher` and active root references were removed, the parent Objective was updated, and no non-parked dispatcher work remains.

Open future product work, not a blocker for closure: if ASDL later needs a real coding-task dispatch capability, define the operations, GitHub Actions contract, and user-facing workflow in a new capability slice.

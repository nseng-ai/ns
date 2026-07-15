# Herdr Foundation and Objective Label Land Locally

## Summary

The second local stack branch creates `@nseng-ai/herdr` with the decided private `core` feature and `pi` host-surface topology, exporting only `./pi` and `./pi/extension`. It adds a narrow CLI-backed Herdr Consumer Gateway and Pi discovery adapter.

`/ns:herdr:sidebar:objective-summary` now validates or selects an Objective deterministically, resolves the explicit caller through `HERDR_WORKSPACE_ID`, and renames that workspace to `obj:<slug>`. The label-only path does not read unused slot or branch state and does not invent a metadata transport.

## Objective Impact

Roadmap row 2 is complete on local branch `herdr-capability-parity-pr2`. The package boundary and explicit-ID targeting seam needed by the final workflow slice now exist. Herdr package tests, the topology report, TypeScript style guard, and full `just` pass.

## Follow-Ups

- Implement the five selected dispatch/open-branch workflows over this gateway foundation in PR 3.
- Keep objective/slot/branch metadata reporting parked until installed Herdr supports the required workspace operation.

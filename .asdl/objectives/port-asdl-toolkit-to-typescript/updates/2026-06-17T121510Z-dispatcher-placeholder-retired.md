# Dispatcher Placeholder Retired

The dispatcher capability slice completed by retirement/no-port rather than a TypeScript placeholder port.

## Decision

The child Objective `.asdl/objectives/dispatcher-typescript-port/` recorded that Python `asdl-dispatcher` was an operation-less placeholder: standalone help/version discoverability plus an `asdl.plugins` plugin mount, with `operations=[]` and no gateways, dispatch payloads, GitHub Actions interaction, or operation contract.

Fresh caller discovery found no active consumers beyond package smoke tests and workspace/build/test wiring. Because there was no durable dispatch behavior to preserve, the completed migration outcome is retirement/no-port, not an unstarted TypeScript port.

## Evidence

- Deleted `packages/asdl-dispatcher/`.
- Removed active root workspace/build/test references from `pyproject.toml`, `justfile`, and `uv.lock`.
- Removed active context-map tracked-stub wording for the former dispatcher placeholder.
- No `ts/packages/dispatcher` package was created.
- Child Objective now has `closed.md` and records the retirement decision, rollback route, validation, and future-product boundary.

## Rollback / Reference

Pre-deletion reference commit: `479da7adc`.

If a future requirement needs to inspect or restore the retired placeholder:

```bash
git checkout 479da7adc -- packages/asdl-dispatcher pyproject.toml justfile uv.lock CONTEXT-MAP.md
```

That restoration should be driven by new product or consumer evidence, not by the prior placeholder alone.

## Next Default Capability

With dispatcher completed by retirement/no-port, the next default capability in the persisted sequence is Roaster / review workflows unless newer evidence changes the order. The umbrella Objective remains open.

## Validation

Record final implementation validation in the branch closeout. The intended validation includes lockfile check/regeneration, Python checks/tests, dprint, Objective readouts, stale-reference sweeps, and `git diff --check`.

# Schema Routes, Bundle Cutover, Plugin Retirement, and Python Deletion Landed

## Summary

Endgame stack branches 5-8 landed as `pr-address-ts/schema-routes`, `pr-address-ts/bundle-distribution`, `pr-address-ts/plugin-retirement`, and `pr-address-ts/python-deletion`. The TypeScript cutover is complete: every exec operation and every `--json-schema` route is TypeScript-owned, installed/prod invocation executes a checked-in deterministic single-file bundle (`skills/pr-address/scripts/pr-address.bundle.mjs`, esbuild, Node >= 24, byte-compare freshness test), the `asdl pr-address ...` plugin is retired outright with a retirement-guard test, and `packages/asdl-pr-address` is fully deleted from the repo. Rollback is the wrapper's `legacy-python` mode running `uvx --from asdl-pr-address==0.1.1` (the broken unpublished `0.1.0` pin is gone). Golden contract fixtures moved into `ts/packages/pr-address/test/fixtures/golden/v1/` as the durable post-deletion reference.

Verification: full repo gate (`just`: ruff, ty, dprint, ts-check, js-test, python-test) passed after plugin retirement and again after deletion; TS package check/test passed per branch; bundle smoke ran standalone without node_modules; `uv run pr-address` no longer resolves, and wrapper local/prod modes both work.

## Objective Impact

- Roadmap rows "Cut over public skill, wrapper, plugin, and distribution paths" and "Retire active Python fallback paths and fully delete `packages/asdl-pr-address`" are complete; only the playbook row remains.
- Bundle open question resolved: checked-in single-file ESM bundle, lockfile-pinned esbuild build (`just bundle-pr-address`), Node >= 24 floor, staleness converted to CI failure via byte-compare freshness test; releases refresh by rebuilding and committing.
- Golden/schema parity questions resolved: byte-for-byte for envelopes/artifacts (normalizing only root-length-dependent `payload_bytes` and live timestamps); structured semantic parity for schema documents via a dedicated comparator. The classification trio's schema documents keep their shipped TS shapes, exempted from the structural bar with fixtures checked in for a future tightening pass.
- Intentional compatibility changes recorded (ADR 0004 amendment, docs): invalid `--payload-mode`/`--stdout-mode`/non-integer `--body-chars` now emit TS-native `invalid_request` envelopes instead of click usage text; unknown exec operations error in TS; wrapper `python-local` mode removed; in-repo `uv run pr-address` no longer exists.
- Risks updated: broken prod pin resolved; bundling-machinery risk de-risked (deterministic build + freshness CI) with an accepted ~880 KB checked-in artifact residual; plugin-retirement breaking change executed with no remaining caller path; `asdl_core.payloads` retained for aretro consumers while unused `asdl_core.clinkr.json_input` was deleted.

## Follow-Ups

- Tighten the classification trio's schema documents to the structural parity bar using the checked-in Python fixtures.
- Feed porting lessons into the umbrella playbook and evaluate Objective closure (final endgame branch).

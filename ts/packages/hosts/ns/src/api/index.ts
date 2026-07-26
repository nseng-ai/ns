/**
 * Cross-package door for `@nseng-ai/ns` (`@nseng-ai/ns/api`): the harness-artifact
 * and harness-overlay conventions other packages are allowed to consume. This is a
 * thin facade — logic lives in the `harness-artifacts` feature. Modules inside
 * `@nseng-ai/ns` import that feature directly rather than routing through this door.
 */

export * from "../harness-artifacts/api.ts";

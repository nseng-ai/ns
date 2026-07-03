# npm publish target changed to @nseng-ai/ji

## Summary

The owner explicitly rejected the pending `@ji` npm org/scope claim. The npm publish
namespace is the existing `nseng-ai` org/scope, and the package name is `ji`, yielding the
publish target `@nseng-ai/ji`. The unscoped `ji` squat remains an accepted collision with
no dispute path.

## Objective Impact

- The roadmap no longer treats claiming `@ji` as work; the npm naming decision is now
  recorded as complete.
- Package-scope rename guidance changes from `@ji/*` to `@nseng-ai/*`, with the primary
  package target `@nseng-ai/ji`.
- The completion criteria and assumptions no longer depend on availability or ownership
  of an `@ji` npm org/scope.

## Follow-Ups

- Update ADR/naming-doc prose that still states the superseded `@ji` scope plan when the
  next documentation/vocabulary sweep touches active docs.
- During the package sweep, ensure package manifests and imports target `@nseng-ai/*`
  and the externally published package is `@nseng-ai/ji`.

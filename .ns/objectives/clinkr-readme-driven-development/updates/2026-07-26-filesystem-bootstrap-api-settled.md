# Filesystem Bootstrap API Settled

## Summary

The common filesystem command bootstrap is settled as `createClinkrApp({ name, commandDirectory, version?, runtimeInfo?, completion? })`. Public language describes a filesystem-defined command structure rather than routes. `commandDirectory` is a required absolute filesystem path; the colocated Node 24+ form is `import.meta.dirname`, and Clinkr never resolves it against the process working directory.

Context remains invocation-owned: context-free apps use `app.run(args)` and `app.complete(request)`, while contextful apps supply context per invocation. Foundation continues to own package metadata and outer lifecycle policy, runs `prepareRun` first, and creates a fresh app for each unhandled invocation through the same immutable builder seam used by advanced programmatic composition.

Completion-provider failure observation is also settled as optional `completion.onProviderError` app policy. It receives the provider error plus command/completion context, while Clinkr preserves static candidates and does not let observer failure break fallback.

## Objective Impact

The bootstrap and completion-error discussion gates are resolved. The README draft now shows `createClinkrApp` with `commandDirectory: import.meta.dirname`; the Objective, roadmap, decision record, and contract audit record the absolute-path contract, explicit app name, per-invocation context, fresh Foundation app lifetime, and one shared command-dispatch runtime.

The filesystem adapter remains a lowering layer over the immutable app/builder model, not a second parser or dispatcher. Command/group files and directories must ship intact; generated manifests, production codegen, compatibility runtimes, and manual argv pre-dispatch remain rejected.

No TypeScript implementation occurred in this decision update.

## Follow-Ups

- Settle opaque raw Commander mounting and `ClinkrFailure` removal before implementation reaches those surfaces.
- During implementation, finalize only the exact advanced builder operation spelling while preserving the settled semantics.
- Reconcile Clinkr, Foundation, SDK/catalog command selection, remaining CLIs, and testing through the coordinated clean cut.
- Verify Node package metadata and shell-completion installation claims before README promotion.

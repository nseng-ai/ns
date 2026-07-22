# Autoslot Boundary Decisions Confirmed

## Summary

A focused design grilling resolved the remaining implementation details for the autoslot decoupling and dual-surface gating slice.

Flow will own current and named-branch checkout domain logic with Flow-owned target, failure, and result types containing only the fields autoslot needs. The logic will invoke `ns slot checkout --current --format json` or `ns slot checkout <branch> --format json` through Flow's existing injected command-exec seam with clipboard copying disabled, then validate the JSON result before producing a typed outcome. A high-level `SlotCheckoutGateway` is intentionally not part of the design because it would fake Flow-owned policy rather than the external command capability beneath it.

The gateway preserves valid Slots domain failures by retaining their `errorType` and message. Command execution, termination, malformed JSON, and invalid success-envelope failures receive explicit Flow-owned boundary error types and remain inside autoslot's existing result and presentation path rather than escaping as exceptions.

Because JSON output suppresses the Slots CLI's normal navigation side effect, Flow's checkout logic will write the established parent-shell cd directive after a validated success using the returned worktree path. This preserves current autoslot navigation without changing machine-output behavior in the Slots command.

The ns catalog entry will use `requiresExtension: "@nseng-ai/slots"`. The Pi mirror will resolve exact Slots presence once from the startup repository's effective catalog, omit only `/ns:flow:autoslot` when absent, and keep registration static for the Pi session. Dynamic command re-registration and invocation-time visible-command guards remain out of scope.

## Objective Impact

The autoslot roadmap row now has a complete implementation contract. The selected command-exec seam severs all Flow production imports from `@nseng-ai/slots`, supports both required checkout modes, keeps default tests fake-driven, and preserves user-visible navigation while distinguishing Slots domain refusals from command-boundary failures.

The Pi decision closes the timing ambiguity created by registration occurring before command handlers receive `ctx.cwd`: startup-repository catalog presence defines the session command surface, and a repository change requires command-surface reconstruction rather than dynamic mutation.

## Follow-Ups

- Implement Flow-owned two-mode checkout logic over the injected command-exec seam and fake-driven success, domain-failure, execution-failure, malformed-protocol, and cd-directive scenarios.
- Gate the ns entry declaratively and compose startup-catalog presence into the Pi mirror so absent Slots removes only autoslot.
- Remove production Slots imports, the Flow manifest dependency, and the generated lockfile edge after the adapter migration.
- Run relevant targeted validation, broaden when shared wrappers or workspace configuration are touched, and document commands run plus unrelated blockers.

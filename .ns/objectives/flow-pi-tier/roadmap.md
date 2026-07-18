# Roadmap

## Work

- [ ] Normalize `gt:squash-stack` to `/ns:flow:squash-stack`: registration under
      the `ns:flow` namespace, old-name disposition (open question), parity metadata,
      reference sweep. Small and ungated; lands first.
      Evidence: `just` green.
- [x] Promotion plan for stack:view: single-shot move into Flow, retain
      `/stack:view`, preserve the master-based enrichment and overlay behavior,
      accept the existing GraphQL loader because the upstream primitive Objective
      was abandoned, and incubate a real-runtime Pi Command Host in Flow.
- [x] Execute the promotion: stack-view and its tests live in Flow; parity is
      FULL via `ns flow stack`; the internal entry is removed; the stale
      standalone-capability path is gone; and the accepted GraphQL residual is
      documented. `ns flow stack` is a raw/process-owning TUI command because
      upstream Pi owns graceful terminal shutdown and exits the process.
- [ ] Validate the Pi Command Host with a future second consumer, then promote
      the generic host toward `@nseng-ai/pi` rather than expanding its Flow-local
      API.

## Parked

- [ ] Deprecate `/pr:preview-checks` in favor of the promoted stack:view once
      both ride the shared enriched `branch-pr-checks` backend — contingent on this
      record's promotion slice and `stack-repair-loop-hardening`'s enrichment
      landing.

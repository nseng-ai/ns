# Roadmap

## Work

- [ ] Normalize `gt:squash-stack` to `/ns:flow:squash-stack`: registration under
      the `ns:flow` namespace, old-name disposition (open question), parity metadata,
      reference sweep. Small and ungated; lands first.
      Evidence: `just` green.
- [ ] Promotion plan for stack:view: map its data needs to sanctioned primitives
      (`slot gt exec` topology; `address exec` checks/threads as enriched by
      `stack-repair-loop-hardening`), pick test seams (data layer vs TUI/overlay vs
      compose), decide staged vs single-shot, and resolve the command-name open
      question.
- [ ] Execute the promotion per plan: move stack-view into Flow's Pi layer with
      tests, consuming primitives, header promotion path rewritten, parity metadata
      updated, `@internal/pi-tools` entry removed. Gate: the checks/threads backend
      prefers the enriched `branch-pr-checks`; coordinate through the edge rather
      than promoting a duplicate GraphQL layer, or document any accepted residual.

## Parked

- [ ] Deprecate `/pr:preview-checks` in favor of the promoted stack:view once
      both ride the shared enriched `branch-pr-checks` backend — contingent on this
      record's promotion slice and `stack-repair-loop-hardening`'s enrichment
      landing.

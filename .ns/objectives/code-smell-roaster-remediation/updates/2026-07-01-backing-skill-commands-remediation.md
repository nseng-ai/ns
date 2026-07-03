# Backing Skill Commands Remediation

## Summary

The `local-pi-tools` backing-skill-commands sub-slice was re-probed and remediated. The command module's unrelated responsibilities are now split across focused production modules: `specs.ts` owns derived command metadata, `parity.ts` owns parity projection, `runtime.ts` owns registration and prompt dispatch, and `extension.ts` remains a compatibility export surface.

The speculative `DerivedPiCommand.namespace` / `command` finding was disposed rather than removed: re-probe confirmed those fields have no production behavior beyond the compatibility metadata shape, but removing them would require test-source churn outside this Objective's non-goals while providing no user-visible behavior change.

## Objective Impact

This reduces the open `local-pi-tools` backlog by giving both backing-skill-commands findings dispositions: one fixed divergent-change smell and one disposed speculative-generality smell with rationale. Behavior is intended to remain unchanged for generated command registration, backing-skill prompt dispatch, and parity metadata.

## Follow-Ups

No follow-up is required for this sub-slice unless a future public-surface cleanup Objective explicitly permits updating/removing the compatibility metadata tested for `DerivedPiCommand`.

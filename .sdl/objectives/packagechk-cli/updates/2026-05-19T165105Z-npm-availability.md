# npm Availability Implemented

## Summary

Implemented npm unscoped package-name validation and availability lookup behind the real registry gateway. npm names are validated without silent rewriting, scoped names are rejected for v1 with a clear invalid-result message, `200` maps to taken, `404` maps to available, and network or unexpected HTTP statuses map to operational errors.

## Objective Impact

The npm roadmap item is complete. Both supported registries now have real lookup paths behind the same CLI contract, and registry-specific name handling is covered by unit, gateway, and scenario tests.

The remaining Objective work is now concentrated in finalizing the default both-registry behavior, confirming the JSON schema, and ensuring scenario coverage spans the final combinations and exit-code aggregation.

## Follow-Ups

- Add final default-registry scenario coverage for mixed PyPI/npm outcomes and operational errors.
- Confirm and document the JSON schema as stable for scripts and agents.

# PyPI Availability Implemented

## Summary

Implemented PyPI package-name normalization and availability lookup behind the real registry gateway. PyPI names now use PEP 503-style normalization for lookup, invalid PyPI names fail before any registry request, `200` maps to taken, `404` maps to available, and network or unexpected HTTP statuses map to operational errors.

The PyPI path uses Python stdlib HTTP rather than adding a new runtime dependency.

## Objective Impact

The PyPI roadmap item is complete. The output and scenario-test items are further along because the CLI now exercises real PyPI behavior through an injected status-code fetcher in tests, including available, taken, and invalid-name cases.

This de-risks the PyPI normalization concern with direct unit, gateway, and scenario coverage while leaving npm validation as the remaining registry-specific edge-case risk.

## Follow-Ups

- Implement npm unscoped-name validation and availability lookup.
- Confirm the final JSON schema once both supported registries are wired through the CLI.

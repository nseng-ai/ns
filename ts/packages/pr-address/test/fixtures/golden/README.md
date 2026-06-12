# pr-address golden fixtures

Fixtures under `v1/` snapshot deterministic `pr-address` JSON/text contracts. Each case lives at:

```text
v1/<operation>/<case>/input.json
v1/<operation>/<case>/expected.json
```

Tests compare exact model dumps or reply text. Update `expected.json` only when the contract change is intentional and review the diff case-by-case.

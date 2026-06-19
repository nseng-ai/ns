# @asdl/aretro

TypeScript port of the `aretro` retrospective evidence operations CLI.

## Status

Contract-only shell implementation (slice 1). Exposes the durable command surface for:

- `aretro exec collect-evidence` — placeholder evidence collection with JSON envelope
- `aretro exec read-evidence-detail` — placeholder detail reader (not yet implemented)

Real evidence aggregation and payload detail work are deferred to later slices.

## Usage

```bash
# Collect evidence (placeholder)
aretro exec collect-evidence --repo /path/to/repo --branch feat/x --format json

# Read detail pointer (not yet implemented)
aretro exec read-evidence-detail <pointer>
```

## Testing

```bash
pnpm --filter @asdl/aretro run test
```

## Type checking

```bash
pnpm --filter @asdl/aretro run check
```

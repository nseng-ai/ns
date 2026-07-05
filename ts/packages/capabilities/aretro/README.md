# @nseng-ai/aretro

Deterministic branch-retrospective evidence collection for `branch-retro` and other model-backed workflows.

## Command face

Aretro is exposed through the ji extension command face:

- `ns aretro exec collect-evidence` — collect compact factual session evidence in a Clinkr envelope.
- `ns aretro exec read-evidence-detail` — read one targeted value from a sanitized payload artifact.

The standalone `aretro` binary is retired. This package intentionally does not expose `@nseng-ai/aretro/api`; there is no current in-process Capability API consumer.

## Usage

```bash
ns aretro exec collect-evidence --repo /path/to/repo --branch feat/x --format json

ns aretro exec read-evidence-detail \
  --payload-path /path/to/payload.raw.json \
  --json-pointer /data/evidence_items/0 \
  --format json
```

Aretro emits factual observations only. Semantic diagnoses and recommendations belong in `branch-retro` or another model-backed workflow.

## Testing

```bash
pnpm --dir ts --filter @nseng-ai/aretro run test
pnpm --dir ts --filter @nseng-ai/aretro run check
```

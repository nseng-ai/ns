# @nseng-ai/retros

Deterministic branch-retrospective evidence collection for `branch-retro` and other model-backed workflows.

## Command face

Retro is exposed through the ns extension command face:

- `ns retro exec collect-evidence` — collect compact factual session evidence in a Clinkr envelope.
- `ns retro exec read-evidence-detail` — read one targeted value from a sanitized payload artifact.

The standalone `retro` command is retired. This package intentionally does not expose `@nseng-ai/retros/api`; there is no current in-process Capability API consumer.

## Usage

```bash
ns retro exec collect-evidence --repo /path/to/repo --branch feat/x --format json

ns retro exec read-evidence-detail \
  --payload-path /path/to/payload.raw.json \
  --json-pointer /data/evidence_items/0 \
  --format json
```

Retro emits factual observations only. Semantic diagnoses and recommendations belong in `branch-retro` or another model-backed workflow.

## Testing

```bash
pnpm --dir ts --filter @nseng-ai/retros run test
pnpm --dir ts --filter @nseng-ai/retros run check
```

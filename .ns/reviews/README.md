# NS reviews

Review definitions live at `.ns/reviews/<key>/review.md`.

- `<key>` is a direct child folder name; active review keys do not contain `/` or `\`.
- Reviews loads only each direct child folder's `review.md` file.
- Colocated files such as `references/` and `tools/` are assets for that review and are not loaded as separate review definitions.
- The authoring convention — lineage kinds, provenance blocks, the SKILL.md stub template, and the stub-per-review checklist — lives in `docs/conventions/adversarial-reviews.md`.

## Recording and publishing findings

For durable logging after a review run, convert the findings to `{ "findings": [...] }` and record them:

```bash
ns reviews exec record-findings --review-key <key> --format json < findings.json
```

Pipe the resulting JSON envelope to `ns reviews exec publish-findings` to publish to GitHub.

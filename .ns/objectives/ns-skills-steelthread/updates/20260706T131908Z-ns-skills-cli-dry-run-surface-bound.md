# ns skills CLI dry-run surface bound

## Summary

The user-facing `ns skills install` preview surface is `--dry-run`, not a separate `plan` subcommand. This follows the local Clinkr/ns CLI danger-tier convention that dry-run is a successful write-free inspection flag, while plain `install` prints the plan it is applying before/while applying it.

## Objective Impact

This closes the Objective's open preview-surface question and fixes the CLI contract for the steelthread: `ns skills list`, `ns skills path <skill> --harness <h> [--scope ...]`, and `ns skills install <skill> --harness <h> [--scope ...] [--dry-run] [--force]`.

## Follow-Ups

Continue wiring and validating the remaining steelthread consumer seam in `@nseng-ai/ns-init` in the final slice; do not broaden the `ns skills` surface beyond first-party skill provisioning here.

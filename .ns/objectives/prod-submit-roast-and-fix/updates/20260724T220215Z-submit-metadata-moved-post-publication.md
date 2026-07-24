# Semantic Update: Submit Metadata Moved Post-Publication

Ordinary `ns flow submit` still provides interim initial metadata for PRs created by that invocation, but now does so only after Graphite creates the PRs. It prepares complete title/body replacements for every selected new PR before editing any PR, then applies them sequentially. Preparation failure means zero edits; application stops at the first GitHub failure and reports applied, failed, and not-attempted PRs without rollback.

Submit never rewrites a PR that existed before the invocation. The `--regenerate-descriptions` submit option and metadata-prewrite/commit-amendment path are removed. Existing-PR replacement is the focused `ns flow regenerate-pr` operation, which replaces the complete current title and body and appends visible command, prompt-source, and model provenance.

This is still an interim bridge. The Objective's decided destination remains moving all prose generation to the theoretical future `ship` workflow so cheap submit performs no prose work; this implementation does not add `ship`.

# Roadmap

## Work

- [ ] Establish the canonical terminology and compatibility boundary.
      Decide whether the current spec file should become a new payload-artifacts path with a legacy shim, or remain in place with only prose/reference cleanup. Identify which old terms are historical and intentionally allowed in closure evidence.
- [ ] Refresh prompt-policy wording.
      Update `.asdl/prompts/subagent-launch.md` and the embedded fallback under `asdl-core` so the policy describes artifact-backed inspection, paths, locators, selected-detail lookup, and fail-closed fallback behavior without stale channel wording. Preserve the drift-test contract between the checked-in prompt and embedded default.
- [ ] Update current docs and active Objective references.
      Replace stale architectural references in active planning docs such as command-output summaries, and update current spec/readme/skill references so future work cites payload artifacts rather than legacy terminology.
- [ ] Run and record terminology audit evidence.
      Re-run focused text searches for stale payload terminology and classify any remaining hits as historical, unrelated to payload artifacts, or explicit compatibility aliases. Record closure evidence and relevant Markdown/check validation in the Objective before closing.

## Parked

- Reopening payload-store, prompt resolver, `pr-address` manifest, selected-detail, or classification-validation implementation scope.
- Renaming the completed historical Objective slug or rewriting its Semantic Update history.
- Renaming concepts from unrelated domains.
- Generic payload CLI, prompt CLI, retention/GC, bounded previews, or command-level LLM features.

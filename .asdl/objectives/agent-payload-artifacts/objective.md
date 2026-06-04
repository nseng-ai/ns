# Agent Payload Artifacts Terminology Completion

## Thesis

The payload artifact architecture is implemented, but some active docs still describe the pattern with stale channel-oriented language. That vocabulary makes the design sound like an implicit communication path instead of an explicit artifact contract: commands write private payload files, compact manifests carry payload references and locators, and agents inspect selected artifacts or selected details when needed.

This Objective supersedes the closed `agent-payload-sidechannels` Objective for only the remaining terminology and documentation cleanup. The completed implementation work should stay closed; this Objective exists to make current public and agent-facing wording match the shipped payload artifact model.

## Scope

- Audit current code, docs, skills, specs, prompts, and active Objective records for stale channel-oriented wording that is actually about payload artifacts.
- Rewrite the repo-local subagent launch policy and its embedded fallback so it describes payload artifact inspection, path-and-locator passing, selected-detail lookup, and fallback behavior without implying a hidden communication channel.
- Move or replace current durable spec references so current docs point at payload artifact terminology. If a file path with old terminology remains for compatibility or history, mark it as legacy and make the current canonical path/name clear.
- Update active Objective records that refer to the payload artifact architecture, especially command-output summary planning, so new work cites the fresh terminology.
- Preserve historical Semantic Updates, old Objective slugs, and closure records as history unless they are actively misleading current readers.
- Run targeted text audits after edits and record clear closure evidence showing that remaining old payload terms are historical, unrelated to payload artifacts, or intentionally preserved compatibility references.

## Non-Goals

- Do not reopen the completed payload-store, prompt resolver, `pr-address` compact manifest, selected-detail lookup, or classification-validation implementation work.
- Do not rename the old Objective directory or rewrite its historical update log.
- Do not rename unrelated concepts from other domains; this Objective is only about payload artifact terminology.
- Do not create a generic payload CLI, prompt CLI, retention/GC system, bounded body previews, or command-level LLM behavior.
- Do not rewrite every historical branch note, archived update, or old filename solely to erase history.

## Completion Criteria

- Current agent-facing prompt policy files use payload artifact/path/locator terminology and no longer describe the workflow as a hidden channel.
- Current durable specification entry points use payload artifact terminology, and references from active docs/objectives point to the current name or explicitly identify any old path as legacy.
- Active Objective records and roadmap prose that guide future work use payload artifact terminology for the architecture.
- A repo text audit shows no stale channel-oriented hits in current payload artifact docs, skills, prompts, or implementation docs, excluding historical records, old closed Objective identity, and explicitly documented legacy aliases.
- The old closed Objective contains a supersession note pointing to this Objective, while this Objective contains a fresh scope limited to remaining terminology work.
- Relevant Markdown formatting checks pass or any remaining validation limitation is recorded with the closure evidence.

## Assumptions and Risks

Assumptions:

- The implementation behavior is already correct; the remaining problem is vocabulary, canonical references, and reader guidance.
- Keeping the old Objective slug intact is preferable to a slug migration because Objective slugs are durable historical identity.
- Some old terms may remain acceptable in historical update filenames or prose if rewriting them would damage provenance more than it helps current readers.
- Terms from unrelated domains may appear in repo-wide search results, but they are outside this Objective unless they describe payload artifact behavior.

Risks:

- Renaming the durable spec path without a compatibility note could break readers or branches that still link to the old path.
- Over-aggressive search-and-replace could corrupt historical evidence or unrelated domains.
- Leaving too many compatibility mentions could make the rename look incomplete; closure evidence needs a precise allowlist of intentional leftovers.
- Active Objectives such as command-output summaries may drift if they continue to cite the old terminology as the architectural base.

## Open Questions

- Should the old spec path remain as a short legacy shim that points to a new canonical payload-artifacts spec, or should the existing file be edited in place while references use fresh terminology?
- Which historical files should be explicitly excluded from cleanup evidence: old Semantic Updates only, or closed Objective prose as well?
- Should any public skill documentation mention the legacy name for migration, or should public docs only expose payload artifact terminology?

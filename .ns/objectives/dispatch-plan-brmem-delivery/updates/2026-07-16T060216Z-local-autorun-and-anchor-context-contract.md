# Local autorun and Anchor ID context contract settled

## Summary

The Objective is now designed for repeated, local-only `objective-autorun` / `objective-runner-step` execution. After the normal launch preview and confirmation, runner steps may implement and locally verify consecutive roadmap slices without reopening settled product decisions. The run has no external-write authority and stops before the real end-to-end proof.

The dispatch identity and delivery contract are also settled:

- ns creates one Anchor ID before external mutation and uses it to correlate the anchor branch, retained dispatch context, command output, anchor-PR provenance, and Vercel Workflow run.
- Workflow start seeds the Anchor ID as the `dispatch.anchor_id` attribute. Vercel still creates the `wrun_...` ID; exact Workflow Analytics attribute lookup is the recovery path, with zero or multiple matches treated explicitly rather than guessed.
- Branch Memory namespace `dispatch-input` stores a convention-based context envelope under the `<anchor-id>/` prefix. Plan dispatch writes `<anchor-id>/plan/<plan-slug>.md`. Future typed context may add sibling paths.
- The context envelope intentionally has no manifest in this version. The supervisor and agent understand the key convention. A manifest is deferred until deterministic enumeration, required/optional members, or compatibility versioning proves necessary.
- Human output uses progressive disclosure: Anchor ID plus PR/workflow links. Machine output and marked anchor-PR provenance carry the full context locator, Anchor ID, Vercel run ID, and links.

## Objective Impact

- `objective.md` now names `objective-autorun` directly, defines one verified local commit per runner step, records the settled context/identity/output contract, and prohibits both child and parent external writes during autorun.
- `roadmap.md` is ordered as locally executable contract, preparation/delivery, workflow/sandbox, command/wrapper, and durable README slices. The live end-to-end row is an explicit stop boundary and later human-run interlude.
- `references/README-draft.md` explains Anchor ID correlation, the convention-based Branch Memory context envelope, Workflow attribute recovery, and progressive-disclosure provenance from the Pi user's perspective.
- No implementation or live behavior is claimed by this update. PR #3687 is the current open Objective-contract PR containing these changes.

## Follow-Ups

- Run local-only autorun from the first incomplete roadmap row after the normal launch preview and confirmation.
- Stop after locally implementable rows and report the real Branch Memory write/push/deploy/trigger/anchor-PR proof as remaining work.
- Revisit a versioned context manifest only if implementation evidence shows the convention cannot safely support future context members.

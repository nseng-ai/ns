# @nseng-ai/herdr

Private Pi capability for Herdr workspace labeling and dispatch workflows.

## Optional Slot label enrichment

Goal (`/ns:herdr:space:goal`) and Objective
(`/ns:herdr:sidebar:objective-summary`) workspace labels gain a compact Slot
prefix (`s1:add-auth`, `s1:obj:<slug>`) only when both facts hold:

- the caller cwd has the canonical managed-Slot path shape (`slotLabelInput()`);
- the ns SDK reports the Slots extension through the Pi-registered
  `ns:slot:*` command surface.

Without either fact, the workspace receives an unprefixed label. Capability
absence never fails the rename. Do not infer Slot use from a directory basename
alone, add metadata reporting, or add a public generic workspace-summary
command. The label-composition policy is provisional and should move behind a
Herdr workflow pluggability point when that extension surface is designed.

Label enrichment being optional does not make Slots optional for dispatch:
Herdr dispatch and open-branch flows remain Slots-backed and require
`SlotClient` today.

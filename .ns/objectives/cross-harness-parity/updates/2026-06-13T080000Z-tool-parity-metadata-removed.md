# Tool Parity Metadata Removed

## Summary

The parity metadata gate now tracks Pi command surfaces only. Pi tool calls are treated as host-native bridges and no longer require standalone parity metadata rows.

Removed the typed `kind: "tool"` parity records from `@asdl/pi-extensions` package metadata and updated the parity comparison gate to ignore live tool registrations when checking for missing metadata. The human parity table now records command workflows only; tool names may still appear in notes when a command depends on a Pi-native bridge.

## Objective Impact

This narrows the machine-checkable v1 parity contract from command/tool accounting to command accounting. The durable parity question remains workflow reachability: commands that expose user workflows still need FULL/PARTIAL/NONE/WAIVED records, but model-visible tools such as `grill_ask`, `dispatch_runner_subagent`, `handoff_tab_launch`, and `write_saved_plan_file` do not require their own rows.

## Follow-Ups

- Continue the non-FULL audit over remaining command rows only.
- When a command depends on a Pi-native tool, keep the fallback documented on the command row rather than adding a separate tool row.

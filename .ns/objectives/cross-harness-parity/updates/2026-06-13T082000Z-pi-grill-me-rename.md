# Pi Grill Me Rename

## Summary

Renamed the plain structured grill command from `/grill-ui` to `/pi:grill-me` while keeping its parity classification WAIVED.

## Objective Impact

The parity table now records `/pi:grill-me` plus `/pi:grill-with-docs` as the structured grilling WAIVED row. The command remains a Pi-native TUI accelerator over the portable `grill-me` skill; the `grill_ask` tool is a host-native bridge and has no separate parity row.

## Follow-Ups

- `ts/packages/pi-extensions/CONTEXT.md` still mentions `/grill-ui` and `/grill-with-docs-ui`; update it only in a deliberate domain-language/documentation pass per repo CONTEXT editing rules.

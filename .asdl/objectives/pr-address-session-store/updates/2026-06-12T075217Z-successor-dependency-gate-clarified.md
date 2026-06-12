# Successor dependency gate clarified

## Summary

The overlap between `pr-address-session-store`, `pr-address-typescript-port`, and `ts-cli-foundation` was clarified.

`pr-address-session-store` remains the successor workflow redesign: the payload session becomes the run state store, compact stdout becomes default, pipeline-produced composed payload inputs go away, and the skill is rewritten around session-store flow. It is not a parallel porting lane.

Implementation is now explicitly blocked until `pr-address-typescript-port` closes the compatibility-preserving TypeScript cutover: clinkr shell migration, schema-route ownership, bundle distribution, plugin retirement, Python deletion, and package-local payload/reference cleanup.

## Objective Impact

The Objective now states the dependency gate in the thesis area, non-goals, assumptions, and roadmap. This prevents session-store work from changing payload or CLI contracts while the port Objective still needs byte-parity and composed-input compatibility evidence.

The active roadmap remains unchanged in substance, but every row is sequenced after the predecessor Objective closes.

## Follow-Ups

- Do not implement session-store rows while `pr-address-typescript-port` is open.
- When the predecessor closes, rerun `objective-next` for this Objective and start with the descriptor taxonomy/resolution contract row.
- Keep staleness guard and classification round-trip tightening parked unless fresh post-cutover runs prove they are needed.

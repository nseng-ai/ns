# Patch Retirement Follow-Up

## Summary

During pnpm contract grilling, the patch policy for `@earendil-works/pi-ai@0.78.0` was clarified: the package-manager migration should preserve the existing patch behavior while the port is in progress, but the Objective should not let the patch become forgotten long-term debt.

npm compatibility is not the driver for this contract. npm may ignore patch metadata rather than fail on it, but an npm-installed dependency tree would not apply the patch. If pnpm is the selected package-manager contract for TypeScript tooling, pnpm should carry the patch behavior until implementation evidence proves the patch can be removed.

## Objective Impact

The pnpm workspace contract roadmap row now explicitly includes patch-handling policy. The durable direction is:

- preserve the current Pi dependency patch during migration unless implementation evidence proves it unnecessary;
- carry a follow-up to remove the patch after the port when safe;
- treat patch removal as cleanup backed by port evidence, not as an implicit side effect of switching package managers.

This does not complete the pnpm workspace contract row; it narrows one branch of that decision tree.

## Follow-Ups

When deciding or implementing the pnpm contract:

- represent the current patch behavior in pnpm, likely with pnpm's patched dependency mechanism if compatible;
- verify whether the patched behavior is still needed after the Node/pnpm port;
- remove the patch only when the replacement dependency version or migrated runtime behavior makes it unnecessary and the relevant checks still pass.

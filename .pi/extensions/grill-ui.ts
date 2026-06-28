// Project-local Pi adapters are imported directly by Node from .pi/extensions, where workspace
// package exports are not resolvable without the ts workspace's node_modules ancestry.
export { default } from "../../ts/packages/pi-tools/grill/src/extension.ts";

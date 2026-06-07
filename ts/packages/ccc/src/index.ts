export type CccVisibility = "private-workspace";

export type CccImportPolicy = "compose-from-ccc-only";

export type CccOwnedConcern =
	| "cmux-workspace-orchestration"
	| "pi-command-composition"
	| "graphite-stack-orchestration"
	| "worktree-flow-coordination";

export interface CccPackageIdentity {
	readonly packageName: "@asdl/ccc";
	readonly vocabularyName: "CCC";
	readonly expandedName: "Cmux Command and Control";
	readonly visibility: CccVisibility;
	readonly importPolicy: CccImportPolicy;
	readonly ownedConcerns: readonly CccOwnedConcern[];
}

export { default as registerCmuxExtension } from "./cmux.ts";

export const CCC_PACKAGE_IDENTITY = {
	packageName: "@asdl/ccc",
	vocabularyName: "CCC",
	expandedName: "Cmux Command and Control",
	visibility: "private-workspace",
	importPolicy: "compose-from-ccc-only",
	ownedConcerns: [
		"cmux-workspace-orchestration",
		"pi-command-composition",
		"graphite-stack-orchestration",
		"worktree-flow-coordination",
	],
} as const satisfies CccPackageIdentity;

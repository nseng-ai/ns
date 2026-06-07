export { default as registerCmuxExtension } from "./cmux.ts";

export const CCC_PACKAGE_IDENTITY = {
	packageName: "@asdl/ccc",
	vocabularyName: "CCC",
	expandedName: "Cmux Command and Control",
	visibility: "private-workspace",
	ownedConcerns: [
		"cmux-workspace-orchestration",
		"pi-command-composition",
		"graphite-stack-orchestration",
		"worktree-flow-coordination",
	],
} as const;

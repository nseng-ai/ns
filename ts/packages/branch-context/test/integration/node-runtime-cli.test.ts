import { describeNodeRuntimeCliEntrypoint } from "@asdl/core/testing";

describeNodeRuntimeCliEntrypoint({
	name: "branch-context Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/branch-context/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: branch-context" },
		{ type: "contains", text: "--runtime" },
		{ type: "not_contains", text: "exec" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @asdl/branch-context bin branch-context -> ts/packages/branch-context/src/cli.ts\n",
});

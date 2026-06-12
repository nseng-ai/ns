import { describeNodeRuntimeCliEntrypoint } from "@asdl/core/testing";

describeNodeRuntimeCliEntrypoint({
	name: "planned-branch Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/planned-branch/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: planned-branch" },
		{ type: "contains", text: "--runtime" },
		{ type: "not_contains", text: "exec" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @asdl/planned-branch bin planned-branch -> ts/packages/planned-branch/src/cli.ts\n",
});

import { describeNodeRuntimeCliEntrypoint } from "@asdl/core/testing";

describeNodeRuntimeCliEntrypoint({
	name: "plans Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/plans/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: enriched-plan" },
		{ type: "contains", text: "--runtime" },
		{ type: "contains", text: "list" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @asdl/plans bin enriched-plan -> ts/packages/plans/src/cli.ts\n",
});

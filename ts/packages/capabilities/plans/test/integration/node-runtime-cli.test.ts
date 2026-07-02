import { describeNodeRuntimeCliEntrypoint } from "@sdl/cli-runtime/testing";

describeNodeRuntimeCliEntrypoint({
	name: "plans Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/capabilities/plans/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: enriched-plan" },
		{ type: "contains", text: "--runtime" },
		{ type: "contains", text: "list" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @sdl/plans bin enriched-plan -> ts/packages/capabilities/plans/src/cli.ts\n",
});

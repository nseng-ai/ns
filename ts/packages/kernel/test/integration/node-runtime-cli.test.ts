import { describeNodeRuntimeCliEntrypoint } from "@sdl/core/cli-runtime/testing";

describeNodeRuntimeCliEntrypoint({
	name: "ji Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/kernel/src/cli/index.ts",
	cliSourceUrl: new URL("../../src/cli/index.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: ji" },
		{ type: "contains", text: "--runtime" },
		{ type: "not_contains", text: "cp" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @sdl/kernel bin ji -> ts/packages/kernel/src/cli/index.ts\n",
});

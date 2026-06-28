import { describeNodeRuntimeCliEntrypoint } from "@sdl/core/testing";

describeNodeRuntimeCliEntrypoint({
	name: "sdl Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/kernel/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: sdl" },
		{ type: "contains", text: "--runtime" },
		{ type: "not_contains", text: "cp" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @sdl/kernel bin sdl -> ts/packages/kernel/src/cli.ts\n",
});

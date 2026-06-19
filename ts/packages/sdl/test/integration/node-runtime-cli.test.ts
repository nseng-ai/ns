import { describeNodeRuntimeCliEntrypoint } from "@asdl/core/testing";

describeNodeRuntimeCliEntrypoint({
	name: "sdl Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/sdl/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: sdl" },
		{ type: "contains", text: "--runtime" },
		{ type: "contains", text: "cp" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @asdl/sdl bin sdl -> ts/packages/sdl/src/cli.ts\n",
});

import { describeNodeRuntimeCliEntrypoint } from "@asdl/core/testing";

describeNodeRuntimeCliEntrypoint({
	name: "asdl-dev Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/asdl-dev/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: asdl-dev" },
		{ type: "contains", text: "--runtime" },
		{ type: "contains", text: "preview-url" },
	],
	runtimeDiagnostics: "runtime: typescript\nentry_point: asdl-dev bin asdl-dev -> ts/packages/asdl-dev/src/cli.ts\n",
});

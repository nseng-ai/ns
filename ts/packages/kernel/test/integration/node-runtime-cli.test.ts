import { describeNodeRuntimeCliEntrypoint } from "@nseng-ai/foundation/cli-runtime/testing";

describeNodeRuntimeCliEntrypoint({
	name: "ns Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/kernel/src/cli/index.ts",
	cliSourceUrl: new URL("../../src/cli/index.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: ns" },
		{ type: "contains", text: "--runtime" },
		{ type: "not_contains", text: "cp" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @nseng-ai/kernel bin ns -> ts/packages/kernel/src/cli/index.ts\n",
});

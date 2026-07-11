import { describeNodeRuntimeCliEntrypoint } from "@nseng-ai/foundation/cli-runtime/testing";

describeNodeRuntimeCliEntrypoint({
	name: "ns Node runtime CLI entrypoint",
	workspaceRoot: new URL("../../../../../", import.meta.url),
	cliSourcePathFromWorkspace: "packages/hosts/ns-cli/src/cli.ts",
	cliSourceUrl: new URL("../../src/cli.ts", import.meta.url),
	helpAssertions: [
		{ type: "contains", text: "Usage: ns" },
		{ type: "contains", text: "--runtime" },
		{ type: "not_contains", text: "cp" },
	],
	runtimeDiagnostics:
		"runtime: typescript\nentry_point: @nseng-ai/ns bin ns -> ts/packages/hosts/ns-cli/bin/ns.js\n",
});

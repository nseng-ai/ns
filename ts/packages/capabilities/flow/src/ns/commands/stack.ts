import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { defineRawCommand, failure, ok, usageError } from "@nseng-ai/sdk";

import { createPiCommandHost, type PiCommandHost } from "../../pi-command-host/index.ts";

export const FLOW_STACK_COMMAND_SUMMARY =
	"Open the interactive merge-readiness view for the current Graphite stack.";

export interface FlowStackCommandDependencies {
	createHost(): PiCommandHost;
	isInteractiveTerminal(): boolean;
	loadStackViewExtension(): Promise<ExtensionFactory>;
}

export function createFlowStackCommand(dependencies: FlowStackCommandDependencies) {
	return defineRawCommand({
		name: "stack",
		summary: FLOW_STACK_COMMAND_SUMMARY,
		description:
			"Open a fullscreen stack application. Closing it restores the previous terminal screen.",
		async run(ctx, invocation) {
			if (
				invocation.argv.length === 1 &&
				(invocation.argv[0] === "-h" || invocation.argv[0] === "--help")
			) {
				return ok(renderFlowStackHelp(invocation.commandPath));
			}
			if (invocation.argv.length > 0) {
				return usageError("ns flow stack does not accept arguments.", {
					arguments: [...invocation.argv],
				});
			}
			if (!dependencies.isInteractiveTerminal()) {
				return usageError("ns flow stack requires an interactive stdin and stdout terminal.", {
					requirement: "interactive-terminal",
				});
			}

			let registerStackViewExtension;
			try {
				registerStackViewExtension = await dependencies.loadStackViewExtension();
			} catch (error) {
				return failure("pi-unavailable", errorMessage(error));
			}

			const result = await dependencies.createHost().run({
				cwd: ctx.cwd,
				command: "stack:view",
				extensionFactories: [registerStackViewExtension],
				exitPolicy: "after-command",
				presentation: "fullscreen-takeover",
			});

			switch (result.type) {
				case "completed":
					// Pi's real InteractiveMode owns successful process termination. This
					// return is reachable only for injected hosts and future embeddable runtimes.
					return ok("stack view closed");
				case "unavailable":
					return failure("pi-unavailable", result.message);
				case "failed":
					return failure("pi-command-failed", result.message);
			}
		},
	});
}

export const flowStackCommand = createFlowStackCommand({
	createHost: createPiCommandHost,
	isInteractiveTerminal: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
	loadStackViewExtension: async () =>
		(await import("../../pi/stack-view.ts")).createStandaloneStackViewExtension(),
});

export default flowStackCommand;

function renderFlowStackHelp(commandPath: readonly string[] | undefined): string {
	const command = commandPath === undefined ? "ns flow stack" : `ns ${commandPath.join(" ")}`;
	return `${FLOW_STACK_COMMAND_SUMMARY}\n\nUsage: ${command}\n\nRequires an interactive stdin and stdout terminal.`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

import { RealGitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	FLOW_COMMAND_SPECS,
	nodeFlowSubmitRecoveryContext,
	nsFlowCommandSurface,
	resolveFlowSubmitCheckRecovery,
	type FlowSubmitRecoveryContext,
	type FlowSubmitRecoveryGitGateway,
} from "@nseng-ai/flow/api";
import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
	type CliCommandExtensionSpec,
} from "@nseng-ai/pi-runtime/commands/cli-extension";
import type { CompleteSimpleFunction } from "@nseng-ai/pi-runtime/models/call";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";
import {
	createPiCommandExecApi,
	type RawPiExecApi,
} from "@nseng-ai/pi-runtime/shared/command-exec";
import {
	createRealCliCommandResultSummaryContext,
	type CliCommandResultSummaryContext,
} from "@nseng-ai/pi-runtime/commands/cli-command-result-summary-context";

export interface FlowExtensionAPI extends CliCommandExtensionAPI, RawPiExecApi {
	sendUserMessage(content: string): Promise<void> | void;
}

export const flowExtensionParity = definePiSurfaceParity(
	FLOW_COMMAND_SPECS.map((command) => ({
		kind: "command" as const,
		surface: nsFlowCommandSurface(command.name),
		workflow: command.description.replace(/\.$/u, ""),
		parity: "FULL" as const,
		cli: `ns ${command.displayName}`,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-flow" as const,
		sourceModule: "ns-extension",
		notes: `Pi command delegates to ns ${command.displayName} through registerCliCommandExtension; flat lifecycle mirrors are intentionally not registered.`,
	})),
);

export interface FlowExtensionOptions {
	/** Explicit host-composed ns CLI runner. */
	runCli: CliCommandExtensionSpec["runCli"];
	/** Host-composed recovery content context; defaults to the Flow-owned Node context. */
	recoveryContext?: FlowSubmitRecoveryContext;
	/** Host-composed recovery Git consumer; defaults to Git over the Pi exec channel. */
	recoveryGit?: FlowSubmitRecoveryGitGateway;
	/** Host-composed result summarization context; defaults to Pi and Node adapters. */
	resultSummary?: CliCommandResultSummaryContext;
	/** Deterministic model completion for the default result-summary context; test seam only. */
	resultSummaryCompleteFn?: CompleteSimpleFunction;
}

export default function registerFlowExtension(
	pi: FlowExtensionAPI,
	options: FlowExtensionOptions,
): void {
	const commands = createPiCommandExecApi(pi);
	const recoveryGit = options.recoveryGit ?? new RealGitGateway(commands);
	const recoveryContext = options.recoveryContext ?? nodeFlowSubmitRecoveryContext;
	const resultSummary =
		options.resultSummary ??
		createRealCliCommandResultSummaryContext({
			git: new RealGitGateway(commands),
			...optionalEntry("completeFn", options.resultSummaryCompleteFn),
		});
	registerCliCommandExtension(pi, {
		cliName: "ns",
		resultSummary,
		piNamespace: "ns:flow",
		commands: FLOW_COMMAND_SPECS,
		runCli: options.runCli,
		afterCommandComplete: async (details) => {
			if (details.piCommandName !== nsFlowCommandSurface("submit")) return;
			const recovery = await resolveFlowSubmitCheckRecovery({
				details,
				git: recoveryGit,
				recoveryContext,
			});
			if (recovery.type === "not-applicable") return;
			if (recovery.type === "failed") throw flowSubmitRecoveryError(recovery.error);
			await pi.sendUserMessage(recovery.message);
		},
	});
}

function flowSubmitRecoveryError(message: string): Error {
	return new Error(`Could not start flow submit-check recovery: ${message}`);
}

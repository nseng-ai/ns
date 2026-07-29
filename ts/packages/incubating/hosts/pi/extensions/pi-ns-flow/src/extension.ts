import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import {
	FLOW_COMMAND_SPECS,
	nsFlowCommandSurface,
	resolveFlowSubmitCheckRecovery,
	type FlowSubmitRecoveryGitGateway,
	type SubmitCheckRecoveryPromptGateway,
} from "@nseng-ai/flow/api";
import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
	type CliCommandExtensionSpec,
} from "@nseng-ai/pi-runtime/commands/cli-extension";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

export interface FlowExtensionAPI extends CliCommandExtensionAPI, CommandExecApi {
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
	/** Host-composed recovery prompt boundary; defaults to Flow's real Node adapter. */
	recoveryPromptGateway?: SubmitCheckRecoveryPromptGateway;
	/** Host-composed recovery Git consumer; defaults to Git over the Pi exec channel. */
	recoveryGit?: FlowSubmitRecoveryGitGateway;
}

export default function registerFlowExtension(
	pi: FlowExtensionAPI,
	options: FlowExtensionOptions,
): void {
	const recoveryGit = options.recoveryGit ?? new RealGitGateway(pi);
	registerCliCommandExtension(pi, {
		cliName: "ns",
		piNamespace: "ns:flow",
		commands: FLOW_COMMAND_SPECS,
		runCli: options.runCli,
		afterCommandComplete: async (details) => {
			if (details.piCommandName !== nsFlowCommandSurface("submit")) return;
			const recovery = await resolveFlowSubmitCheckRecovery({
				details,
				git: recoveryGit,
				...optionalEntries({ promptGateway: options.recoveryPromptGateway }),
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

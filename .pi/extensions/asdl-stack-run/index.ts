import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type ExecOptions } from "./src/command.ts";
import { formatStackRunPlanResult, loadOrStoreStackRunPlan } from "./src/stack-run.ts";

type PiExecOptions = {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
};

function toPiExecOptions(options: ExecOptions | undefined): PiExecOptions | undefined {
	if (!options) {
		return undefined;
	}
	const piOptions: PiExecOptions = {};
	if (options.cwd !== undefined) {
		piOptions.cwd = options.cwd;
	}
	if (options.timeout !== undefined) {
		piOptions.timeout = options.timeout;
	}
	if (options.signal !== undefined) {
		piOptions.signal = options.signal;
	}
	return piOptions;
}

export default function asdlStackRunExtension(pi: ExtensionAPI): void {
	pi.registerCommand("stack-run", {
		description: "Store or load a Branch Memory stack plan for Objective stack execution.",
		handler: async (args, ctx) => {
			try {
				const result = await loadOrStoreStackRunPlan(args, {
					cwd: ctx.cwd,
					exec: (command, commandArgs, options) =>
						pi.exec(command, commandArgs, toPiExecOptions(options)),
					confirmReplace: ctx.hasUI
						? (message) => ctx.ui.confirm("Replace existing stack plan?", message)
						: undefined,
				});

				if (ctx.hasUI) {
					ctx.ui.notify(formatStackRunPlanResult(result), "info");
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (ctx.hasUI) {
					ctx.ui.notify(message, "error");
				}
				throw error;
			}
		},
	});
}

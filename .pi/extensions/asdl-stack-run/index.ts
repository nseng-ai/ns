import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type ExecOptions } from "./src/command.ts";
import { startNextStackSlice } from "./src/orchestration.ts";
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
		description: "Store or load a Branch Memory stack plan and start the next incomplete slice.",
		handler: async (args, ctx) => {
			const exec = (command: string, commandArgs: string[], options: ExecOptions | undefined) =>
				pi.exec(command, commandArgs, toPiExecOptions(options));

			try {
				const result = await loadOrStoreStackRunPlan(args, {
					cwd: ctx.cwd,
					exec,
					confirmReplace: ctx.hasUI
						? (message) => ctx.ui.confirm("Replace existing stack plan?", message)
						: undefined,
				});

				const slice = await startNextStackSlice(result, { cwd: ctx.cwd, exec });

				if (ctx.hasUI) {
					ctx.ui.notify(formatStackRunPlanResult(result), "info");
					ctx.ui.notify(slice.status === "complete" ? slice.message : `Started ${slice.plannedBranch}.`, "info");
				}

				if (slice.status === "complete") {
					return;
				}

				const parentSession = ctx.sessionManager.getSessionFile();
				if (parentSession) {
					await ctx.newSession({
						parentSession,
						withSession: async (replacementCtx) => {
							await replacementCtx.sendUserMessage(slice.kickoffPrompt);
						},
					});
					return;
				}

				await ctx.newSession({
					withSession: async (replacementCtx) => {
						await replacementCtx.sendUserMessage(slice.kickoffPrompt);
					},
				});
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

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type ExecOptions } from "./src/command.ts";
import {
	closeoutStackSlice,
	formatCloseoutResult,
	takePendingCloseout,
	type PendingCloseouts,
} from "./src/closeout.ts";
import { startNextStackSlice } from "./src/orchestration.ts";
import { formatStackRunPlanResult, loadOrStoreStackRunPlan } from "./src/stack-run.ts";
import { buildStackStatusReport, formatStackStatusReport } from "./src/status.ts";
import { registerStackSliceTools } from "./src/tools.ts";

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
	const pendingCloseouts: PendingCloseouts = new Map();
	registerStackSliceTools(pi, pendingCloseouts);

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

	pi.registerCommand("stack-status", {
		description: "Show status and recovery diagnostics for a stack-run plan.",
		handler: async (args, ctx) => {
			const exec = (command: string, commandArgs: string[], options: ExecOptions | undefined) =>
				pi.exec(command, commandArgs, toPiExecOptions(options));

			try {
				const report = await buildStackStatusReport(args, { cwd: ctx.cwd, exec });
				const formatted = formatStackStatusReport(report);
				if (ctx.hasUI) {
					ctx.ui.notify(formatted, report.warnings.length > 0 ? "warning" : "info");
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

	pi.registerCommand("stack-closeout", {
		description: "Internal stack-run follow-up that stores a queued completion handoff.",
		handler: async (args, ctx) => {
			const id = args.trim();
			if (id.length === 0) {
				const message = "Usage: /stack-closeout <tool-call-id>";
				if (ctx.hasUI) {
					ctx.ui.notify(message, "error");
				}
				throw new Error(message);
			}

			const exec = (command: string, commandArgs: string[], options: ExecOptions | undefined) =>
				pi.exec(command, commandArgs, toPiExecOptions(options));

			try {
				const payload = takePendingCloseout(pendingCloseouts, id);
				const closeout = await closeoutStackSlice(payload, { cwd: ctx.cwd, exec });
				pendingCloseouts.delete(id);
				if (ctx.hasUI) {
					ctx.ui.notify(formatCloseoutResult(closeout), "info");
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

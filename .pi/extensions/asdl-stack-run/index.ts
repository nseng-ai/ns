import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { type ExecFunction, type ExecOptions } from "./src/command.ts";
import {
	closeoutStackSlice,
	formatCloseoutResult,
	takePendingCloseout,
	type PendingCloseouts,
} from "./src/closeout.ts";
import {
	extractObjectiveStackPlanConfirmation,
	findObjectiveStackPlanningState,
	OBJECTIVE_STACK_PLANNING_CUSTOM_TYPE,
	prepareObjectiveStackImpl,
	storeConfirmedObjectiveStackPlan,
	validateConfirmedObjectiveStackPlan,
	type ObjectiveStackImplDependencies,
} from "./src/objective-stack-impl.ts";
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

function createExec(pi: ExtensionAPI): ExecFunction {
	return (command: string, commandArgs: string[], options: ExecOptions | undefined) =>
		pi.exec(command, commandArgs, toPiExecOptions(options));
}

type NewSessionOptions = NonNullable<Parameters<ExtensionCommandContext["newSession"]>[0]>;
type SessionSetup = NonNullable<NewSessionOptions["setup"]>;
type WithReplacementSession = NonNullable<NewSessionOptions["withSession"]>;

async function startFreshSessionWithPrompt(
	ctx: ExtensionCommandContext,
	prompt: string,
	setup?: SessionSetup,
): Promise<void> {
	const withSession: WithReplacementSession = async (replacementCtx) => {
		await replacementCtx.sendUserMessage(prompt);
	};
	const options: NewSessionOptions = {
		...(setup ? { setup } : {}),
		withSession,
	};
	const parentSession = ctx.sessionManager.getSessionFile();
	if (parentSession) {
		await ctx.newSession({ parentSession, ...options });
		return;
	}

	await ctx.newSession(options);
}

function assistantText(message: unknown): string {
	if (typeof message !== "object" || message === null || !("role" in message) || message.role !== "assistant") {
		return "";
	}
	const content = "content" in message && Array.isArray(message.content) ? message.content : [];
	return content
		.map((part) => {
			if (typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part) {
				return typeof part.text === "string" ? part.text : "";
			}
			return "";
		})
		.join("");
}

export default function asdlStackRunExtension(pi: ExtensionAPI): void {
	const pendingCloseouts: PendingCloseouts = new Map();
	registerStackSliceTools(pi, pendingCloseouts);

	pi.on("message_end", async (event, ctx) => {
		const state = findObjectiveStackPlanningState(ctx.sessionManager.getBranch());
		if (state === undefined) {
			return;
		}

		const content = extractObjectiveStackPlanConfirmation(assistantText(event.message));
		if (content === undefined) {
			return;
		}

		let plannedBranches: string[];
		try {
			const plan = validateConfirmedObjectiveStackPlan(content, state);
			plannedBranches = plan.plannedBranches;
		} catch (error) {
			if (ctx.hasUI) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Invalid stack plan confirmation: ${message}`, "error");
			}
			return;
		}

		if (!ctx.hasUI) {
			return;
		}

		const confirmed = await ctx.ui.confirm(
			"Store Objective stack plan?",
			[
				`Store stack plan for ${state.objective} on ${state.planBranch}?`,
				"",
				"Planned branches:",
				...plannedBranches.map((branch) => `- ${branch}`),
				"",
				"After storing, /objective-stack-impl will be queued automatically.",
			].join("\n"),
		);
		if (!confirmed) {
			ctx.ui.notify("Stack plan storage cancelled.", "warning");
			return;
		}

		try {
			const exec = createExec(pi);
			const result = await storeConfirmedObjectiveStackPlan(content, state, { cwd: ctx.cwd, exec });
			ctx.ui.notify(formatStackRunPlanResult(result), "info");
			pi.sendUserMessage(`/objective-stack-impl ${state.objective}`, { deliverAs: "followUp" });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(message, "error");
		}
	});

	pi.registerCommand("stack-run", {
		description: "Store or load a Branch Memory stack plan and start the next incomplete slice.",
		handler: async (args, ctx) => {
			const exec = createExec(pi);

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

				await startFreshSessionWithPrompt(ctx, slice.kickoffPrompt);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (ctx.hasUI) {
					ctx.ui.notify(message, "error");
				}
				throw error;
			}
		},
	});

	pi.registerCommand("objective-stack-impl", {
		description: "Plan an Objective stack if needed, otherwise start the next incomplete stack-run slice.",
		handler: async (args, ctx) => {
			const exec = createExec(pi);
			const deps: ObjectiveStackImplDependencies = { cwd: ctx.cwd, exec };
			if (ctx.hasUI) {
				deps.selectObjective = async (objectives) =>
					ctx.ui.select(
						"Select open Objective:",
						objectives.map((objective) => objective.slug),
					);
			}

			try {
				const prep = await prepareObjectiveStackImpl(args, deps);
				if (prep.status === "plan") {
					if (ctx.hasUI) {
						ctx.ui.notify(`Starting planning session for ${prep.slug}.`, "info");
					}
					await startFreshSessionWithPrompt(ctx, prep.kickoffPrompt, async (sessionManager) => {
						sessionManager.appendCustomEntry(OBJECTIVE_STACK_PLANNING_CUSTOM_TYPE, {
							objective: prep.slug,
							planBranch: prep.planBranch,
							replan: prep.replan,
						});
					});
					return;
				}

				const slice = await startNextStackSlice(prep.planResult, { cwd: ctx.cwd, exec });

				if (ctx.hasUI) {
					ctx.ui.notify(formatStackRunPlanResult(prep.planResult), "info");
					ctx.ui.notify(slice.status === "complete" ? slice.message : `Started ${slice.plannedBranch}.`, "info");
				}

				if (slice.status === "complete") {
					return;
				}

				await startFreshSessionWithPrompt(ctx, slice.kickoffPrompt);
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
			const exec = createExec(pi);

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

			const exec = createExec(pi);

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

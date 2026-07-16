import { nsCommandSurface } from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resolveSelectedSavedPlanFile, type SelectedSavedPlanFile } from "@nseng-ai/plans/api";
import { createPiCommandExecApi } from "@nseng-ai/pi/shared/command-exec";

export const DISPATCH_PLAN_PI_COMMAND_NAME = nsCommandSurface("dispatch", "plan");

export const DISPATCH_PLAN_PI_USAGE = `Usage: /${DISPATCH_PLAN_PI_COMMAND_NAME} [absolute-or-home-plan-file.md]

Dispatch one Saved Plan through the explicit ns dispatch plan kernel command.

With no path, this command selects the most recent Saved Plan created in the current Pi session. It does not fall back to a plan from another session or branch. Pass an explicit path to select a different Saved Plan.

Options:
  --help, -h  Show this help.`;

export interface DispatchPlanPiCommandContext {
	readonly cwd: string;
	readonly sessionManager?: {
		getBranch?(): readonly unknown[];
		getEntries?(): readonly unknown[];
	};
	readonly ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
}

export interface DispatchPlanPiExtensionApi {
	registerCommand(
		name: string,
		definition: {
			readonly description?: string;
			handler(args: string, ctx: DispatchPlanPiCommandContext): Promise<void> | void;
		},
	): void;
	exec(
		command: string,
		args: string[],
		options?: { readonly cwd?: string; readonly signal?: AbortSignal; readonly timeout?: number },
	): Promise<{
		readonly stdout?: string;
		readonly stderr?: string;
		readonly code: number;
		readonly killed?: boolean;
	}>;
}

export interface DispatchPlanPiExtensionOptions {
	readonly resolveSavedPlan?: (
		pi: ReturnType<typeof createPiCommandExecApi>,
		options: Parameters<typeof resolveSelectedSavedPlanFile>[1],
	) => Promise<SelectedSavedPlanFile>;
}

export default function registerDispatchPlanPiExtension(
	pi: DispatchPlanPiExtensionApi,
	options: DispatchPlanPiExtensionOptions = {},
): void {
	const resolveSavedPlan = options.resolveSavedPlan ?? resolveSelectedSavedPlanFile;
	pi.registerCommand(DISPATCH_PLAN_PI_COMMAND_NAME, {
		description:
			"Dispatch an explicit Saved Plan, or the latest Saved Plan from the current Pi session.",
		handler: async (rawArgs, ctx) => {
			const args = rawArgs.trim();
			if (args === "--help" || args === "-h") {
				ctx.ui.notify(DISPATCH_PLAN_PI_USAGE, "info");
				return;
			}

			try {
				const commandApi = createPiCommandExecApi(pi);
				const entries =
					ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
				const selected = await resolveSavedPlan(commandApi, {
					cwd: ctx.cwd,
					...(args.length === 0 ? { sessionEntries: entries } : { explicitPath: args }),
				});
				const filePath = selected.type === "explicit" ? selected.filePath : selected.plan.filePath;
				const result = await commandApi.exec("ns", ["dispatch", "plan", filePath], {
					cwd: ctx.cwd,
				});
				if (result.type !== "exited" || result.code !== 0) {
					const detail = result.stderr.trim() || result.stdout.trim() || result.type;
					ctx.ui.notify(`Saved Plan dispatch failed: ${detail}`, "error");
					return;
				}
				ctx.ui.notify(result.stdout.trim() || "Saved Plan dispatched.", "info");
			} catch (error) {
				ctx.ui.notify(`Saved Plan dispatch failed: ${formatErrorMessage(error)}`, "error");
			}
		},
	});
}

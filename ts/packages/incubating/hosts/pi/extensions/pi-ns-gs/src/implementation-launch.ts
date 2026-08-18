import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/api";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";

import type { CommandContext } from "./host-types.ts";
import type { GsPiCommandApi } from "./pi-command-api.ts";

export type GsImplementationLaunchResult =
	| { type: "launched"; branch: string; key: string; parentSession?: string }
	| { type: "checkout-failed"; branch: string; key: string; message: string }
	| { type: "cancelled"; branch: string; key: string; parentSession?: string }
	| {
			type: "new-session-failed";
			branch: string;
			key: string;
			message: string;
			parentSession?: string;
	  };

export interface GsImplementationLaunchOptions {
	pi: GsPiCommandApi;
	ctx: CommandContext;
	git: Pick<GitGateway, "checkout">;
	branch: string;
	key: string;
	attachment: "created" | "reused";
}

export async function runGsImplementationLaunch(
	options: GsImplementationLaunchOptions,
): Promise<GsImplementationLaunchResult> {
	const checkout = await options.git.checkout({ cwd: options.ctx.cwd, branch: options.branch });
	if (!checkout.ok) {
		present(
			options.pi,
			options.ctx,
			`${options.attachment === "created" ? "Created" : "Reused"} Attached Plan, but exact checkout failed.\nTarget: ${options.branch}\nKey: ${options.key}\nRecovery: git checkout ${shellQuote(options.branch)} then run ${formatImplBranchContextCommand(options.key)}\n${checkout.error.message}`,
			"error",
		);
		return {
			type: "checkout-failed",
			branch: options.branch,
			key: options.key,
			message: checkout.error.message,
		};
	}

	let activated = false;
	const parentSession = options.ctx.sessionManager?.getSessionFile?.();
	const parentSessionPart = parentSession === undefined ? {} : { parentSession };
	try {
		if (options.ctx.newSession === undefined) {
			throw new Error("Pi session replacement is unavailable.");
		}
		const result = await options.ctx.newSession({
			...optionalEntry("parentSession", parentSession),
			withSession: async (newCtx) => {
				activated = true;
				await newCtx.sendUserMessage(formatImplBranchContextCommand(options.key));
			},
		});
		if (result.cancelled) {
			present(
				options.pi,
				options.ctx,
				`Fresh session was cancelled; ${options.branch} remains checked out. Run ${formatImplBranchContextCommand(options.key)} to continue.`,
				"warning",
			);
			return {
				type: "cancelled",
				branch: options.branch,
				key: options.key,
				...parentSessionPart,
			};
		}
		return {
			type: "launched",
			branch: options.branch,
			key: options.key,
			...parentSessionPart,
		};
	} catch (error) {
		if (activated) throw error;
		const message = formatErrorMessage(error);
		present(
			options.pi,
			options.ctx,
			`Fresh session failed before activation; ${options.branch} remains checked out.\nTarget: ${options.branch}\nKey: ${options.key}\nRecovery: run ${formatImplBranchContextCommand(options.key)}\n${message}`,
			"error",
		);
		return {
			type: "new-session-failed",
			branch: options.branch,
			key: options.key,
			message,
			...parentSessionPart,
		};
	}
}

function present(
	pi: GsPiCommandApi,
	ctx: CommandContext,
	content: string,
	level: "warning" | "error",
): void {
	if (pi.rawPi.sendMessage !== undefined) {
		pi.rawPi.sendMessage({
			customType: "ns.gs.new-branch-from-plan",
			content,
			display: true,
		});
		return;
	}
	ctx.ui.notify(content, level);
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

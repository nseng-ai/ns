import { type BranchContextEvidence } from "@nseng-ai/branch-context/api";
import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/api";
import { setRuntimeStatus } from "@nseng-ai/pi-runtime/runtime/status";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { NewSessionOptions, NewSessionResult } from "../host-types.ts";

export type BranchContextBranchAndImplNewSessionOptions = NewSessionOptions;
export type BranchContextBranchAndImplNewSessionResult = NewSessionResult;

interface LaunchStatusUi {
	setStatus?(key: string, value: string | undefined): void;
}

export interface BranchContextBranchAndImplContext {
	cwd: string;
	hasUI: boolean;
	ui: LaunchStatusUi;
	sessionManager?: {
		getSessionFile?(): string | undefined;
	};
	newSession(
		options?: BranchContextBranchAndImplNewSessionOptions,
	): Promise<BranchContextBranchAndImplNewSessionResult>;
}

export interface BranchContextBranchAndImplLaunchOptions {
	git: Pick<GitGateway, "checkout">;
	ctx: BranchContextBranchAndImplContext;
	statusKey: string;
	target: Pick<BranchContextEvidence, "branch" | "key">;
	signal?: AbortSignal;
}

export type BranchContextBranchAndImplLaunchPhase = "checkout" | "new-session";

export type BranchContextBranchAndImplLaunchResult =
	| { type: "launched"; branch: string; key: string; parentSession?: string }
	| { type: "cancelled"; branch: string; key: string; parentSession?: string }
	| {
			type: "failed";
			branch: string;
			key: string;
			phase: BranchContextBranchAndImplLaunchPhase;
			message: string;
			parentSession?: string;
	  };

export async function runBranchContextBranchAndImplLaunch(
	options: BranchContextBranchAndImplLaunchOptions,
): Promise<BranchContextBranchAndImplLaunchResult> {
	const { branch, key } = options.target;
	let isReplacementSessionActive = false;
	let phase: BranchContextBranchAndImplLaunchPhase = "checkout";
	let parentSession: string | undefined;

	try {
		setRuntimeStatus(options.ctx, options.statusKey, "checking out branch context…");
		const checkout = await checkoutBranchContext({
			git: options.git,
			cwd: options.ctx.cwd,
			targetBranch: branch,
			signal: options.signal,
		});
		if (checkout.type === "failed") {
			return { type: "failed", branch, key, phase: "checkout", message: checkout.message };
		}

		phase = "new-session";
		setRuntimeStatus(options.ctx, options.statusKey, "starting implementation session…");
		parentSession = options.ctx.sessionManager?.getSessionFile?.();
		const parentSessionPart = parentSession === undefined ? {} : { parentSession };
		const newSessionOptions: BranchContextBranchAndImplNewSessionOptions = {
			withSession: async (newCtx) => {
				isReplacementSessionActive = true;
				await newCtx.sendUserMessage(formatImplBranchContextCommand(key));
			},
		};
		if (parentSession !== undefined) {
			newSessionOptions.parentSession = parentSession;
		}

		const result = await options.ctx.newSession(newSessionOptions);
		if (result.cancelled) {
			return { type: "cancelled", branch, key, ...parentSessionPart };
		}

		return { type: "launched", branch, key, ...parentSessionPart };
	} catch (error) {
		if (isReplacementSessionActive) {
			throw error;
		}
		return {
			type: "failed",
			branch,
			key,
			phase,
			message: error instanceof Error ? error.message : String(error),
			...(parentSession === undefined ? {} : { parentSession }),
		};
	} finally {
		if (!isReplacementSessionActive) {
			setRuntimeStatus(options.ctx, options.statusKey, undefined);
		}
	}
}

export function formatBranchContextBranchAndImplFollowUpFlow(
	targetBranch: string,
	key: string,
): string {
	return [`git checkout ${targetBranch}`, "/new", formatImplBranchContextCommand(key)].join("\n");
}

type CheckoutResult = { type: "ok" } | { type: "failed"; message: string };

interface CheckoutBranchContextOptions {
	git: Pick<GitGateway, "checkout">;
	cwd: string;
	targetBranch: string;
	signal: AbortSignal | undefined;
}

async function checkoutBranchContext(
	options: CheckoutBranchContextOptions,
): Promise<CheckoutResult> {
	const result = await options.git.checkout({
		cwd: options.cwd,
		branch: options.targetBranch,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (result.ok) {
		return { type: "ok" };
	}

	return {
		type: "failed",
		message: result.error.message,
	};
}

import { type BranchContextEvidence } from "@ji/branch-context/api";
import { formatImplBranchContextCommand } from "@ji/pi/commands";
import type { ExecResult } from "@ji/core/command";
import { setRuntimeStatus } from "@ji/pi/runtime/status";
import type { ExtensionAPI, NewSessionOptions, NewSessionResult } from "../host-types.ts";

export type BranchContextGtUpstackImplHost = Pick<ExtensionAPI, "exec">;

export type BranchContextGtUpstackImplNewSessionOptions = NewSessionOptions;
export type BranchContextGtUpstackImplNewSessionResult = NewSessionResult;

interface LaunchStatusUi {
	setStatus?(key: string, value: string | undefined): void;
}

export interface BranchContextGtUpstackImplContext {
	cwd: string;
	hasUI: boolean;
	ui: LaunchStatusUi;
	sessionManager?: {
		getSessionFile?(): string | undefined;
	};
	newSession(
		options?: BranchContextGtUpstackImplNewSessionOptions,
	): Promise<BranchContextGtUpstackImplNewSessionResult>;
}

export interface BranchContextGtUpstackImplLaunchOptions {
	host: BranchContextGtUpstackImplHost;
	ctx: BranchContextGtUpstackImplContext;
	statusKey: string;
	target: Pick<BranchContextEvidence, "branch" | "key">;
	signal?: AbortSignal;
}

export type BranchContextGtUpstackImplLaunchPhase = "checkout" | "new-session";

export type BranchContextGtUpstackImplLaunchResult =
	| { type: "launched"; branch: string; key: string; parentSession?: string }
	| { type: "cancelled"; branch: string; key: string; parentSession?: string }
	| {
			type: "failed";
			branch: string;
			key: string;
			phase: BranchContextGtUpstackImplLaunchPhase;
			message: string;
			parentSession?: string;
	  };

const CHECKOUT_TIMEOUT_MS = 30_000;

export async function runBranchContextGtUpstackImplLaunch(
	options: BranchContextGtUpstackImplLaunchOptions,
): Promise<BranchContextGtUpstackImplLaunchResult> {
	const { branch, key } = options.target;
	let isReplacementSessionActive = false;
	let phase: BranchContextGtUpstackImplLaunchPhase = "checkout";
	let parentSession: string | undefined;

	try {
		setRuntimeStatus(options.ctx, options.statusKey, "checking out branch context…");
		const checkout = await checkoutBranchContext({
			host: options.host,
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
		const newSessionOptions: BranchContextGtUpstackImplNewSessionOptions = {
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

export function formatBranchContextGtUpstackImplFollowUpFlow(
	targetBranch: string,
	key: string,
): string {
	return [`git checkout ${targetBranch}`, "/new", formatImplBranchContextCommand(key)].join("\n");
}

type CheckoutResult = { type: "ok" } | { type: "failed"; message: string };

interface CheckoutBranchContextOptions {
	host: BranchContextGtUpstackImplHost;
	cwd: string;
	targetBranch: string;
	signal: AbortSignal | undefined;
}

async function checkoutBranchContext(
	options: CheckoutBranchContextOptions,
): Promise<CheckoutResult> {
	const result = await options.host.exec("git", ["checkout", options.targetBranch], {
		cwd: options.cwd,
		timeout: CHECKOUT_TIMEOUT_MS,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (result.code === 0) {
		return { type: "ok" };
	}

	const output = formatCheckoutFailureOutput(result);
	return {
		type: "failed",
		message: `git checkout ${options.targetBranch} failed with exit code ${result.code}: ${output}`,
	};
}

function formatCheckoutFailureOutput(result: ExecResult): string {
	if (result.stderr.length > 0) {
		return result.stderr;
	}
	if (result.stdout.length > 0) {
		return result.stdout;
	}
	return "(no output)";
}

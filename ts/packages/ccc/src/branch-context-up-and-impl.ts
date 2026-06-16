import { formatImplBranchContextCommand, type BranchContextEvidence } from "@asdl/branch-context";
import type { ExecResult } from "@asdl/core/exec";
import type { SessionReplacementContext, SessionReplacementOptions, SessionReplacementResult } from "@asdl/pi-extension-runtime/session-replacement";
import { setLaunchStatus, type LaunchStatusUi, type LaunchStatusUpdater } from "./launch-status.ts";

export interface BranchContextUpAndImplHost {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult>;
}

export type BranchContextUpAndImplNewSessionContext = SessionReplacementContext;
export type BranchContextUpAndImplNewSessionOptions = SessionReplacementOptions<BranchContextUpAndImplNewSessionContext>;
export type BranchContextUpAndImplNewSessionResult = SessionReplacementResult;

export interface BranchContextUpAndImplContext {
	cwd: string;
	hasUI: boolean;
	ui: LaunchStatusUi;
	sessionManager?: {
		getSessionFile?(): string | undefined;
	};
	newSession(options?: BranchContextUpAndImplNewSessionOptions): Promise<BranchContextUpAndImplNewSessionResult>;
}

export interface BranchContextUpAndImplLaunchOptions {
	host: BranchContextUpAndImplHost;
	ctx: BranchContextUpAndImplContext;
	statusKey: string;
	target: Pick<BranchContextEvidence, "branch" | "key">;
	signal?: AbortSignal;
}

export type BranchContextUpAndImplLaunchPhase = "checkout" | "new-session";

export type BranchContextUpAndImplLaunchResult =
	| { type: "launched"; branch: string; key: string; parentSession?: string }
	| { type: "cancelled"; branch: string; key: string; parentSession?: string }
	| { type: "failed"; branch: string; key: string; phase: BranchContextUpAndImplLaunchPhase; message: string; parentSession?: string };

const CHECKOUT_TIMEOUT_MS = 30_000;

export async function runBranchContextUpAndImplLaunch(options: BranchContextUpAndImplLaunchOptions): Promise<BranchContextUpAndImplLaunchResult> {
	const { branch, key } = options.target;
	const statusUpdater = buildStatusUpdater(options);
	let isReplacementSessionActive = false;
	let phase: BranchContextUpAndImplLaunchPhase = "checkout";
	let parentSession: string | undefined;

	try {
		setLaunchStatus(statusUpdater, "checking out branch context…");
		const checkout = await checkoutBranchContext({ host: options.host, cwd: options.ctx.cwd, targetBranch: branch, signal: options.signal });
		if (checkout.type === "failed") {
			return { type: "failed", branch, key, phase: "checkout", message: checkout.message };
		}

		phase = "new-session";
		setLaunchStatus(statusUpdater, "starting implementation session…");
		parentSession = options.ctx.sessionManager?.getSessionFile?.();
		const parentSessionPart = parentSession === undefined ? {} : { parentSession };
		const newSessionOptions: BranchContextUpAndImplNewSessionOptions = {
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
		setLaunchStatus(statusUpdater, undefined);
	}
}

export function formatBranchContextUpAndImplFollowUpFlow(targetBranch: string, key: string): string {
	return [`git checkout ${targetBranch}`, "/new", formatImplBranchContextCommand(key)].join("\n");
}

type CheckoutResult = { type: "ok" } | { type: "failed"; message: string };

interface CheckoutBranchContextOptions {
	host: BranchContextUpAndImplHost;
	cwd: string;
	targetBranch: string;
	signal: AbortSignal | undefined;
}

async function checkoutBranchContext(options: CheckoutBranchContextOptions): Promise<CheckoutResult> {
	const result = await options.host.exec("git", ["checkout", options.targetBranch], {
		cwd: options.cwd,
		timeout: CHECKOUT_TIMEOUT_MS,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (result.code === 0) {
		return { type: "ok" };
	}

	const output = formatCheckoutFailureOutput(result);
	return { type: "failed", message: `git checkout ${options.targetBranch} failed with exit code ${result.code}: ${output}` };
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

function buildStatusUpdater(options: BranchContextUpAndImplLaunchOptions): LaunchStatusUpdater {
	return {
		hasUI: options.ctx.hasUI,
		ui: options.ctx.ui,
		statusKey: options.statusKey,
	};
}

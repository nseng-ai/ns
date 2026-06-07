import { setLaunchStatus, type LaunchStatusUi, type LaunchStatusUpdater } from "./launch-status.ts";
import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";
import type { PlannedBranchEvidence } from "@asdl/planned-branch";

export interface PlannedBranchUpAndImplHost {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult>;
}

export interface PlannedBranchUpAndImplNewSessionContext {
	sendUserMessage(content: string): Promise<void> | void;
}

export interface PlannedBranchUpAndImplNewSessionOptions {
	parentSession?: string;
	withSession?(ctx: PlannedBranchUpAndImplNewSessionContext): Promise<void> | void;
}

export interface PlannedBranchUpAndImplContext {
	cwd: string;
	hasUI: boolean;
	ui: LaunchStatusUi;
	sessionManager?: {
		getSessionFile?(): string | undefined;
	};
	newSession(options?: PlannedBranchUpAndImplNewSessionOptions): Promise<{ cancelled: boolean }>;
}

export interface PlannedBranchUpAndImplLaunchOptions {
	host: PlannedBranchUpAndImplHost;
	ctx: PlannedBranchUpAndImplContext;
	statusKey: string;
	evidence: Pick<PlannedBranchEvidence, "branch" | "key">;
	signal?: AbortSignal;
}

export type PlannedBranchUpAndImplLaunchPhase = "checkout" | "new-session";

export type PlannedBranchUpAndImplLaunchResult =
	| { type: "launched"; branch: string; key: string; parentSession?: string }
	| { type: "cancelled"; branch: string; key: string; message: string; parentSession?: string }
	| { type: "failed"; branch: string; key: string; phase: PlannedBranchUpAndImplLaunchPhase; message: string; parentSession?: string };

const CHECKOUT_TIMEOUT_MS = 30_000;

export async function runPlannedBranchUpAndImplLaunch(options: PlannedBranchUpAndImplLaunchOptions): Promise<PlannedBranchUpAndImplLaunchResult> {
	const { branch, key } = options.evidence;
	const statusUpdater = buildStatusUpdater(options);
	let isReplacementSessionActive = false;
	let phase: PlannedBranchUpAndImplLaunchPhase = "checkout";
	let parentSession: string | undefined;

	try {
		setLaunchStatus(statusUpdater, "checking out planned branch…");
		const checkout = await checkoutPlannedBranch({ host: options.host, cwd: options.ctx.cwd, targetBranch: branch, signal: options.signal });
		if (checkout.type === "failed") {
			return { type: "failed", branch, key, phase: "checkout", message: checkout.message };
		}

		phase = "new-session";
		setLaunchStatus(statusUpdater, "starting implementation session…");
		parentSession = options.ctx.sessionManager?.getSessionFile?.();
		const parentSessionPart = parentSession === undefined ? {} : { parentSession };
		const newSessionOptions: PlannedBranchUpAndImplNewSessionOptions = {
			withSession: async (newCtx) => {
				isReplacementSessionActive = true;
				await newCtx.sendUserMessage(`/planned-branch:impl ${key}`);
			},
		};
		if (parentSession !== undefined) {
			newSessionOptions.parentSession = parentSession;
		}

		const result = await options.ctx.newSession(newSessionOptions);
		if (result.cancelled) {
			return {
				type: "cancelled",
				branch,
				key,
				message: `Created planned branch, attached the plan, and checked out ${branch}, but starting the implementation session was cancelled. Run /planned-branch:impl ${key} to continue.`,
				...parentSessionPart,
			};
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

export function formatPlannedBranchUpAndImplFollowUpFlow(targetBranch: string, key: string): string {
	return [`git checkout ${targetBranch}`, "/new", `/planned-branch:impl ${key}`].join("\n");
}

type CheckoutResult = { type: "ok" } | { type: "failed"; message: string };

interface CheckoutPlannedBranchOptions {
	host: PlannedBranchUpAndImplHost;
	cwd: string;
	targetBranch: string;
	signal: AbortSignal | undefined;
}

async function checkoutPlannedBranch(options: CheckoutPlannedBranchOptions): Promise<CheckoutResult> {
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

function buildStatusUpdater(options: PlannedBranchUpAndImplLaunchOptions): LaunchStatusUpdater {
	return {
		hasUI: options.ctx.hasUI,
		ui: options.ctx.ui,
		statusKey: options.statusKey,
	};
}

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
	ui: {
		setStatus?(key: string, value: string | undefined): void;
	};
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
	let isReplacementSessionActive = false;
	let phase: PlannedBranchUpAndImplLaunchPhase = "checkout";
	let parentSession: string | undefined;

	try {
		setStatus(options, "checking out planned branch…");
		const checkout = await checkoutPlannedBranch(options.host, options.ctx.cwd, branch, options.signal);
		if (checkout.type === "failed") {
			return { type: "failed", branch, key, phase: "checkout", message: checkout.message };
		}

		phase = "new-session";
		setStatus(options, "starting implementation session…");
		parentSession = options.ctx.sessionManager?.getSessionFile?.();
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
				...(parentSession === undefined ? {} : { parentSession }),
			};
		}

		return { type: "launched", branch, key, ...(parentSession === undefined ? {} : { parentSession }) };
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
		setStatus(options, undefined);
	}
}

export function formatPlannedBranchUpAndImplFollowUpFlow(targetBranch: string, key: string): string {
	return [`git checkout ${targetBranch}`, "/new", `/planned-branch:impl ${key}`].join("\n");
}

type CheckoutResult = { type: "ok" } | { type: "failed"; message: string };

async function checkoutPlannedBranch(
	host: PlannedBranchUpAndImplHost,
	cwd: string,
	targetBranch: string,
	signal: AbortSignal | undefined,
): Promise<CheckoutResult> {
	const result = await host.exec("git", ["checkout", targetBranch], { cwd, timeout: CHECKOUT_TIMEOUT_MS, ...(signal === undefined ? {} : { signal }) });
	if (result.code === 0) {
		return { type: "ok" };
	}

	return { type: "failed", message: `git checkout ${targetBranch} failed with exit code ${result.code}: ${result.stderr || result.stdout || "(no output)"}` };
}

function setStatus(options: PlannedBranchUpAndImplLaunchOptions, value: string | undefined): void {
	if (options.ctx.hasUI) {
		options.ctx.ui.setStatus?.(options.statusKey, value);
	}
}

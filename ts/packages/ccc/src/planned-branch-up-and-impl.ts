import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";

const CHECKOUT_TIMEOUT_MS = 30_000;

export interface PlannedBranchUpAndImplLaunchHost {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
}

export interface PlannedBranchUpAndImplReplacementSessionContext {
	sendUserMessage(content: string): Promise<void> | void;
}

export interface PlannedBranchUpAndImplNewSessionOptions {
	parentSession?: string;
	withSession?(ctx: PlannedBranchUpAndImplReplacementSessionContext): Promise<void> | void;
}

export interface PlannedBranchUpAndImplSessionLauncher {
	newSession(options?: PlannedBranchUpAndImplNewSessionOptions): Promise<{ cancelled: boolean }>;
	sessionManager?: { getSessionFile?(): string | undefined };
}

export interface PlannedBranchUpAndImplStatusUI {
	setStatus?(key: string, value: string | undefined): void;
}

export interface PlannedBranchUpAndImplDryRunOptions {
	previewText: string;
	targetBranch: string;
	key: string;
}

export interface PlannedBranchUpAndImplLaunchOptions {
	host: PlannedBranchUpAndImplLaunchHost;
	sessionLauncher: PlannedBranchUpAndImplSessionLauncher;
	cwd: string;
	ui: PlannedBranchUpAndImplStatusUI | undefined;
	statusKey: string;
	branch: string;
	key: string;
}

export type PlannedBranchUpAndImplLaunchResult =
	| { type: "launched"; branch: string; key: string }
	| { type: "cancelled"; branch: string; key: string; message: string }
	| { type: "checkout-failed"; branch: string; key: string; message: string }
	| { type: "new-session-failed"; branch: string; key: string; message: string };

export function formatPlannedBranchUpAndImplFollowUpFlow(targetBranch: string, key: string): string {
	return [`git checkout ${targetBranch}`, "/new", `/planned-branch:impl ${key}`].join("\n");
}

export function formatPlannedBranchUpAndImplDryRun(options: PlannedBranchUpAndImplDryRunOptions): string {
	return [
		"Dry run: no branch was created, no checkout happened, no new session was started, and no implementation prompt was sent.",
		options.previewText,
		`New-session implementation flow:\n${formatPlannedBranchUpAndImplFollowUpFlow(options.targetBranch, options.key)}`,
	].join("\n\n");
}

export async function launchPlannedBranchUpAndImpl(
	options: PlannedBranchUpAndImplLaunchOptions,
): Promise<PlannedBranchUpAndImplLaunchResult> {
	setStatus(options, "checking out planned branch…");
	const checkout = await options.host.exec("git", ["checkout", options.branch], { cwd: options.cwd, timeout: CHECKOUT_TIMEOUT_MS });
	if (checkout.code !== 0) {
		setStatus(options, undefined);
		return {
			type: "checkout-failed",
			branch: options.branch,
			key: options.key,
			message: formatCheckoutFailure(options.branch, checkout),
		};
	}

	setStatus(options, "starting implementation session…");
	let isReplacementSessionActive = false;
	try {
		const newSessionOptions: PlannedBranchUpAndImplNewSessionOptions = {
			withSession: async (newCtx) => {
				isReplacementSessionActive = true;
				await newCtx.sendUserMessage(`/planned-branch:impl ${options.key}`);
			},
		};
		const parentSession = options.sessionLauncher.sessionManager?.getSessionFile?.();
		if (parentSession !== undefined) {
			newSessionOptions.parentSession = parentSession;
		}

		setStatus(options, undefined);
		const result = await options.sessionLauncher.newSession(newSessionOptions);
		if (!result.cancelled) {
			return { type: "launched", branch: options.branch, key: options.key };
		}

		return {
			type: "cancelled",
			branch: options.branch,
			key: options.key,
			message: `Created planned branch, attached the plan, and checked out ${options.branch}, but starting the implementation session was cancelled. Run /planned-branch:impl ${options.key} to continue.`,
		};
	} catch (error) {
		if (isReplacementSessionActive) {
			// Once the replacement session is active, its turn owns any send/handler failure.
			throw error;
		}
		setStatus(options, undefined);
		return { type: "new-session-failed", branch: options.branch, key: options.key, message: formatUnknownError(error) };
	}
}

function formatCheckoutFailure(branch: string, result: ExecResult): string {
	return `git checkout ${branch} failed with exit code ${result.code}: ${result.stderr || result.stdout || "(no output)"}`;
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function setStatus(options: PlannedBranchUpAndImplLaunchOptions, value: string | undefined): void {
	options.ui?.setStatus?.(options.statusKey, value);
}

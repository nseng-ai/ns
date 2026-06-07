import { describe, expect, test } from "bun:test";

import {
	formatPlannedBranchUpAndImplDryRun,
	formatPlannedBranchUpAndImplFollowUpFlow,
	launchPlannedBranchUpAndImpl,
	type PlannedBranchUpAndImplLaunchHost,
	type PlannedBranchUpAndImplNewSessionOptions,
	type PlannedBranchUpAndImplSessionLauncher,
} from "../src/planned-branch-up-and-impl.ts";
import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";

const ROOT = "/repo";
const BRANCH = "planned-branches/add-widget";
const KEY = "add-widget.md";
const STATUS_KEY = "planned-branch:up-and-impl";

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

class FakeHost implements PlannedBranchUpAndImplLaunchHost {
	readonly execCalls: ExecCall[] = [];
	private readonly results: ExecResult[];

	constructor(results: ExecResult[] = [execResult()]) {
		this.results = [...results];
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const result = this.results.shift();
		if (result === undefined) {
			return execResult({ code: 99, stderr: "unexpected exec" });
		}
		return result;
	}
}

class FakeSessionLauncher implements PlannedBranchUpAndImplSessionLauncher {
	readonly parentSessions: Array<string | undefined> = [];
	readonly replacementUserMessages: string[] = [];
	readonly sessionManager?: { getSessionFile(): string | undefined };
	newSessionCount = 0;
	shouldCancel = false;
	startupError: Error | undefined;
	replacementError: Error | undefined;

	constructor(parentSession?: string) {
		if (parentSession !== undefined) {
			this.sessionManager = { getSessionFile: () => parentSession };
		}
	}

	async newSession(options?: PlannedBranchUpAndImplNewSessionOptions): Promise<{ cancelled: boolean }> {
		this.newSessionCount += 1;
		this.parentSessions.push(options?.parentSession);
		if (this.startupError !== undefined) {
			throw this.startupError;
		}
		if (this.shouldCancel) {
			return { cancelled: true };
		}
		await options?.withSession?.({
			sendUserMessage: (content) => {
				this.replacementUserMessages.push(content);
				if (this.replacementError !== undefined) {
					throw this.replacementError;
				}
			},
		});
		return { cancelled: false };
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function launchOptions(input: {
	host?: PlannedBranchUpAndImplLaunchHost;
	sessionLauncher?: PlannedBranchUpAndImplSessionLauncher;
	statuses?: Array<{ key: string; value: string | undefined }>;
} = {}): Parameters<typeof launchPlannedBranchUpAndImpl>[0] {
	const statuses = input.statuses ?? [];
	return {
		host: input.host ?? new FakeHost(),
		sessionLauncher: input.sessionLauncher ?? new FakeSessionLauncher(),
		cwd: ROOT,
		hasUI: true,
		ui: {
			setStatus(key, value): void {
				statuses.push({ key, value });
			},
		},
		statusKey: STATUS_KEY,
		branch: BRANCH,
		key: KEY,
	};
}

describe("planned-branch up-and-impl CCC orchestration", () => {
	test("formats dry-run text with checkout, new session, and impl dispatch", () => {
		const previewText = "Preview\nBranch creation: graphite";

		expect(formatPlannedBranchUpAndImplFollowUpFlow(BRANCH, KEY)).toBe(`git checkout ${BRANCH}\n/new\n/planned-branch:impl ${KEY}`);
		expect(formatPlannedBranchUpAndImplDryRun({ previewText, targetBranch: BRANCH, key: KEY })).toBe(
			`Dry run: no branch was created, no checkout happened, no new session was started, and no implementation prompt was sent.\n\n${previewText}\n\nNew-session implementation flow:\ngit checkout ${BRANCH}\n/new\n/planned-branch:impl ${KEY}`,
		);
	});

	test("checks out the branch and dispatches impl in a replacement session", async () => {
		const host = new FakeHost();
		const launcher = new FakeSessionLauncher("/sessions/source.jsonl");
		const statuses: Array<{ key: string; value: string | undefined }> = [];

		const result = await launchPlannedBranchUpAndImpl(launchOptions({ host, sessionLauncher: launcher, statuses }));

		expect(result).toEqual({ type: "launched", branch: BRANCH, key: KEY });
		expect(host.execCalls).toEqual([{ command: "git", args: ["checkout", BRANCH], options: { cwd: ROOT, timeout: 30_000 } }]);
		expect(launcher.parentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(launcher.replacementUserMessages).toEqual([`/planned-branch:impl ${KEY}`]);
		expect(statuses).toEqual([
			{ key: STATUS_KEY, value: "checking out planned branch…" },
			{ key: STATUS_KEY, value: "starting implementation session…" },
			{ key: STATUS_KEY, value: undefined },
		]);
	});

	test("returns checkout failures without starting a new session", async () => {
		const host = new FakeHost([execResult({ code: 1, stderr: "local changes would be overwritten" })]);
		const launcher = new FakeSessionLauncher();
		const statuses: Array<{ key: string; value: string | undefined }> = [];

		const result = await launchPlannedBranchUpAndImpl(launchOptions({ host, sessionLauncher: launcher, statuses }));

		expect(result).toEqual({
			type: "checkout-failed",
			branch: BRANCH,
			key: KEY,
			message: `git checkout ${BRANCH} failed with exit code 1: local changes would be overwritten`,
		});
		expect(launcher.newSessionCount).toBe(0);
		expect(statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});

	test("returns cancellation with manual recovery text", async () => {
		const launcher = new FakeSessionLauncher();
		launcher.shouldCancel = true;

		const result = await launchPlannedBranchUpAndImpl(launchOptions({ sessionLauncher: launcher }));

		expect(result.type).toBe("cancelled");
		if (result.type !== "cancelled") {
			throw new Error("expected cancellation");
		}
		expect(result.message).toContain(`Run /planned-branch:impl ${KEY} to continue.`);
	});

	test("returns new-session startup failures before replacement session activation", async () => {
		const launcher = new FakeSessionLauncher();
		launcher.startupError = new Error("cmux unavailable");
		const statuses: Array<{ key: string; value: string | undefined }> = [];

		const result = await launchPlannedBranchUpAndImpl(launchOptions({ sessionLauncher: launcher, statuses }));

		expect(result).toEqual({ type: "new-session-failed", branch: BRANCH, key: KEY, message: "cmux unavailable" });
		expect(statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});

	test("rethrows failures once replacement session dispatch is active", async () => {
		const launcher = new FakeSessionLauncher();
		launcher.replacementError = new Error("replacement failed");

		await expect(launchPlannedBranchUpAndImpl(launchOptions({ sessionLauncher: launcher }))).rejects.toThrow("replacement failed");
		expect(launcher.replacementUserMessages).toEqual([`/planned-branch:impl ${KEY}`]);
	});
});

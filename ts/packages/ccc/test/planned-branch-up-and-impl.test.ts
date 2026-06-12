import { describe, expect, test } from "vitest";

import {
	formatPlannedBranchUpAndImplFollowUpFlow,
	runPlannedBranchUpAndImplLaunch,
	type PlannedBranchUpAndImplContext,
	type PlannedBranchUpAndImplNewSessionOptions,
} from "../src/planned-branch-up-and-impl.ts";
import { FakePi, ROOT, step } from "./ccc-test-harness.ts";

const BRANCH = "planned-branches/widget-flow";
const KEY = "widget-flow.md";
const STATUS_KEY = "planned-branch:upstack-impl-session";

class FakeUpAndImplContext implements PlannedBranchUpAndImplContext {
	readonly cwd = ROOT;
	readonly hasUI = true;
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly replacementUserMessages: string[] = [];
	readonly newSessionParentSessions: Array<string | undefined> = [];
	readonly ui = {
		setStatus: (key: string, value: string | undefined): void => {
			this.statuses.push({ key, value });
		},
	};
	sessionManager?: { getSessionFile?(): string | undefined };
	shouldCancelNewSession = false;
	shouldThrowBeforeReplacement = false;
	shouldThrowDuringReplacementSend = false;

	constructor(options: { parentSession?: string } = {}) {
		if (options.parentSession !== undefined) {
			this.sessionManager = { getSessionFile: () => options.parentSession };
		}
	}

	async newSession(options?: PlannedBranchUpAndImplNewSessionOptions): Promise<{ cancelled: boolean }> {
		this.newSessionParentSessions.push(options?.parentSession);
		if (this.shouldThrowBeforeReplacement) {
			throw new Error("new session failed");
		}
		if (this.shouldCancelNewSession) {
			return { cancelled: true };
		}
		await options?.withSession?.({
			sendUserMessage: async (content: string) => {
				if (this.shouldThrowDuringReplacementSend) {
					throw new Error("replacement send failed");
				}
				this.replacementUserMessages.push(content);
			},
		});
		return { cancelled: false };
	}
}

function checkoutStep(result: Parameters<typeof step>[2] = {}): ReturnType<typeof step> {
	return step("git", ["checkout", BRANCH], result);
}

describe("planned-branch up-and-impl CCC launch orchestration", () => {
	test("checks out the branch and dispatches impl in a new session", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext({ parentSession: "/sessions/source.jsonl" });

		const result = await runPlannedBranchUpAndImplLaunch({ host: pi, ctx, statusKey: STATUS_KEY, evidence: { branch: BRANCH, key: KEY } });

		pi.assertDone();
		expect(pi.execCalls).toEqual([{ command: "git", args: ["checkout", BRANCH], options: { cwd: ROOT, timeout: 30_000 } }]);
		expect(ctx.newSessionParentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(ctx.replacementUserMessages).toEqual([`/planned-branch:impl ${KEY}`]);
		expect(ctx.statuses).toEqual([
			{ key: STATUS_KEY, value: "checking out planned branch…" },
			{ key: STATUS_KEY, value: "starting implementation session…" },
			{ key: STATUS_KEY, value: undefined },
		]);
		expect(result).toEqual({ type: "launched", branch: BRANCH, key: KEY, parentSession: "/sessions/source.jsonl" });
	});

	test("formats the manual follow-up flow", () => {
		expect(formatPlannedBranchUpAndImplFollowUpFlow(BRANCH, KEY)).toBe(`git checkout ${BRANCH}\n/new\n/planned-branch:impl ${KEY}`);
	});

	test("returns checkout failure without starting a new session", async () => {
		const pi = new FakePi({ script: [checkoutStep({ code: 2, stderr: "checkout failed" })] });
		const ctx = new FakeUpAndImplContext();

		const result = await runPlannedBranchUpAndImplLaunch({ host: pi, ctx, statusKey: STATUS_KEY, evidence: { branch: BRANCH, key: KEY } });

		pi.assertDone();
		expect(ctx.newSessionParentSessions).toEqual([]);
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
		expect(result).toEqual({
			type: "failed",
			branch: BRANCH,
			key: KEY,
			phase: "checkout",
			message: `git checkout ${BRANCH} failed with exit code 2: checkout failed`,
		});
	});

	test("reports checkout startup errors as checkout failures", async () => {
		const ctx = new FakeUpAndImplContext();
		const host = {
			async exec(): Promise<never> {
				throw new Error("git is unavailable");
			},
		};

		const result = await runPlannedBranchUpAndImplLaunch({ host, ctx, statusKey: STATUS_KEY, evidence: { branch: BRANCH, key: KEY } });

		expect(ctx.newSessionParentSessions).toEqual([]);
		expect(result).toEqual({ type: "failed", branch: BRANCH, key: KEY, phase: "checkout", message: "git is unavailable" });
	});

	test("returns cancellation facts for the caller to format", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext();
		ctx.shouldCancelNewSession = true;

		const result = await runPlannedBranchUpAndImplLaunch({ host: pi, ctx, statusKey: STATUS_KEY, evidence: { branch: BRANCH, key: KEY } });

		pi.assertDone();
		expect(result).toEqual({ type: "cancelled", branch: BRANCH, key: KEY });
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});

	test("returns new-session failure before replacement activation", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext();
		ctx.shouldThrowBeforeReplacement = true;

		const result = await runPlannedBranchUpAndImplLaunch({ host: pi, ctx, statusKey: STATUS_KEY, evidence: { branch: BRANCH, key: KEY } });

		pi.assertDone();
		expect(result).toEqual({ type: "failed", branch: BRANCH, key: KEY, phase: "new-session", message: "new session failed" });
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});

	test("rethrows replacement-session failures after activation", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext();
		ctx.shouldThrowDuringReplacementSend = true;

		await expect(runPlannedBranchUpAndImplLaunch({ host: pi, ctx, statusKey: STATUS_KEY, evidence: { branch: BRANCH, key: KEY } })).rejects.toThrow(
			"replacement send failed",
		);

		pi.assertDone();
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});
});

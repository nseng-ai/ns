import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_PLAN_KEY,
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	formatImplBranchContextCommand,
} from "@asdl/branch-context";
import {
	formatBranchContextUpAndImplFollowUpFlow,
	runBranchContextUpAndImplLaunch,
	type BranchContextUpAndImplContext,
	type BranchContextUpAndImplNewSessionOptions,
} from "../src/branch-context-up-and-impl.ts";
import { FakePi, ROOT, step } from "./ccc-test-harness.ts";

const BRANCH = "branch-contexts/widget-flow";
const KEY = "widget-flow.md";
const STATUS_KEY = "branch-context:upstack-impl-session";

class FakeUpAndImplContext implements BranchContextUpAndImplContext {
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

	async newSession(
		options?: BranchContextUpAndImplNewSessionOptions,
	): Promise<{ cancelled: boolean }> {
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

describe("branch-context up-and-impl CCC launch orchestration", () => {
	test("checks out the branch and dispatches impl in a new session", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext({ parentSession: "/sessions/source.jsonl" });

		const result = await runBranchContextUpAndImplLaunch({
			host: pi,
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

		pi.assertDone();
		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["checkout", BRANCH], options: { cwd: ROOT, timeout: 30_000 } },
		]);
		expect(ctx.newSessionParentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(ctx.replacementUserMessages).toEqual([formatImplBranchContextCommand(KEY)]);
		expect(ctx.statuses).toEqual([
			{ key: STATUS_KEY, value: "checking out branch context…" },
			{ key: STATUS_KEY, value: "starting implementation session…" },
			{ key: STATUS_KEY, value: undefined },
		]);
		expect(result).toEqual({
			type: "launched",
			branch: BRANCH,
			key: KEY,
			parentSession: "/sessions/source.jsonl",
		});
	});

	test("keeps the bare impl command for the default plan key", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext();

		const result = await runBranchContextUpAndImplLaunch({
			host: pi,
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: BRANCH_CONTEXT_PLAN_KEY },
		});

		pi.assertDone();
		expect(ctx.replacementUserMessages).toEqual([
			formatImplBranchContextCommand(BRANCH_CONTEXT_PLAN_KEY),
		]);
		expect(result).toEqual({ type: "launched", branch: BRANCH, key: BRANCH_CONTEXT_PLAN_KEY });
	});

	test("formats impl commands from branch-context keys", () => {
		expect(formatImplBranchContextCommand(BRANCH_CONTEXT_PLAN_KEY)).toBe(
			`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME}`,
		);
		expect(formatImplBranchContextCommand(KEY)).toBe(`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${KEY}`);
	});

	test("formats the manual follow-up flow", () => {
		expect(formatBranchContextUpAndImplFollowUpFlow(BRANCH, BRANCH_CONTEXT_PLAN_KEY)).toBe(
			`git checkout ${BRANCH}\n/new\n${formatImplBranchContextCommand(BRANCH_CONTEXT_PLAN_KEY)}`,
		);
		expect(formatBranchContextUpAndImplFollowUpFlow(BRANCH, KEY)).toBe(
			`git checkout ${BRANCH}\n/new\n${formatImplBranchContextCommand(KEY)}`,
		);
	});

	test("returns checkout failure without starting a new session", async () => {
		const pi = new FakePi({ script: [checkoutStep({ code: 2, stderr: "checkout failed" })] });
		const ctx = new FakeUpAndImplContext();

		const result = await runBranchContextUpAndImplLaunch({
			host: pi,
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

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

		const result = await runBranchContextUpAndImplLaunch({
			host,
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

		expect(ctx.newSessionParentSessions).toEqual([]);
		expect(result).toEqual({
			type: "failed",
			branch: BRANCH,
			key: KEY,
			phase: "checkout",
			message: "git is unavailable",
		});
	});

	test("returns cancellation facts for the caller to format", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext();
		ctx.shouldCancelNewSession = true;

		const result = await runBranchContextUpAndImplLaunch({
			host: pi,
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

		pi.assertDone();
		expect(result).toEqual({ type: "cancelled", branch: BRANCH, key: KEY });
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});

	test("returns new-session failure before replacement activation", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext();
		ctx.shouldThrowBeforeReplacement = true;

		const result = await runBranchContextUpAndImplLaunch({
			host: pi,
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

		pi.assertDone();
		expect(result).toEqual({
			type: "failed",
			branch: BRANCH,
			key: KEY,
			phase: "new-session",
			message: "new session failed",
		});
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});

	test("rethrows replacement-session failures after activation", async () => {
		const pi = new FakePi({ script: [checkoutStep()] });
		const ctx = new FakeUpAndImplContext();
		ctx.shouldThrowDuringReplacementSend = true;

		await expect(
			runBranchContextUpAndImplLaunch({
				host: pi,
				ctx,
				statusKey: STATUS_KEY,
				target: { branch: BRANCH, key: KEY },
			}),
		).rejects.toThrow("replacement send failed");

		pi.assertDone();
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});
});

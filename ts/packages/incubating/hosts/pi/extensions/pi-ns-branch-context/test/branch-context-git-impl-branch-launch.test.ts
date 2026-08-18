import { describe, expect, test } from "vitest";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";

import {
	IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	formatImplBranchContextCommand,
} from "@nseng-ai/branch-context/api";
import {
	formatBranchContextImplBranchFollowUpFlow,
	runBranchContextImplBranchLaunch,
	type BranchContextImplBranchContext,
	type BranchContextImplBranchNewSessionOptions,
} from "../src/session/impl-branch-launch.ts";
import { createImplBranchGitGateway } from "../src/session/git-gateway.ts";
import { FakePi, ROOT, step } from "./branch-context-extension-support.ts";

const BRANCH = "branch-contexts/widget-flow";
const KEY = "widget-flow.md";
const STATUS_KEY = "ns:git:impl-branch-from-plan";

class FakeImplBranchContext implements BranchContextImplBranchContext {
	readonly cwd = ROOT;
	readonly hasUI = true;
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly replacementUserMessages: string[] = [];
	readonly newSessionParentSessions: Array<string | undefined> = [];
	private isSessionReplaced = false;
	readonly ui = {
		setStatus: (key: string, value: string | undefined): void => {
			this.assertActiveSession();
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
		options?: BranchContextImplBranchNewSessionOptions,
	): Promise<{ cancelled: boolean }> {
		this.assertActiveSession();
		this.newSessionParentSessions.push(options?.parentSession);
		if (this.shouldThrowBeforeReplacement) {
			throw new Error("new session failed");
		}
		if (this.shouldCancelNewSession) {
			return { cancelled: true };
		}
		this.isSessionReplaced = true;
		await options?.withSession?.({
			cwd: this.cwd,
			hasUI: this.hasUI,
			ui: {
				notify() {},
				setStatus() {},
			},
			async waitForIdle(): Promise<void> {},
			newSession: (newSessionOptions) => this.newSession(newSessionOptions),
			sendMessage() {},
			sendUserMessage: async (content: string) => {
				if (this.shouldThrowDuringReplacementSend) {
					throw new Error("replacement send failed");
				}
				this.replacementUserMessages.push(content);
			},
		});
		return { cancelled: false };
	}

	wasSessionReplaced(): boolean {
		return this.isSessionReplaced;
	}

	private assertActiveSession(): void {
		if (this.isSessionReplaced) {
			throw new Error(
				"stale extension context after session replacement; use withSession for post-replacement work",
			);
		}
	}
}

function checkoutStep(result: Parameters<typeof step>[2] = {}): ReturnType<typeof step> {
	return step("git", ["checkout", BRANCH], result);
}

describe("branch-context Git impl-branch Pi launch orchestration", () => {
	test("checks out the branch and dispatches impl in a new session", async () => {
		const pi = new FakePi([checkoutStep()]);
		const ctx = new FakeImplBranchContext({ parentSession: "/sessions/source.jsonl" });

		const result = await runBranchContextImplBranchLaunch({
			git: createImplBranchGitGateway(createPiCommandExecApi(pi)),
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

		pi.assertDone();
		expect(pi.execCalls).toEqual([
			{
				command: "git",
				args: ["checkout", BRANCH],
				options: { cwd: ROOT, signal: expect.any(AbortSignal) },
			},
		]);
		expect(ctx.newSessionParentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(ctx.replacementUserMessages).toEqual([formatImplBranchContextCommand(KEY)]);
		expect(ctx.statuses).toEqual([
			{ key: STATUS_KEY, value: "checking out branch context…" },
			{ key: STATUS_KEY, value: "starting implementation session…" },
		]);
		expect(ctx.wasSessionReplaced()).toBe(true);
		expect(result).toEqual({
			type: "launched",
			branch: BRANCH,
			key: KEY,
			parentSession: "/sessions/source.jsonl",
		});
	});

	test("formats impl commands from branch-context keys", () => {
		expect(formatImplBranchContextCommand("branch-scoped-plan.md")).toBe(
			`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} branch-scoped-plan.md`,
		);
		expect(formatImplBranchContextCommand(KEY)).toBe(`/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${KEY}`);
	});

	test("formats the manual follow-up flow", () => {
		expect(formatBranchContextImplBranchFollowUpFlow(BRANCH, "branch-scoped-plan.md")).toBe(
			`git checkout ${BRANCH}\n/new\n${formatImplBranchContextCommand("branch-scoped-plan.md")}`,
		);
		expect(formatBranchContextImplBranchFollowUpFlow(BRANCH, KEY)).toBe(
			`git checkout ${BRANCH}\n/new\n${formatImplBranchContextCommand(KEY)}`,
		);
	});

	test("returns checkout failure without starting a new session", async () => {
		const pi = new FakePi([checkoutStep({ code: 2, stderr: "checkout failed" })]);
		const ctx = new FakeImplBranchContext();

		const result = await runBranchContextImplBranchLaunch({
			git: createImplBranchGitGateway(createPiCommandExecApi(pi)),
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
			message: `git checkout failed (exit code 2).

Command: git checkout ${BRANCH}

----- stdout tail -----
(empty)

----- stderr tail -----
checkout failed`,
		});
	});

	test("reports checkout startup errors as checkout failures", async () => {
		const pi = new FakePi([
			{ command: "git", args: ["checkout", BRANCH], error: new Error("git is unavailable") },
		]);
		const ctx = new FakeImplBranchContext();

		const result = await runBranchContextImplBranchLaunch({
			git: createImplBranchGitGateway(createPiCommandExecApi(pi)),
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

		pi.assertDone();
		expect(ctx.newSessionParentSessions).toEqual([]);
		expect(result).toEqual({
			type: "failed",
			branch: BRANCH,
			key: KEY,
			phase: "checkout",
			message: `git checkout failed (spawn failed: git is unavailable).

Command: git checkout ${BRANCH}

----- stdout tail -----
(empty)

----- stderr tail -----
git is unavailable`,
		});
	});

	test("returns cancellation facts for the caller to format", async () => {
		const pi = new FakePi([checkoutStep()]);
		const ctx = new FakeImplBranchContext();
		ctx.shouldCancelNewSession = true;

		const result = await runBranchContextImplBranchLaunch({
			git: createImplBranchGitGateway(createPiCommandExecApi(pi)),
			ctx,
			statusKey: STATUS_KEY,
			target: { branch: BRANCH, key: KEY },
		});

		pi.assertDone();
		expect(result).toEqual({ type: "cancelled", branch: BRANCH, key: KEY });
		expect(ctx.statuses.at(-1)).toEqual({ key: STATUS_KEY, value: undefined });
	});

	test("returns new-session failure before replacement activation", async () => {
		const pi = new FakePi([checkoutStep()]);
		const ctx = new FakeImplBranchContext();
		ctx.shouldThrowBeforeReplacement = true;

		const result = await runBranchContextImplBranchLaunch({
			git: createImplBranchGitGateway(createPiCommandExecApi(pi)),
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
		const pi = new FakePi([checkoutStep()]);
		const ctx = new FakeImplBranchContext();
		ctx.shouldThrowDuringReplacementSend = true;

		await expect(
			runBranchContextImplBranchLaunch({
				git: createImplBranchGitGateway(createPiCommandExecApi(pi)),
				ctx,
				statusKey: STATUS_KEY,
				target: { branch: BRANCH, key: KEY },
			}),
		).rejects.toThrow("replacement send failed");

		pi.assertDone();
		expect(ctx.statuses).toEqual([
			{ key: STATUS_KEY, value: "checking out branch context…" },
			{ key: STATUS_KEY, value: "starting implementation session…" },
		]);
		expect(ctx.wasSessionReplaced()).toBe(true);
	});
});

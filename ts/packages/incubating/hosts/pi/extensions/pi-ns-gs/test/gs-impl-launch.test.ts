import { describe, expect, test } from "vitest";

import type { GitOperationResult } from "@nseng-ai/foundation/git";
import type { CommandContext, ExtensionAPI } from "../src/host-types.ts";
import { runGsImplementationLaunch } from "../src/implementation-launch.ts";
import type { GsPiCommandApi } from "../src/pi-command-api.ts";

function fixture(
	state: {
		checkout?: GitOperationResult;
		cancelled?: boolean;
		newSessionFailure?: Error;
		dispatchFailure?: Error;
	} = {},
) {
	const messages: string[] = [];
	const notices: Array<{ message: string; level?: string }> = [];
	const checkouts: string[] = [];
	const sessionOptions: unknown[] = [];
	const git = {
		async checkout(options: { branch: string }): Promise<GitOperationResult> {
			checkouts.push(options.branch);
			return state.checkout ?? { ok: true };
		},
	};
	const ctx: CommandContext = {
		cwd: "/repo",
		hasUI: true,
		ui: {
			notify(message, level) {
				notices.push({ message, ...(level === undefined ? {} : { level }) });
			},
			setStatus() {},
		},
		async waitForIdle() {},
		sessionManager: { getSessionFile: () => "/sessions/parent.jsonl" },
		async newSession(options) {
			sessionOptions.push(options);
			if (state.newSessionFailure !== undefined) throw state.newSessionFailure;
			if (!state.cancelled) {
				await options?.withSession?.({
					...ctx,
					async sendUserMessage(message: string) {
						messages.push(message);
						if (state.dispatchFailure !== undefined) throw state.dispatchFailure;
					},
				});
			}
			return { cancelled: state.cancelled ?? false };
		},
	};
	const rawPi: ExtensionAPI = {
		registerCommand() {},
		async exec() {
			throw new Error("unused");
		},
	};
	const pi: GsPiCommandApi = {
		rawPi,
		async exec() {
			throw new Error("unused");
		},
	};
	return { pi, ctx, git, messages, notices, checkouts, sessionOptions };
}

function launch(subject: ReturnType<typeof fixture>) {
	return runGsImplementationLaunch({
		pi: subject.pi,
		ctx: subject.ctx,
		git: subject.git,
		branch: "target",
		key: "target.md",
		attachment: "created",
	});
}

describe("GS attached-plan implementation launch", () => {
	test("checks out exactly, carries parent evidence, and dispatches the formatted command", async () => {
		const subject = fixture();
		await expect(launch(subject)).resolves.toEqual({
			type: "launched",
			branch: "target",
			key: "target.md",
			parentSession: "/sessions/parent.jsonl",
		});
		expect(subject.checkouts).toEqual(["target"]);
		expect(subject.sessionOptions).toMatchObject([{ parentSession: "/sessions/parent.jsonl" }]);
		expect(subject.messages).toEqual(["/ns:branch-context:impl-attached-plan target.md"]);
	});

	test("cancellation leaves the target and reports exact recovery", async () => {
		const subject = fixture({ cancelled: true });
		await expect(launch(subject)).resolves.toEqual({
			type: "cancelled",
			branch: "target",
			key: "target.md",
			parentSession: "/sessions/parent.jsonl",
		});
		expect(subject.notices.at(-1)?.message).toContain(
			"Run /ns:branch-context:impl-attached-plan target.md",
		);
	});

	test("pre-activation failure reports target, key, and manual recovery", async () => {
		const subject = fixture({ newSessionFailure: new Error("replacement unavailable") });
		await expect(launch(subject)).resolves.toEqual({
			type: "new-session-failed",
			branch: "target",
			key: "target.md",
			message: "replacement unavailable",
			parentSession: "/sessions/parent.jsonl",
		});
		expect(subject.notices.at(-1)?.message).toContain("Target: target");
		expect(subject.notices.at(-1)?.message).toContain("Key: target.md");
		expect(subject.notices.at(-1)?.message).toContain("replacement unavailable");
	});

	test("post-activation dispatch failure follows the replacement contract", async () => {
		const subject = fixture({ dispatchFailure: new Error("dispatch failed") });
		await expect(launch(subject)).rejects.toThrow("dispatch failed");
	});

	test("checkout failure prevents session launch", async () => {
		const subject = fixture({
			checkout: { ok: false, error: { code: "checkout", message: "checkout failed" } },
		});
		await expect(launch(subject)).resolves.toEqual({
			type: "checkout-failed",
			branch: "target",
			key: "target.md",
			message: "checkout failed",
		});
		expect(subject.sessionOptions).toEqual([]);
		expect(subject.notices.at(-1)?.message).toContain("Created Attached Plan");
		expect(subject.notices.at(-1)?.message).toContain("checkout failed");
	});
});

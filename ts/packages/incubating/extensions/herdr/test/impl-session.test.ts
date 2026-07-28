import { describe, expect, test } from "vitest";

import { buildRawTextModelArgs } from "@nseng-ai/extension-kit/model-slug";
import { buildTrackedBranchSlugPrompt } from "@nseng-ai/extension-kit/tracked-branch-payload";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import {
	buildSessionContinuationTurn,
	handleHerdrImplSession,
	type HerdrSessionContinuationGateway,
} from "../src/core/impl-session.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	BRANCH,
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	ROOT,
	SOURCE_BRANCH,
	START_POINT,
	step,
	WORKTREE,
} from "./herdr-test-harness.ts";

const MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
const FOCUS = "Finish the active-session implementation workflow";

function slotClient() {
	return {
		async checkoutCurrent() {
			return { ok: false as const, failure: { errorType: "unexpected", message: "unexpected" } };
		},
		async checkoutBranch(options: { branchName: string }) {
			return {
				ok: true as const,
				target: {
					slotName: "slot-01",
					branchName: options.branchName,
					worktreePath: WORKTREE,
					isAlreadyAssigned: false,
					hasCreatedBranch: false,
					currentWorktreeNote: null,
				},
			};
		},
	};
}

class FakeSessionContinuation implements HerdrSessionContinuationGateway {
	readonly calls: Array<{
		sourceSessionFile: string;
		sourceLeafId: string;
		destinationCwd: string;
		continuationMessage: string;
	}> = [];

	async cloneActiveSessionForImplementation(request: (typeof this.calls)[number]) {
		this.calls.push({ ...request });
		return {
			ok: true as const,
			value: { sessionFile: "/sessions/destination.jsonl", sessionId: "destination-id" },
		};
	}
}

function successfulPi(): FakePi {
	return new FakePi({
		script: [
			step(
				"pi",
				buildRawTextModelArgs(
					buildTrackedBranchSlugPrompt({ kind: "task", content: FOCUS }),
					MODEL_SELECTION,
				),
				{ stdout: `${BRANCH}\n` },
			),
			step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
			step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"]),
		],
	});
}

function baseOptions() {
	return {
		args: FOCUS,
		notifyProgress: () => {},
		preflightActiveSessionSource: () => ({ ok: true as const }),
		buildActiveContextText: () => ({ ok: true as const, text: "active context" }),
		deriveFocus: async () => ({ ok: true as const, focus: "derived focus" }),
		slotClient: slotClient(),
	};
}

describe("Herdr active-session implementation", () => {
	test("fails an in-memory source before model, Git, Slot, session, or Herdr mutation", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = new FakeCommandContext({ branchEntries: [{ type: "message", id: "leaf" }] });
		let derived = false;
		let checkedOut = false;

		await handleHerdrImplSession(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				trunkBranch: "master",
				git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
				herdr,
				sessionContinuation,
			},
			{
				...baseOptions(),
				deriveFocus: async () => {
					derived = true;
					return { ok: true, focus: "unused" };
				},
				slotClient: {
					async checkoutCurrent() {
						checkedOut = true;
						return { ok: false as const, failure: { errorType: "unused", message: "unused" } };
					},
					async checkoutBranch() {
						checkedOut = true;
						return { ok: false as const, failure: { errorType: "unused", message: "unused" } };
					},
				},
			},
		);

		expect(ctx.events[0]).toBe("wait-for-idle");
		expect(ctx.notifications[0]?.message).toContain("persisted caller Pi session");
		expect(derived).toBe(false);
		expect(checkedOut).toBe(false);
		expect(pi.execCalls).toEqual([]);
		expect(sessionContinuation.calls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
	});

	test.each([
		["malformed", "Failed to read active Pi session source: malformed JSONL"],
		["empty", "Source session branch is empty."],
		["leaf mismatch", "selected path does not end at authoritative leaf"],
	] as const)(
		"fails a %s persisted source before selection or mutation",
		async (_case, message) => {
			const pi = new FakePi();
			const herdr = new FakeHerdrGateway();
			const sessionContinuation = new FakeSessionContinuation();
			const ctx = new FakeCommandContext({
				sessionFile: "/sessions/source.jsonl",
				leafId: "leaf",
				branchEntries: [{ type: "message", id: "leaf" }],
			});
			let builtContext = false;
			let derived = false;
			let checkedOut = false;

			await handleHerdrImplSession(
				{
					commands: createHerdrPiCommandApi(pi),
					pi: ctx,
					trunkBranch: "master",
					git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
					herdr,
					sessionContinuation,
				},
				{
					...baseOptions(),
					preflightActiveSessionSource: () => ({ ok: false, message }),
					buildActiveContextText: () => {
						builtContext = true;
						return { ok: true, text: "unused" };
					},
					deriveFocus: async () => {
						derived = true;
						return { ok: true, focus: "unused" };
					},
					slotClient: {
						async checkoutCurrent() {
							checkedOut = true;
							return { ok: false as const, failure: { errorType: "unused", message: "unused" } };
						},
						async checkoutBranch() {
							checkedOut = true;
							return { ok: false as const, failure: { errorType: "unused", message: "unused" } };
						},
					},
				},
			);

			expect(ctx.selections).toEqual([]);
			expect(ctx.notifications.at(-1)?.message).toContain(message);
			expect(ctx.notifications.at(-1)?.message).toContain("No branch, Slot");
			expect(builtContext).toBe(false);
			expect(derived).toBe(false);
			expect(checkedOut).toBe(false);
			expect(pi.execCalls).toEqual([]);
			expect(sessionContinuation.calls).toEqual([]);
			expect(herdr.createWorkspaceCalls).toEqual([]);
		},
	);

	test("uses trimmed explicit focus without invoking focus derivation", async () => {
		const pi = successfulPi();
		const herdr = new FakeHerdrGateway();
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = new FakeCommandContext({
			cwd: ROOT,
			sessionFile: "/sessions/source.jsonl",
			leafId: "leaf",
			branchEntries: [{ type: "message", id: "leaf" }],
			model: { provider: "openai-codex", id: "gpt-5.6-luna" },
		});
		let derived = false;
		let builtContext = false;

		await handleHerdrImplSession(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				trunkBranch: "master",
				git: new InMemoryGitGateway({
					currentBranch: SOURCE_BRANCH,
					headCommit: START_POINT,
					repoRoot: ROOT,
				}),
				herdr,
				sessionContinuation,
			},
			{
				...baseOptions(),
				args: `  ${FOCUS}  `,
				buildActiveContextText: () => {
					builtContext = true;
					return { ok: true, text: "unused" };
				},
				deriveFocus: async () => {
					derived = true;
					return { ok: true, focus: "wrong" };
				},
			},
		);

		expect(derived).toBe(false);
		expect(builtContext).toBe(false);
		expect(sessionContinuation.calls).toEqual([
			{
				sourceSessionFile: "/sessions/source.jsonl",
				sourceLeafId: "leaf",
				destinationCwd: WORKTREE,
				continuationMessage: buildSessionContinuationTurn(FOCUS),
			},
		]);
		expect(herdr.paneRunCalls[0]?.command).toBe(
			"pi --provider openai-codex --model gpt-5.6-luna --thinking medium --session /sessions/destination.jsonl",
		);
		expect(ctx.notifications.at(-1)?.message).toContain(
			"Destination session: /sessions/destination.jsonl",
		);
		pi.assertDone();
	});

	test("reports recoverable destination evidence when session preparation fails", async () => {
		const pi = successfulPi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: ROOT,
			sessionFile: "/sessions/source.jsonl",
			leafId: "leaf",
			branchEntries: [{ type: "message", id: "leaf" }],
		});
		const continuation: HerdrSessionContinuationGateway = {
			async cloneActiveSessionForImplementation() {
				return {
					ok: false,
					error: {
						message: "Could not append continuation turn.",
						recoverableDestination: {
							sessionFile: "/sessions/recoverable.jsonl",
							sessionId: "recoverable-id",
						},
					},
				};
			},
		};

		await handleHerdrImplSession(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				trunkBranch: "master",
				git: new InMemoryGitGateway({
					currentBranch: SOURCE_BRANCH,
					headCommit: START_POINT,
					repoRoot: ROOT,
				}),
				herdr,
				sessionContinuation: continuation,
			},
			baseOptions(),
		);

		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain(
			"Resume it with: /sessions/recoverable.jsonl",
		);
		pi.assertDone();
	});

	test("derives omitted focus from active context before branch-basis interaction", async () => {
		const ctx = new FakeCommandContext({
			sessionFile: "/sessions/source.jsonl",
			leafId: "leaf",
			branchEntries: [{ type: "message", id: "leaf" }],
			shouldCancelSelect: true,
		});
		const events: string[] = [];
		await handleHerdrImplSession(
			{
				commands: createHerdrPiCommandApi(new FakePi()),
				pi: ctx,
				trunkBranch: "master",
				git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
				herdr: new FakeHerdrGateway(),
				sessionContinuation: new FakeSessionContinuation(),
			},
			{
				...baseOptions(),
				args: "   ",
				buildActiveContextText: () => {
					events.push("context");
					return { ok: true, text: "compacted active context" };
				},
				deriveFocus: async ({ activeContextText }) => {
					events.push(`derive:${activeContextText}`);
					return { ok: true, focus: FOCUS };
				},
			},
		);

		expect(events).toEqual(["context", "derive:compacted active context"]);
		expect(ctx.selections).toHaveLength(1);
		expect(ctx.notifications.at(-1)?.message).toBe("Herdr session implementation cancelled.");
	});

	test.each([
		["empty context", { context: { ok: true as const, text: "  " } }],
		["context failure", { context: { ok: false as const, message: "context unavailable" } }],
		[
			"model failure",
			{
				context: { ok: true as const, text: "active context" },
				derive: { ok: false as const, message: "model unavailable" },
			},
		],
		[
			"empty model output",
			{
				context: { ok: true as const, text: "active context" },
				derive: { ok: true as const, focus: "\n" },
			},
		],
	] as const)("stops before selection or mutation on %s", async (_case, fixture) => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const continuation = new FakeSessionContinuation();
		const ctx = new FakeCommandContext({
			sessionFile: "/sessions/source.jsonl",
			leafId: "leaf",
			branchEntries: [{ type: "message", id: "leaf" }],
		});

		await handleHerdrImplSession(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				trunkBranch: "master",
				git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
				herdr,
				sessionContinuation: continuation,
			},
			{
				...baseOptions(),
				args: "",
				buildActiveContextText: () => fixture.context,
				deriveFocus: async () =>
					"derive" in fixture ? fixture.derive : { ok: true as const, focus: "should not be used" },
			},
		);

		expect(ctx.selections).toEqual([]);
		expect(pi.execCalls).toEqual([]);
		expect(continuation.calls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
	});
});

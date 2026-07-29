import { describe, expect, test } from "vitest";

import {
	buildSessionContinuationPrompt,
	handleHerdrImplSession,
	type HerdrSessionContinuationGateway,
} from "../src/core/impl-session.ts";
import { FakeCommandContext } from "./herdr-test-harness.ts";

const FOCUS = "Finish the active-session implementation workflow";

class FakeSessionContinuation implements HerdrSessionContinuationGateway {
	readonly contextRequests: Array<{ sourceSessionFile: string; sourceLeafId: string }> = [];
	private readonly preflightResult: ReturnType<HerdrSessionContinuationGateway["preflightSource"]>;
	private readonly contextResult: ReturnType<HerdrSessionContinuationGateway["buildContextText"]>;

	constructor(
		options: {
			preflightResult?: ReturnType<HerdrSessionContinuationGateway["preflightSource"]>;
			contextResult?: ReturnType<HerdrSessionContinuationGateway["buildContextText"]>;
		} = {},
	) {
		this.preflightResult = options.preflightResult ?? { ok: true };
		this.contextResult = options.contextResult ?? { ok: true, text: "active context" };
	}

	preflightSource() {
		return this.preflightResult;
	}

	buildContextText(request: { sourceSessionFile: string; sourceLeafId: string }) {
		this.contextRequests.push({ ...request });
		return this.contextResult;
	}
}

function persistedSessionContext(options: { hasEditor?: boolean } = {}): FakeCommandContext {
	return new FakeCommandContext({
		sessionFile: "/sessions/source.jsonl",
		leafId: "leaf",
		branchEntries: [{ type: "message", id: "leaf" }],
		...(options.hasEditor === undefined ? {} : { hasEditor: options.hasEditor }),
	});
}

function composePromptRecorder(prompt = "Implement the composed continuation work") {
	const requests: Array<{ cwd: string; activeContextText: string; steeringFocus?: string }> = [];
	return {
		requests,
		composePrompt: async (request: {
			cwd: string;
			activeContextText: string;
			steeringFocus?: string;
		}) => {
			requests.push({ ...request });
			return { ok: true as const, prompt };
		},
	};
}

describe("Herdr active-session implementation", () => {
	test("fails an in-memory source before context extraction or prompt composition", async () => {
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = new FakeCommandContext({ branchEntries: [{ type: "message", id: "leaf" }] });
		const recorder = composePromptRecorder();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{ args: FOCUS, notifyProgress: () => {}, composePrompt: recorder.composePrompt },
		);

		expect(ctx.events[0]).toBe("wait-for-idle");
		expect(ctx.notifications[0]?.message).toContain("persisted caller Pi session");
		expect(ctx.notifications[0]?.message).toContain("No prompt was composed.");
		expect(sessionContinuation.contextRequests).toEqual([]);
		expect(recorder.requests).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
	});

	test("fails a missing authoritative leaf before context extraction", async () => {
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = new FakeCommandContext({
			sessionFile: "/sessions/source.jsonl",
			leafId: null,
			branchEntries: [{ type: "message", id: "leaf" }],
		});
		const recorder = composePromptRecorder();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{ args: FOCUS, notifyProgress: () => {}, composePrompt: recorder.composePrompt },
		);

		expect(ctx.notifications[0]?.message).toContain("authoritative leaf id");
		expect(sessionContinuation.contextRequests).toEqual([]);
		expect(recorder.requests).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
	});

	test.each([
		["malformed", "Failed to read active Pi session source: malformed JSONL"],
		["empty", "Source session branch is empty."],
		["leaf mismatch", "selected path does not end at authoritative leaf"],
	] as const)("fails a %s persisted source before composition", async (_case, message) => {
		const sessionContinuation = new FakeSessionContinuation({
			preflightResult: { ok: false, message },
		});
		const ctx = persistedSessionContext();
		const recorder = composePromptRecorder();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{ args: FOCUS, notifyProgress: () => {}, composePrompt: recorder.composePrompt },
		);

		expect(ctx.notifications.at(-1)?.message).toContain(message);
		expect(ctx.notifications.at(-1)?.message).toContain("No prompt was composed.");
		expect(sessionContinuation.contextRequests).toEqual([]);
		expect(recorder.requests).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
	});

	test.each([
		["empty context", { ok: true as const, text: "  " }],
		["context failure", { ok: false as const, message: "context unavailable" }],
	] as const)("stops before composition on %s", async (_case, contextResult) => {
		const sessionContinuation = new FakeSessionContinuation({ contextResult });
		const ctx = persistedSessionContext();
		const recorder = composePromptRecorder();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{ args: "", notifyProgress: () => {}, composePrompt: recorder.composePrompt },
		);

		expect(recorder.requests).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain(
			contextResult.ok ? "conversation context is empty" : "context unavailable",
		);
	});

	test("fills the input box with the composed prompt command without submitting", async () => {
		const sessionContinuation = new FakeSessionContinuation({
			contextResult: { ok: true, text: "compacted active context" },
		});
		const ctx = persistedSessionContext();
		const recorder = composePromptRecorder("Ship the composed follow-up work");
		const progress: string[] = [];

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{
				args: "   ",
				notifyProgress: (message) => progress.push(message),
				composePrompt: recorder.composePrompt,
			},
		);

		expect(sessionContinuation.contextRequests).toEqual([
			{ sourceSessionFile: "/sessions/source.jsonl", sourceLeafId: "leaf" },
		]);
		expect(recorder.requests).toEqual([
			{ cwd: ctx.cwd, activeContextText: "compacted active context" },
		]);
		expect(ctx.editorTexts).toEqual([
			"/ns:herdr:impl:prompt:space Ship the composed follow-up work",
		]);
		expect(progress.some((message) => message.includes("Summarizing the active session"))).toBe(
			true,
		);
		expect(ctx.notifications.at(-1)?.message).toContain("Review or edit it, then send it");
		expect(ctx.notifications.at(-1)?.level).toBe("info");
	});

	test("passes trimmed explicit focus as steering for the composed prompt", async () => {
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = persistedSessionContext();
		const recorder = composePromptRecorder();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{
				args: `  ${FOCUS}  `,
				notifyProgress: () => {},
				composePrompt: recorder.composePrompt,
			},
		);

		expect(recorder.requests).toEqual([
			{ cwd: ctx.cwd, activeContextText: "active context", steeringFocus: FOCUS },
		]);
		expect(ctx.editorTexts).toHaveLength(1);
	});

	test("normalizes a multiline composed prompt into one editor line", async () => {
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = persistedSessionContext();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{
				args: "",
				notifyProgress: () => {},
				composePrompt: async () => ({
					ok: true,
					prompt: "First step.\nSecond step.\n\n  Third   step.  ",
				}),
			},
		);

		expect(ctx.editorTexts).toEqual([
			"/ns:herdr:impl:prompt:space First step. Second step. Third step.",
		]);
	});

	test("reports model failure without filling the input box", async () => {
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = persistedSessionContext();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{
				args: "",
				notifyProgress: () => {},
				composePrompt: async () => ({ ok: false, message: "model unavailable" }),
			},
		);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("model unavailable");
	});

	test("reports empty model output without filling the input box", async () => {
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = persistedSessionContext();

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{
				args: "",
				notifyProgress: () => {},
				composePrompt: async () => ({ ok: true, prompt: " \n " }),
			},
		);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("returned empty output");
	});

	test("falls back to a copyable notification when no input box exists", async () => {
		const sessionContinuation = new FakeSessionContinuation();
		const ctx = persistedSessionContext({ hasEditor: false });
		const recorder = composePromptRecorder("Ship the composed follow-up work");

		await handleHerdrImplSession(
			{ pi: ctx, sessionContinuation },
			{ args: "", notifyProgress: () => {}, composePrompt: recorder.composePrompt },
		);

		expect(ctx.editorTexts).toEqual([]);
		const fallback = ctx.notifications.at(-1);
		expect(fallback?.level).toBe("info");
		expect(fallback?.message).toContain("no editable input box");
		expect(fallback?.message).toContain(
			"/ns:herdr:impl:prompt:space Ship the composed follow-up work",
		);
	});
});

describe("session continuation prompt composition", () => {
	test("embeds the full context without truncation and demands one self-contained paragraph", () => {
		const activeContextText = `long context ${"x".repeat(20_000)}`;
		const prompt = buildSessionContinuationPrompt({ activeContextText });

		expect(prompt).toContain(
			`<active-session-context>\n${activeContextText}\n</active-session-context>`,
		);
		expect(prompt).toContain("one single paragraph");
		expect(prompt).toContain("self-contained");
		expect(prompt).not.toContain("Steer the prompt toward");
	});

	test("includes explicit steering focus when supplied", () => {
		const prompt = buildSessionContinuationPrompt({
			activeContextText: "active context",
			steeringFocus: FOCUS,
		});

		expect(prompt).toContain("Steer the prompt toward this focus:");
		expect(prompt).toContain(FOCUS);
	});
});

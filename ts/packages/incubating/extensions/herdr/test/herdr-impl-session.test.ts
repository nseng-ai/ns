import { describe, expect, test } from "vitest";

import {
	callPiModelText,
	type CallPiModelTextOptions,
	type PiModelTextResult,
} from "@nseng-ai/pi-runtime/models/call";

import { registerHerdrSessionSpaceImplCommand } from "../src/pi/impl-session.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { FakeCommandContext, FakePi } from "./herdr-test-harness.ts";

const COMMAND_NAME = "ns:herdr:impl:session:space";
const SESSION_CONTEXT_HEADING = "## Current active Pi session context\n";

function fakeCallModelText(
	result: PiModelTextResult,
	calls: CallPiModelTextOptions[],
): typeof callPiModelText {
	return (options) => {
		calls.push(options);
		return Promise.resolve(result);
	};
}

describe(COMMAND_NAME, () => {
	test("summarizes the active session with optional focus and prefills an unsubmitted prompt command", async () => {
		const pi = new FakePi();
		const calls: CallPiModelTextOptions[] = [];
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{
				callModelText: fakeCallModelText(
					{
						ok: true,
						text: "Implement the cache invalidation fix with the existing gateway seam.",
					},
					calls,
				),
			},
		);
		const ctx = new FakeCommandContext({
			model: { provider: "openai", id: "gpt-test" },
			branchEntries: [
				{
					type: "message",
					message: { role: "user", content: "Fix cache invalidation" },
				},
			],
		});

		await pi.commands.get(COMMAND_NAME)?.handler("focus on regression coverage", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			modelSelection: {
				provider: "openai",
				modelId: "gpt-test",
				thinking: "medium",
			},
			maxTokens: 4_000,
		});
		expect(calls[0]?.systemPrompt).toMatch(
			/^Create a directed, self-contained implementation summary/,
		);
		expect(calls[0]?.userText).toContain("## Continuation focus\nfocus on regression coverage");
		expect(calls[0]?.userText).toContain(`${SESSION_CONTEXT_HEADING}[\n  {\n    "type": "message"`);
		expect(calls[0]?.userText).toContain("Fix cache invalidation");
		expect(ctx.editorTexts).toEqual([
			"/ns:herdr:impl:prompt:space Implement the cache invalidation fix with the existing gateway seam.",
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.execCalls).toEqual([]);
		expect(ctx.statuses).toEqual([
			{ key: COMMAND_NAME, value: "summarizing session…" },
			{ key: COMMAND_NAME, value: undefined },
		]);
		expect(ctx.notifications.at(-1)).toEqual({
			message:
				"Drafted the session implementation prompt in the editor. Review or edit it, then press Enter.",
			level: "info",
		});
	});

	test("accepts an omitted focus and upgrades off thinking to minimal", async () => {
		const pi = new FakePi();
		pi.setThinkingLevel("off");
		const calls: CallPiModelTextOptions[] = [];
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{
				callModelText: fakeCallModelText({ ok: true, text: "Continue the work." }, calls),
			},
		);
		const ctx = new FakeCommandContext({ model: { provider: "anthropic", id: "claude-test" } });

		await pi.commands.get(COMMAND_NAME)?.handler("   ", ctx);

		expect(calls[0]?.modelSelection.thinking).toBe("minimal");
		expect(calls[0]?.userText).toContain(
			"## Continuation focus\n(No additional focus was supplied.)",
		);
		expect(ctx.editorTexts).toEqual(["/ns:herdr:impl:prompt:space Continue the work."]);
	});

	test("bounds large session context with the shared truncation policy and retains the newest tail", async () => {
		const pi = new FakePi();
		const calls: CallPiModelTextOptions[] = [];
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{
				callModelText: fakeCallModelText({ ok: true, text: "Continue the work." }, calls),
			},
		);
		const newestContext = "newest-session-context";
		const ctx = new FakeCommandContext({
			model: { provider: "openai", id: "gpt-test" },
			branchEntries: [
				{ type: "message", message: { role: "user", content: "x".repeat(170_000) } },
				{ type: "message", message: { role: "assistant", content: newestContext } },
			],
		});

		await pi.commands.get(COMMAND_NAME)?.handler("", ctx);

		const sessionContext = calls[0]?.userText.split(SESSION_CONTEXT_HEADING)[1];
		expect(sessionContext).toBeDefined();
		expect(sessionContext?.length).toBeLessThanOrEqual(160_000);
		expect(
			sessionContext?.startsWith(
				"[Earlier active-session context truncated to fit the summary request.]\n",
			),
		).toBe(true);
		expect(sessionContext).toContain(newestContext);
	});

	test("maps model-call failures without mutating the editor", async () => {
		const pi = new FakePi();
		const calls: CallPiModelTextOptions[] = [];
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{
				callModelText: fakeCallModelText({ ok: false, reason: "empty-auth", message: null }, calls),
			},
		);
		const ctx = new FakeCommandContext({ model: { provider: "openai", id: "gpt-test" } });

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(calls).toHaveLength(1);
		expect(ctx.editorTexts).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.execCalls).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "No openai auth found for openai. Run /login or configure Pi auth.",
			level: "error",
		});
	});

	test("rejects an empty model summary without mutating the editor", async () => {
		const pi = new FakePi();
		const calls: CallPiModelTextOptions[] = [];
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{
				callModelText: fakeCallModelText({ ok: true, text: "   " }, calls),
			},
		);
		const ctx = new FakeCommandContext({ model: { provider: "openai", id: "gpt-test" } });

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "The model returned an empty implementation summary.",
			level: "error",
		});
	});
});

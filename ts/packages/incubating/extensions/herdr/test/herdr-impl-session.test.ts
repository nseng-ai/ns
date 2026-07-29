import { describe, expect, test } from "vitest";

import { registerHerdrSessionSpaceImplCommand } from "../src/pi/impl-session.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { FakeCommandContext, FakePi } from "./herdr-test-harness.ts";

const COMMAND_NAME = "ns:herdr:impl:session:space";

function assistantMessage(text: string) {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
	};
}

function userMessage(text: string) {
	return {
		role: "user",
		content: text,
	};
}

function summaryTurn(pi: FakePi, ...assistantTexts: string[]) {
	return {
		messages: [
			userMessage(pi.sentUserMessages.at(-1) ?? ""),
			...assistantTexts.map(assistantMessage),
		],
	};
}

describe(COMMAND_NAME, () => {
	test("asks the active session for a focused summary and prefills the resulting prompt", async () => {
		const pi = new FakePi();
		registerHerdrSessionSpaceImplCommand({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();

		await pi.commands.get(COMMAND_NAME)?.handler("focus on regression coverage", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(
			"Draft a directed, self-contained implementation prompt",
		);
		expect(pi.sentUserMessages[0]).toContain("## Continuation focus\nfocus on regression coverage");
		expect(pi.sentUserMessages[0]).toContain("Do not use tools or perform implementation work.");
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.statuses).toEqual([{ key: COMMAND_NAME, value: "summarizing session…" }]);

		await pi.emitAgentEnd(
			summaryTurn(pi, "Implement the cache invalidation fix with the existing gateway seam."),
			ctx,
		);

		expect(ctx.editorTexts).toEqual([
			"/ns:herdr:impl:prompt:space Implement the cache invalidation fix with the existing gateway seam.",
		]);
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

	test("supplies a useful default when focus is omitted", async () => {
		const pi = new FakePi();
		registerHerdrSessionSpaceImplCommand({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();

		await pi.commands.get(COMMAND_NAME)?.handler("   ", ctx);

		expect(pi.sentUserMessages[0]).toContain(
			"## Continuation focus\nChoose the most natural implementation continuation from the session.",
		);
	});

	test("ignores unrelated agent completions until a summary is requested", async () => {
		const pi = new FakePi();
		registerHerdrSessionSpaceImplCommand({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();

		await pi.emitAgentEnd({ messages: [assistantMessage("Unrelated response.")] }, ctx);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications).toEqual([]);
	});

	test("skips interleaved unrelated turns and captures the actual summary turn", async () => {
		const pi = new FakePi();
		registerHerdrSessionSpaceImplCommand({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);
		await pi.emitAgentEnd(
			{
				messages: [userMessage("unrelated question"), assistantMessage("Unrelated answer.")],
			},
			ctx,
		);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.statuses.at(-1)).toEqual({ key: COMMAND_NAME, value: "summarizing session…" });

		await pi.emitAgentEnd(summaryTurn(pi, "Implement the follow-up."), ctx);

		expect(ctx.editorTexts).toEqual(["/ns:herdr:impl:prompt:space Implement the follow-up."]);
		expect(ctx.statuses.at(-1)).toEqual({ key: COMMAND_NAME, value: undefined });
	});

	test("reports an empty summary and clears pending state", async () => {
		const pi = new FakePi();
		registerHerdrSessionSpaceImplCommand({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);
		await pi.emitAgentEnd(summaryTurn(pi, "   "), ctx);
		await pi.emitAgentEnd(
			{ messages: [userMessage("later"), assistantMessage("Later unrelated response.")] },
			ctx,
		);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.statuses.at(-1)).toEqual({ key: COMMAND_NAME, value: undefined });
		expect(ctx.notifications).toEqual([
			{
				message: "The session summary turn returned no implementation prompt.",
				level: "error",
			},
		]);
	});
});

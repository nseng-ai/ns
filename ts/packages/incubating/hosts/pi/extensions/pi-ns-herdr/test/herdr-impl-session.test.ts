import { describe, expect, test } from "vitest";

import { registerHerdrSessionImplCommands } from "../src/pi/impl-session.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { FakeCommandContext, FakePi } from "./herdr-test-harness.ts";

const SESSION_SCENARIOS = [
	{
		sessionCommandName: "ns:herdr:impl:session:space",
		promptCommandName: "ns:herdr:impl:prompt:space",
	},
	{
		sessionCommandName: "ns:herdr:impl:session:tab",
		promptCommandName: "ns:herdr:impl:prompt:tab",
	},
] as const;

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

describe("Herdr session implementation commands", () => {
	test.each(SESSION_SCENARIOS)(
		"$sessionCommandName asks for the same summary behavior and prefills $promptCommandName without submitting",
		async ({ sessionCommandName, promptCommandName }) => {
			const pi = new FakePi();
			registerHerdrSessionImplCommands({ commands: createHerdrPiCommandApi(pi) });
			const ctx = new FakeCommandContext();

			await pi.commands.get(sessionCommandName)?.handler("focus on regression coverage", ctx);

			expect(ctx.waitCount).toBe(1);
			expect(pi.sentUserMessages).toHaveLength(1);
			expect(pi.sentUserMessages[0]).toContain(
				"Draft a directed, self-contained implementation prompt",
			);
			expect(pi.sentUserMessages[0]).toContain(
				"## Continuation focus\nfocus on regression coverage",
			);
			expect(pi.sentUserMessages[0]).toContain("Do not use tools or perform implementation work.");
			expect(ctx.editorTexts).toEqual([]);
			expect(ctx.statuses).toEqual([{ key: sessionCommandName, value: "summarizing session…" }]);

			const summary = "Implement the cache invalidation fix with the existing gateway seam.";
			await pi.emitAgentEnd(summaryTurn(pi, summary), ctx);

			expect(ctx.editorTexts).toEqual([`/${promptCommandName} ${summary}`]);
			expect(pi.sentUserMessages).toHaveLength(1);
			expect(ctx.statuses).toEqual([
				{ key: sessionCommandName, value: "summarizing session…" },
				{ key: sessionCommandName, value: undefined },
			]);
			expect(ctx.notifications.at(-1)).toEqual({
				message:
					"Drafted the session implementation prompt in the editor. Review or edit it, then press Enter.",
				level: "info",
			});
		},
	);

	test.each([
		{
			firstCommand: "ns:herdr:impl:session:space",
			secondCommand: "ns:herdr:impl:session:tab",
			expectedPromptCommand: "ns:herdr:impl:prompt:space",
		},
		{
			firstCommand: "ns:herdr:impl:session:tab",
			secondCommand: "ns:herdr:impl:session:space",
			expectedPromptCommand: "ns:herdr:impl:prompt:tab",
		},
	])(
		"shares pending exclusion from $firstCommand to $secondCommand and completes the original destination",
		async ({ firstCommand, secondCommand, expectedPromptCommand }) => {
			const pi = new FakePi();
			registerHerdrSessionImplCommands({ commands: createHerdrPiCommandApi(pi) });
			const ctx = new FakeCommandContext();

			await pi.commands.get(firstCommand)?.handler("first focus", ctx);
			await pi.commands.get(secondCommand)?.handler("second focus", ctx);

			expect(ctx.waitCount).toBe(1);
			expect(pi.sentUserMessages).toHaveLength(1);
			expect(pi.sentUserMessages[0]).toContain("## Continuation focus\nfirst focus");
			expect(ctx.notifications.at(-1)).toEqual({
				message: "A session summary is already pending.",
				level: "warning",
			});

			await pi.emitAgentEnd(summaryTurn(pi, "Implement the original destination."), ctx);

			expect(ctx.editorTexts).toEqual([
				`/${expectedPromptCommand} Implement the original destination.`,
			]);
			expect(ctx.statuses.at(-1)).toEqual({ key: firstCommand, value: undefined });
		},
	);

	test.each(SESSION_SCENARIOS)(
		"$sessionCommandName supplies the same useful default when focus is omitted",
		async ({ sessionCommandName }) => {
			const pi = new FakePi();
			registerHerdrSessionImplCommands({ commands: createHerdrPiCommandApi(pi) });
			const ctx = new FakeCommandContext();

			await pi.commands.get(sessionCommandName)?.handler("   ", ctx);

			expect(pi.sentUserMessages[0]).toContain(
				"## Continuation focus\nChoose the most natural implementation continuation from the session.",
			);
		},
	);

	test("ignores unrelated agent completions until a summary is requested", async () => {
		const pi = new FakePi();
		registerHerdrSessionImplCommands({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();

		await pi.emitAgentEnd({ messages: [assistantMessage("Unrelated response.")] }, ctx);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications).toEqual([]);
	});

	test("skips interleaved unrelated turns and captures the exact summary turn", async () => {
		const pi = new FakePi();
		registerHerdrSessionImplCommands({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();
		const commandName = "ns:herdr:impl:session:space";

		await pi.commands.get(commandName)?.handler("focus", ctx);
		await pi.emitAgentEnd(
			{
				messages: [userMessage("unrelated question"), assistantMessage("Unrelated answer.")],
			},
			ctx,
		);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.statuses.at(-1)).toEqual({ key: commandName, value: "summarizing session…" });

		await pi.emitAgentEnd(summaryTurn(pi, "Implement the follow-up."), ctx);

		expect(ctx.editorTexts).toEqual(["/ns:herdr:impl:prompt:space Implement the follow-up."]);
		expect(ctx.statuses.at(-1)).toEqual({ key: commandName, value: undefined });
	});

	test("reports unavailable editor prefill without sending a summary request", async () => {
		const pi = new FakePi();
		registerHerdrSessionImplCommands({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext({ shouldHaveEditor: false });

		await pi.commands.get("ns:herdr:impl:session:tab")?.handler("focus", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.statuses).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "This Pi runtime cannot prefill editor text.", level: "error" },
		]);
	});

	test("reports an empty summary and clears pending state", async () => {
		const pi = new FakePi();
		registerHerdrSessionImplCommands({ commands: createHerdrPiCommandApi(pi) });
		const ctx = new FakeCommandContext();
		const commandName = "ns:herdr:impl:session:space";

		await pi.commands.get(commandName)?.handler("focus", ctx);
		await pi.emitAgentEnd(summaryTurn(pi, "   "), ctx);
		await pi.emitAgentEnd(
			{ messages: [userMessage("later"), assistantMessage("Later unrelated response.")] },
			ctx,
		);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.statuses.at(-1)).toEqual({ key: commandName, value: undefined });
		expect(ctx.notifications).toEqual([
			{
				message: "The session summary turn returned no implementation prompt.",
				level: "error",
			},
		]);
	});
});

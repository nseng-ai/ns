import { describe, expect, test } from "vitest";

import type { HandleHerdrSlotImplPromptOptions } from "../src/core/impl-prompt.ts";
import type { HerdrImplPromptContext } from "../src/core/impl-prompt.ts";
import {
	buildSummaryRequest,
	generateSessionImplementationPrompt,
	registerHerdrSessionImplCommands,
	renderSessionImplPromptEntry,
	SESSION_IMPL_PROMPT_ENTRY_TYPE,
	SESSION_PROMPT_ACTIONS,
} from "../src/pi/impl-session.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { FakeCommandContext, FakeHerdrGateway, FakePi, ROOT, step } from "./herdr-test-harness.ts";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

const COMMAND_NAME = "ns:herdr:impl:session:space";
const PRIVATE_PROMPT =
	'Implement `cache` with Unicode λ, quotes "\'", $shell, and\nmultiple lines.';

function registrationContext(pi: FakePi) {
	return {
		commands: createHerdrPiCommandApi(pi),
		git: new InMemoryGitGateway(),
		trunkBranch: "master",
		herdr: new FakeHerdrGateway(),
	};
}

describe(COMMAND_NAME, () => {
	test("generates the prompt and implements only after explicit approval", async () => {
		const pi = new FakePi();
		const calls: Array<{
			context: HerdrImplPromptContext;
			options: HandleHerdrSlotImplPromptOptions;
		}> = [];
		registerHerdrSessionImplCommands(registrationContext(pi), {
			generatePrompt: async () => ({ ok: true, prompt: PRIVATE_PROMPT }),
			implementPrompt: async (context, options) => {
				calls.push({ context, options });
			},
		});
		const ctx = new FakeCommandContext();

		await pi.commands.get(COMMAND_NAME)?.handler("focus on regression coverage", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.selections).toEqual([
			{
				title: "Session implementation prompt ready",
				items: [
					SESSION_PROMPT_ACTIONS.implement,
					SESSION_PROMPT_ACTIONS.loadEditor,
					SESSION_PROMPT_ACTIONS.cancel,
				],
			},
		]);
		expect(ctx.editorTexts).toEqual([]);
		expect(SESSION_PROMPT_ACTIONS.implement).toBe("Implement on a new branch in an isolated Slot");
		expect(ctx.notifications).toEqual([
			{
				message: [
					`Source checkout: ${ROOT}`,
					"Execution checkout: new branch in an isolated Slot",
					"Branch basis: selected after approval",
				].join("\n"),
				level: "info",
			},
		]);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.options).toMatchObject({
			args: PRIVATE_PROMPT,
			commandName: COMMAND_NAME,
			destination: { type: "workspace" },
		});
		expect(ctx.notifications.join("\n")).not.toContain(PRIVATE_PROMPT);
		expect(ctx.statuses).toEqual([]);
		expect(ctx.widgets).toEqual([
			{ key: COMMAND_NAME, lines: ["preparing prompt…"] },
			{ key: COMMAND_NAME, lines: undefined },
		]);
		expect(pi.appendedEntries).toEqual([
			{ customType: SESSION_IMPL_PROMPT_ENTRY_TYPE, data: { prompt: PRIVATE_PROMPT } },
		]);
		expect(pi.entryRenderers.has(SESSION_IMPL_PROMPT_ENTRY_TYPE)).toBe(true);
	});

	test("registers authoritative approval flows for both space and tab destinations", () => {
		const pi = new FakePi();
		registerHerdrSessionImplCommands(registrationContext(pi));

		expect(pi.commands.has("ns:herdr:impl:session:space")).toBe(true);
		expect(pi.commands.has("ns:herdr:impl:session:tab")).toBe(true);
	});

	test.each([
		{
			firstCommand: "ns:herdr:impl:session:space",
			secondCommand: "ns:herdr:impl:session:tab",
		},
		{
			firstCommand: "ns:herdr:impl:session:tab",
			secondCommand: "ns:herdr:impl:session:space",
		},
	])(
		"shares pending exclusion from $firstCommand to $secondCommand",
		async ({ firstCommand, secondCommand }) => {
			const pi = new FakePi();
			let generationCalls = 0;
			registerHerdrSessionImplCommands(registrationContext(pi), {
				generatePrompt: async () => {
					generationCalls += 1;
					return { ok: true, prompt: PRIVATE_PROMPT };
				},
			});
			const waitEntered = Promise.withResolvers<void>();
			const releaseWait = Promise.withResolvers<void>();
			const firstContext = new FakeCommandContext({
				onWaitForIdle: async () => {
					waitEntered.resolve();
					await releaseWait.promise;
				},
				selectIndices: [2],
			});
			const secondContext = new FakeCommandContext();

			const firstRun = pi.commands.get(firstCommand)?.handler("focus", firstContext);
			await waitEntered.promise;
			await pi.commands.get(secondCommand)?.handler("focus", secondContext);

			expect(secondContext.notifications).toEqual([
				{
					message: "A session implementation prompt is already being prepared.",
					level: "warning",
				},
			]);
			expect(secondContext.waitCount).toBe(0);
			expect(secondContext.selections).toEqual([]);
			expect(generationCalls).toBe(0);
			expect(pi.appendedEntries).toEqual([]);

			releaseWait.resolve();
			await firstRun;

			expect(firstContext.waitCount).toBe(1);
			expect(firstContext.selections).toHaveLength(1);
			expect(generationCalls).toBe(1);
			expect(pi.appendedEntries).toEqual([
				{ customType: SESSION_IMPL_PROMPT_ENTRY_TYPE, data: { prompt: PRIVATE_PROMPT } },
			]);
		},
	);

	test("clears shared pending state when idle waiting fails so the other destination can retry", async () => {
		const pi = new FakePi();
		let generationCalls = 0;
		registerHerdrSessionImplCommands(registrationContext(pi), {
			generatePrompt: async () => {
				generationCalls += 1;
				return { ok: true, prompt: PRIVATE_PROMPT };
			},
		});
		const idleError = new Error("idle wait failed");
		const failedContext = new FakeCommandContext({
			onWaitForIdle: () => {
				throw idleError;
			},
		});

		await expect(
			pi.commands.get("ns:herdr:impl:session:space")?.handler("focus", failedContext),
		).rejects.toBe(idleError);

		const retryContext = new FakeCommandContext({ selectIndices: [2] });
		await pi.commands.get("ns:herdr:impl:session:tab")?.handler("focus", retryContext);

		expect(retryContext.notifications).not.toContainEqual({
			message: "A session implementation prompt is already being prepared.",
			level: "warning",
		});
		expect(retryContext.waitCount).toBe(1);
		expect(retryContext.selections).toHaveLength(1);
		expect(retryContext.notifications.at(-1)).toEqual({
			message: "Session implementation cancelled.",
			level: "info",
		});
		expect(generationCalls).toBe(1);
	});

	test("renders the complete printed prompt regardless of the entry expansion state", () => {
		const prompt = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`).join("\n");
		const theme = { fg: (_color: string, text: string) => text };
		const entry = { customType: SESSION_IMPL_PROMPT_ENTRY_TYPE, data: { prompt } };

		const collapsed = renderSessionImplPromptEntry(entry, { expanded: false }, theme).render(80);
		expect(collapsed[0]).toContain("session implementation prompt (9 lines)");
		expect(collapsed[1]).toBe("");
		expect(collapsed).toContain("▌ line 9");
		expect(collapsed.join("\n")).not.toContain("more lines");
		expect(collapsed.join("\n")).not.toContain("expand to view");

		const expanded = renderSessionImplPromptEntry(entry, { expanded: true }, theme).render(80);
		expect(expanded).toContain("▌ line 9");
		expect(expanded.join("\n")).not.toContain("more lines");
		expect(expanded.join("\n")).not.toContain("expand to view");
	});

	test("prefixes every prompt line with an accent gutter bar and renders the body as text", () => {
		const theme = { fg: (color: string, text: string) => `[${color}]${text}` };
		const entry = {
			customType: SESSION_IMPL_PROMPT_ENTRY_TYPE,
			data: { prompt: "only line" },
		};

		const rendered = renderSessionImplPromptEntry(entry, { expanded: true }, theme).render(80);
		expect(rendered[1]).toBe("");
		expect(rendered[2]).toBe("[accent]▌ [text]only line");
	});

	test("loads the prompt into the editor for review without implementing", async () => {
		const pi = new FakePi();
		let implementationCalls = 0;
		registerHerdrSessionImplCommands(registrationContext(pi), {
			generatePrompt: async () => ({ ok: true, prompt: PRIVATE_PROMPT }),
			implementPrompt: async () => {
				implementationCalls += 1;
			},
		});
		const ctx = new FakeCommandContext({ selectIndices: [1] });

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(implementationCalls).toBe(0);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.editorTexts).toEqual([`/ns:herdr:impl:prompt:space ${PRIVATE_PROMPT}`]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Loaded the implementation prompt into the editor for review.",
			level: "info",
		});
	});

	test("cancels without implementing the prompt", async () => {
		const pi = new FakePi();
		let implementationCalls = 0;
		registerHerdrSessionImplCommands(registrationContext(pi), {
			generatePrompt: async () => ({ ok: true, prompt: PRIVATE_PROMPT }),
			implementPrompt: async () => {
				implementationCalls += 1;
			},
		});
		const ctx = new FakeCommandContext({ selectIndices: [2] });

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(implementationCalls).toBe(0);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Session implementation cancelled.",
			level: "info",
		});
		expect(ctx.notifications.join("\n")).not.toContain(PRIVATE_PROMPT);
	});

	test("treats menu dismissal as opt-out", async () => {
		const pi = new FakePi();
		let implementationCalls = 0;
		registerHerdrSessionImplCommands(registrationContext(pi), {
			generatePrompt: async () => ({ ok: true, prompt: PRIVATE_PROMPT }),
			implementPrompt: async () => {
				implementationCalls += 1;
			},
		});
		const ctx = new FakeCommandContext({ shouldCancelSelect: true });

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(implementationCalls).toBe(0);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Session implementation cancelled.",
			level: "info",
		});
		expect(ctx.notifications.join("\n")).not.toContain(PRIVATE_PROMPT);
		expect(pi.appendedEntries).toEqual([
			{ customType: SESSION_IMPL_PROMPT_ENTRY_TYPE, data: { prompt: PRIVATE_PROMPT } },
		]);
	});

	test("reports unavailable menu UI without a cancellation notification", async () => {
		const pi = new FakePi();
		let implementationCalls = 0;
		registerHerdrSessionImplCommands(registrationContext(pi), {
			generatePrompt: async () => ({ ok: true, prompt: PRIVATE_PROMPT }),
			implementPrompt: async () => {
				implementationCalls += 1;
			},
		});
		const ctx = new FakeCommandContext({ hasSelect: false });

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(implementationCalls).toBe(0);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications).toEqual([
			{
				message: "This Pi runtime cannot present the session implementation menu.",
				level: "error",
			},
		]);
		expect(ctx.notifications.join("\n")).not.toContain(PRIVATE_PROMPT);
		expect(pi.appendedEntries).toEqual([
			{ customType: SESSION_IMPL_PROMPT_ENTRY_TYPE, data: { prompt: PRIVATE_PROMPT } },
		]);
	});

	test("reports generation failure without invoking implementation or leaking content", async () => {
		const pi = new FakePi();
		let implementationCalls = 0;
		registerHerdrSessionImplCommands(registrationContext(pi), {
			generatePrompt: async () => ({ ok: false, message: "private generator failed" }),
			implementPrompt: async () => {
				implementationCalls += 1;
			},
		});
		const ctx = new FakeCommandContext();

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(implementationCalls).toBe(0);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "private generator failed",
			level: "error",
		});
	});

	test("runs a non-visible forked Pi process against the persisted source session", async () => {
		const sessionFile = "/sessions/source.jsonl";
		const request = buildSummaryRequest("focus");
		const pi = new FakePi({
			script: [
				step(
					"pi",
					["--fork", sessionFile, "--thinking", "medium", "--no-tools", "--print", request],
					{ stdout: `${PRIVATE_PROMPT}\n` },
				),
			],
		});
		const ctx = new FakeCommandContext({ sessionFile });

		const result = await generateSessionImplementationPrompt(
			createHerdrPiCommandApi(pi),
			ctx,
			"focus",
		);

		pi.assertDone();
		expect(result).toEqual({ ok: true, prompt: PRIVATE_PROMPT });
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.execCalls[0]?.options?.cwd).toBe(ROOT);
	});

	test("fails before generation when the source session is not persisted", async () => {
		const pi = new FakePi();
		const result = await generateSessionImplementationPrompt(
			createHerdrPiCommandApi(pi),
			new FakeCommandContext({ sessionFile: null }),
			"focus",
		);

		expect(result).toEqual({
			ok: false,
			message:
				"The current Pi session is not persisted, so an implementation prompt cannot be generated from it.",
		});
		expect(pi.execCalls).toEqual([]);
	});

	test("requires checkout-portable anchors while preserving supplied continuation focus", () => {
		const request = buildSummaryRequest("focus on the cache boundary");

		expect(request).toContain(
			"Treat the source checkout and its absolute filesystem paths as context only",
		);
		expect(request).toContain("paths relative to the repository root");
		expect(request).toContain(
			"do not direct the destination agent to edit an absolute source-worktree path",
		);
		expect(request).toContain("another Slot worktree");
		expect(request).toContain("destination cwd as authoritative");
		expect(request).toContain("## Continuation focus\nfocus on the cache boundary");
	});

	test("supplies a useful default continuation focus", () => {
		expect(buildSummaryRequest("   ").trim()).toContain(
			"## Continuation focus\nChoose the most natural implementation continuation from the session.",
		);
	});
});

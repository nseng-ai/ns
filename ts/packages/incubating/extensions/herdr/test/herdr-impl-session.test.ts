import { describe, expect, test, vi } from "vitest";

import { registerHerdrSessionSpaceImplCommand } from "../src/pi/impl-session.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { FakeCommandContext, FakePi } from "./herdr-test-harness.ts";

const COMMAND_NAME = "ns:herdr:impl:session:space";

describe(COMMAND_NAME, () => {
	test("summarizes the active session with optional focus and prefills an unsubmitted prompt command", async () => {
		const pi = new FakePi();
		const generateSummary = vi.fn(async () => ({
			ok: true as const,
			text: "Implement the cache invalidation fix with the existing gateway seam.",
		}));
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{ generateSummary },
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
		expect(generateSummary).toHaveBeenCalledOnce();
		expect(generateSummary).toHaveBeenCalledWith(
			expect.objectContaining({
				focus: "focus on regression coverage",
				modelSelection: {
					provider: "openai",
					modelId: "gpt-test",
					thinking: "medium",
				},
				sessionContext: expect.stringContaining("Fix cache invalidation"),
			}),
		);
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

	test("accepts an omitted focus", async () => {
		const pi = new FakePi();
		const generateSummary = vi.fn(async () => ({ ok: true as const, text: "Continue the work." }));
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{ generateSummary },
		);
		const ctx = new FakeCommandContext({ model: { provider: "anthropic", id: "claude-test" } });

		await pi.commands.get(COMMAND_NAME)?.handler("   ", ctx);

		expect(generateSummary).toHaveBeenCalledWith(expect.objectContaining({ focus: "" }));
		expect(ctx.editorTexts).toEqual(["/ns:herdr:impl:prompt:space Continue the work."]);
	});

	test("bounds large session context with the shared truncation policy and retains the newest tail", async () => {
		const pi = new FakePi();
		let sessionContext = "";
		const generateSummary = vi.fn(async (request: { readonly sessionContext: string }) => {
			sessionContext = request.sessionContext;
			return { ok: true as const, text: "Continue the work." };
		});
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{ generateSummary },
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

		expect(sessionContext.length).toBeLessThanOrEqual(160_000);
		expect(
			sessionContext.startsWith(
				"[Earlier active-session context truncated to fit the summary request.]\n",
			),
		).toBe(true);
		expect(sessionContext).toContain(newestContext);
	});

	test("stops without mutations when summary generation fails", async () => {
		const pi = new FakePi();
		registerHerdrSessionSpaceImplCommand(
			{ commands: createHerdrPiCommandApi(pi) },
			{
				generateSummary: async () => ({ ok: false, message: "model unavailable" }),
			},
		);
		const ctx = new FakeCommandContext({ model: { provider: "openai", id: "gpt-test" } });

		await pi.commands.get(COMMAND_NAME)?.handler("focus", ctx);

		expect(ctx.editorTexts).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.execCalls).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({ message: "model unavailable", level: "error" });
	});
});

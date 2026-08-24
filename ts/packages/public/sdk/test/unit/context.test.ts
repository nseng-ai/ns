import process from "node:process";

import { describe, expect, test } from "vitest";

import { createRealNsCommandContext, createTerminalSelectPrompt } from "@nseng-ai/sdk/context";

describe("real ns command context", () => {
	test("keeps context-only environment settings out of child processes", async () => {
		const ctx = createRealNsCommandContext({
			cwd: process.cwd(),
			env: { NS_FAST_MODEL: "vercel-ai-gateway/openai/gpt-5.6-luna" },
			execEnv: {},
			textGenerator: {
				generateText: async () => ({ ok: false, error: "not used" }),
			},
		});

		expect(ctx.env.NS_FAST_MODEL).toBe("vercel-ai-gateway/openai/gpt-5.6-luna");
		const result = await ctx.exec(process.execPath, [
			"-e",
			"process.stdout.write(process.env.NS_FAST_MODEL ?? 'unset')",
		]);
		expect(result).toMatchObject({ code: 0, stdout: "unset", stderr: "" });
	});

	test("selects a numbered terminal option", async () => {
		const stderr: string[] = [];
		const select = createTerminalSelectPrompt({
			stdin: async () => "2",
			stderr: (text) => stderr.push(text),
			isInteractive: () => true,
		});

		await expect(select("Choose", ["one", "two"])).resolves.toEqual({
			type: "selected",
			value: "two",
		});
		expect(stderr).toEqual([
			"Choose\n\n1. one\n2. two\n\nSelect an option [1-2] (blank to cancel): ",
		]);
	});

	test("reprompts after an invalid terminal selection", async () => {
		const stderr: string[] = [];
		const lines = ["3", "1"];
		const select = createTerminalSelectPrompt({
			stdin: async () => lines.shift() ?? null,
			stderr: (text) => stderr.push(text),
			isInteractive: () => true,
		});

		await expect(select("Choose", ["one", "two"])).resolves.toEqual({
			type: "selected",
			value: "one",
		});
		expect(stderr).toEqual([
			"Choose\n\n1. one\n2. two\n\nSelect an option [1-2] (blank to cancel): ",
			"Error: enter a number from 1 to 2, or press Enter to cancel.\n",
			"Choose\n\n1. one\n2. two\n\nSelect an option [1-2] (blank to cancel): ",
		]);
	});

	test.each([null, "", "   "])("cancels terminal selection for %j", async (input) => {
		const select = createTerminalSelectPrompt({
			stdin: async () => input,
			stderr: () => {},
			isInteractive: () => true,
		});

		await expect(select("Choose", ["one"])).resolves.toEqual({ type: "cancelled" });
	});

	test("rejects terminal selection when interaction is unavailable", async () => {
		const select = createTerminalSelectPrompt({
			stdin: async () => "1",
			stderr: () => {},
			isInteractive: () => false,
		});

		await expect(select("Choose", ["one"])).rejects.toThrow(
			"Standalone selection UI is unavailable.",
		);
	});

	test("cancels terminal selection when no options are available", async () => {
		let stdinCalls = 0;
		const select = createTerminalSelectPrompt({
			stdin: async () => {
				stdinCalls += 1;
				return "1";
			},
			stderr: () => {},
			isInteractive: () => true,
		});

		await expect(select("Choose", [])).resolves.toEqual({ type: "cancelled" });
		expect(stdinCalls).toBe(0);
	});

	test("forwards stdin to executed commands", async () => {
		const ctx = createRealNsCommandContext({
			cwd: process.cwd(),
			env: process.env,
			textGenerator: {
				generateText: async () => ({ ok: false, error: "not used" }),
			},
		});

		expect("hasExtension" in ctx).toBe(false);
		expect("projectConfig" in ctx).toBe(false);

		const result = await ctx.exec(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], {
			stdin: "hello from stdin",
		});

		expect(result).toMatchObject({ code: 0, stdout: "hello from stdin", stderr: "" });
	});
});

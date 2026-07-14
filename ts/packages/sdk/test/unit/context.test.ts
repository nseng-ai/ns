import process from "node:process";

import { describe, expect, test } from "vitest";

import { createRealNsCommandContext } from "@nseng-ai/sdk/context";

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

	test("forwards stdin to executed commands", async () => {
		const ctx = createRealNsCommandContext({
			cwd: process.cwd(),
			env: process.env,
			textGenerator: {
				generateText: async () => ({ ok: false, error: "not used" }),
			},
		});

		expect("hasExtension" in ctx).toBe(false);

		const result = await ctx.exec(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], {
			stdin: "hello from stdin",
		});

		expect(result).toMatchObject({ code: 0, stdout: "hello from stdin", stderr: "" });
	});
});

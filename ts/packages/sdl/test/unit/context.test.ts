import process from "node:process";

import { describe, expect, test } from "vitest";

import { createRealSdlCommandContext } from "@asdl/sdl/context";

describe("real SDL command context", () => {
	test("forwards stdin to executed commands", async () => {
		const ctx = createRealSdlCommandContext({ cwd: process.cwd(), env: process.env });

		const result = await ctx.exec(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], {
			stdin: "hello from stdin",
		});

		expect(result).toMatchObject({ code: 0, stdout: "hello from stdin", stderr: "" });
	});
});

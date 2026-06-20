import { ScriptedCommandExecApi } from "@asdl/core/testing";
import { describe, expect, it } from "vitest";

import { RealVibechkGitGateway } from "../../src/git.ts";

describe("RealVibechkGitGateway", () => {
	it("runs git commands through injected CommandExecApi", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: "abc123\n" }]);
		const gateway = new RealVibechkGitGateway("/repo", execApi);

		await expect(gateway.currentCommit()).resolves.toBe("abc123");

		const call = execApi.calls()[0];
		expect(call).toMatchObject({
			command: "git",
			args: ["rev-parse", "HEAD"],
		});
		expect(call?.options?.cwd).toBe("/repo");
		expect(call?.options?.timeout).toBe(10_000);
	});

	it("maps missing git startup failures to VibechkError", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				code: 127,
				stderr: "spawn git ENOENT",
				startupError: "spawn git ENOENT",
			},
		]);
		const gateway = new RealVibechkGitGateway("/repo", execApi);

		await expect(gateway.currentCommit()).rejects.toThrow("git is not installed or not on PATH.");
	});
});

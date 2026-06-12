import { describe, expect, test } from "vitest";

import { registerAutobranchCommand, type AutobranchCommandContext } from "../src/autobranch.ts";

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: AutobranchCommandContext): Promise<void> | void;
}

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: string[] = [];
	result = { stdout: "New branch: example\n", stderr: "", code: 0, killed: false };

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		this.execCalls.push(`${command} ${args.join(" ")} cwd=${options?.cwd ?? ""} timeout=${options?.timeout ?? 0}`);
		return this.result;
	}
}

class FakeContext implements AutobranchCommandContext {
	readonly cwd = "/repo";
	readonly notifications: Array<{ message: string; level: "info" | "warning" | "error" | undefined }> = [];
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	hasWaited = false;
	readonly ui = {
		notify: (message: string, level?: "info" | "warning" | "error") => {
			this.notifications.push({ message, level });
		},
		setStatus: (key: string, value: string | undefined) => {
			this.statuses.push({ key, value });
		},
	};

	async waitForIdle(): Promise<void> {
		this.hasWaited = true;
	}
}

describe("autobranch command registration", () => {
	test("registers code:autobranch and delegates to the ccc exec CLI", async () => {
		const pi = new FakePi();
		registerAutobranchCommand(pi);

		const command = pi.commands.get("code:autobranch");
		expect(command?.description).toBe("Create a Graphite branch from current uncommitted changes, or from the latest commit when the worktree is clean");

		const ctx = new FakeContext();
		await command?.handler("--slug example", ctx);

		expect(ctx.hasWaited).toBe(true);
		expect(pi.execCalls).toEqual(["ccc exec autobranch --slug example cwd=/repo timeout=600000"]);
		expect(ctx.statuses).toEqual([
			{ key: "autobranch", value: "running ccc exec autobranch…" },
			{ key: "autobranch", value: undefined },
		]);
		expect(ctx.notifications).toEqual([{ message: "New branch: example", level: "info" }]);
	});

	test("surfaces CLI stderr as an error when ccc exec autobranch fails", async () => {
		const pi = new FakePi();
		pi.result = { stdout: "", stderr: "Detached HEAD\n", code: 1, killed: false };
		registerAutobranchCommand(pi);

		const ctx = new FakeContext();
		await pi.commands.get("code:autobranch")?.handler("", ctx);

		expect(pi.execCalls).toEqual(["ccc exec autobranch cwd=/repo timeout=600000"]);
		expect(ctx.notifications).toEqual([{ message: "Detached HEAD", level: "error" }]);
	});
});

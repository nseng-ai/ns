import { describe, expect, test } from "vitest";

import { registerAutobranchCommand, type AutobranchCommandContext } from "../src/autobranch.ts";

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: AutobranchCommandContext): Promise<void> | void;
}

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		this.execCalls.push(`${command} ${args.join(" ")} cwd=${options?.cwd ?? ""} timeout=${options?.timeout ?? 0}`);
		if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
			return { stdout: "/repo\n", stderr: "", code: 0, killed: false };
		}
		if (command === "git" && args.join(" ") === "symbolic-ref --short HEAD") {
			return { stdout: "", stderr: "fatal: ref HEAD is not a symbolic ref", code: 1, killed: false };
		}
		throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
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
	test("registers code:autobranch and waits for idle before running the flow", async () => {
		const pi = new FakePi();
		registerAutobranchCommand(pi);

		const command = pi.commands.get("code:autobranch");
		expect(command?.description).toBe("Create a Graphite branch from current uncommitted changes, or from the latest commit when the worktree is clean");

		const ctx = new FakeContext();
		await command?.handler("--slug example", ctx);

		expect(ctx.hasWaited).toBe(true);
		expect(pi.execCalls).toEqual([
			"git rev-parse --show-toplevel cwd=/repo timeout=30000",
			"git symbolic-ref --short HEAD cwd=/repo timeout=30000",
		]);
		expect(ctx.notifications).toEqual([
			{
				message: "Detached HEAD; check out a branch before running /code:autobranch.\nexit 1: fatal: ref HEAD is not a symbolic ref",
				level: "error",
			},
		]);
	});
});

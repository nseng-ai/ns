import { describe, expect, test } from "vitest";

import { registerAutobranchCommand, type AutobranchCommandContext } from "../src/autobranch.ts";

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: AutobranchCommandContext): Promise<void> | void;
}

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: string[] = [];
	isDetachedHead = false;
	private statusCalls = 0;
	private stashMessage = "";

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		this.execCalls.push(`${command} ${args.join(" ")} cwd=${options?.cwd ?? ""} timeout=${options?.timeout ?? 0}`);
		if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
			return ok("/repo\n");
		}
		if (command === "git" && args[0] === "symbolic-ref") {
			return this.isDetachedHead ? fail("not a symbolic ref") : ok("base-branch\n");
		}
		if (command === "git" && args[0] === "status") {
			this.statusCalls += 1;
			return ok(this.statusCalls === 1 ? " M file.ts\n" : "");
		}
		if (command === "git" && args[0] === "diff") {
			return ok("diff --git a/file.ts b/file.ts\n+pending\n");
		}
		if (command === "git" && args[0] === "check-ref-format") {
			return ok();
		}
		if (command === "git" && args[0] === "show-ref") {
			return { code: 1, stdout: "", stderr: "", killed: false };
		}
		if (command === "git" && args[0] === "stash" && args[1] === "push") {
			this.stashMessage = args.at(-1) ?? "";
			return ok("Saved working directory\n");
		}
		if (command === "git" && args[0] === "stash" && args[1] === "list") {
			return ok(`stash@{0}\0On base-branch: ${this.stashMessage}\n`);
		}
		if (command === "git" && args[0] === "stash" && args[1] === "pop") {
			return ok("restored\n");
		}
		if (command === "gt" && args[0] === "create") {
			return ok("created\n");
		}
		return ok();
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

function ok(stdout = "", stderr = ""): { stdout: string; stderr: string; code: number; killed: boolean } {
	return { code: 0, stdout, stderr, killed: false };
}

function fail(stderr: string, code = 1): { stdout: string; stderr: string; code: number; killed: boolean } {
	return { code, stdout: "", stderr, killed: false };
}

describe("autobranch command registration", () => {
	test("registers code:autobranch and delegates to the shared autobranch core", async () => {
		const pi = new FakePi();
		registerAutobranchCommand(pi, {
			now: () => 123,
			prepareCheckpointMessage: async () => ({ ok: true, message: "[cp] Add pending work\n\n- Checkpoint current changes", source: "model" }),
			commitPreparedCheckpointMessage: async () => ({ summary: "abc123 [cp] Add pending work" }),
		});

		const command = pi.commands.get("code:autobranch");
		expect(command?.description).toBe("Create a Graphite branch from current uncommitted changes, or from the latest commit when the worktree is clean");

		const ctx = new FakeContext();
		await command?.handler("--slug example", ctx);

		expect(ctx.hasWaited).toBe(true);
		expect(pi.execCalls.some((call) => call.startsWith("ccc "))).toBe(false);
		expect(pi.execCalls.some((call) => call.startsWith("git stash push --include-untracked"))).toBe(true);
		expect(pi.execCalls.some((call) => call.startsWith("gt create example --no-interactive --no-ai"))).toBe(true);
		expect(pi.execCalls.some((call) => call.startsWith("git stash pop stash@{0}"))).toBe(true);
		expect(ctx.notifications).toEqual([
			{
				message: "New branch: example\nStacked on: base-branch\nCommit: abc123 [cp] Add pending work\nWorking directory is clean.",
				level: "info",
			},
		]);
		expect(ctx.statuses.at(-1)).toEqual({ key: "autobranch", value: undefined });
	});

	test("surfaces shared flow errors through Pi notifications", async () => {
		const pi = new FakePi();
		pi.isDetachedHead = true;
		registerAutobranchCommand(pi, {
			prepareCheckpointMessage: async () => ({ ok: true, message: "[cp] Unused\n\n- Unused", source: "model" }),
			commitPreparedCheckpointMessage: async () => ({ summary: "unused" }),
		});

		const ctx = new FakeContext();
		await pi.commands.get("code:autobranch")?.handler("", ctx);

		expect(pi.execCalls.some((call) => call.startsWith("ccc "))).toBe(false);
		expect(ctx.notifications).toEqual([
			{
				message: expect.stringContaining("Detached HEAD; check out a branch before running /code:autobranch."),
				level: "error",
			},
		]);
	});
});

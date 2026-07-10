import { describe, expect, test } from "vitest";

import stackSquashExtension, {
	STACK_SQUASH_COMMAND_NAME,
	runStackSquash,
	type StackSquashExtensionAPI,
} from "../../src/pi/stack-squash.ts";

interface FakeCommandContext {
	cwd: string;
	ui: {
		notifications: { message: string; level: "info" | "warning" | "error" | undefined }[];
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
}

class FakePi implements StackSquashExtensionAPI {
	readonly commands = new Map<string, { description?: string }>();
	private readonly results: Array<{
		code: number;
		stdout: string;
		stderr: string;
		killed: boolean;
	}>;

	constructor(results: Array<{ code?: number; stdout?: string; stderr?: string }> = []) {
		this.results = results.map((result) => ({
			code: result.code ?? 0,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			killed: false,
		}));
	}

	registerCommand(name: string, options: { description?: string }): void {
		this.commands.set(name, options);
	}

	async exec(): Promise<{ code: number; stdout: string; stderr: string; killed: boolean }> {
		const result = this.results.shift();
		if (result === undefined) throw new Error("unexpected exec");
		return result;
	}
}

function fakeCtx(): FakeCommandContext {
	return {
		cwd: "/work",
		ui: {
			notifications: [],
			notify(message, level) {
				this.notifications.push({ message, level });
			},
		},
	};
}

describe("stack squash Pi bridge", () => {
	test("registers gt:squash-stack", () => {
		const pi = new FakePi();
		stackSquashExtension(pi);

		expect([...pi.commands.keys()]).toEqual([STACK_SQUASH_COMMAND_NAME]);
		expect(pi.commands.get(STACK_SQUASH_COMMAND_NAME)?.description).toContain("gt squash");
	});

	test("emits the shared happy-path summary", async () => {
		const pi = new FakePi([
			{},
			{
				stdout: JSON.stringify({
					status: "ok",
					exitCode: 0,
					data: { branches: ["feature/top"] },
				}),
			},
			{},
			{},
			{},
		]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx);

		expect(ctx.ui.notifications.at(-1)).toEqual({
			level: "info",
			message:
				"Processed 1 Graphite stack branch; each now has one commit.\n\n- feature/top (squashed)",
		});
	});

	test("preserves the dirty-worktree failure notification", async () => {
		const pi = new FakePi([{ stdout: " M file.ts\n" }]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx);

		expect(ctx.ui.notifications.at(-1)).toEqual({
			level: "error",
			message: "Worktree has uncommitted changes; not starting stack squash.\n\nM file.ts",
		});
	});
});

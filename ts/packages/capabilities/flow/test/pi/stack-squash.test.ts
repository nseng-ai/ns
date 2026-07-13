import { FakeGraphiteStackGateway, fakeStackInfo } from "@nseng-ai/capability-kit/graphite/testing";
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

function trackedStack(): FakeGraphiteStackGateway {
	return new FakeGraphiteStackGateway({
		stack: {
			type: "stack",
			stack: fakeStackInfo({ trunk: "main", current: "feature/top", ancestors: ["main"] }),
		},
	});
}

describe("stack squash Pi bridge", () => {
	test("registers gt:squash-stack", () => {
		const pi = new FakePi();
		stackSquashExtension(pi);

		expect([...pi.commands.keys()]).toEqual([STACK_SQUASH_COMMAND_NAME]);
		expect(pi.commands.get(STACK_SQUASH_COMMAND_NAME)?.description).toContain("gt squash");
	});

	test("emits the shared happy-path summary", async () => {
		const pi = new FakePi([{}, { stdout: "3\n" }, {}, {}, {}]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx, trackedStack());

		expect(ctx.ui.notifications.at(-1)).toEqual({
			level: "info",
			message:
				"Processed 1 Graphite stack branch; 3 commits became 1 (2 removed).\n\n- feature/top: 3 → 1 commit",
		});
	});

	test("uses the shared dirty-worktree failure description", async () => {
		const pi = new FakePi([{ stdout: " M file.ts\n" }]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx, trackedStack());

		expect(ctx.ui.notifications.at(-1)).toEqual({
			level: "error",
			message: "Worktree has uncommitted changes; stack squash did not run.\n\nM file.ts",
		});
	});

	test("renders a structured discovery failure without command output", async () => {
		const pi = new FakePi([{}]);
		const ctx = fakeCtx();
		const graphite = new FakeGraphiteStackGateway({
			stack: {
				type: "failure",
				failure: { message: "stack unavailable", returnCode: null },
			},
		});

		await runStackSquash(pi, ctx, graphite);

		expect(ctx.ui.notifications.at(-1)).toEqual({
			level: "error",
			message:
				"Could not read Graphite stack metadata: stack unavailable. Stack squash did not run.",
		});
	});
});

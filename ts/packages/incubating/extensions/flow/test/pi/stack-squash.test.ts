import { FakeGraphiteStackGateway, fakeStackInfo } from "@nseng-ai/extension-kit/graphite/testing";
import { describe, expect, test } from "vitest";

import { IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE } from "@nseng-ai/pi-runtime/commands/ack";
import type { CustomMessage, MessageRenderer } from "@nseng-ai/pi-runtime/runtime/extension-types";

import stackSquashExtension, {
	STACK_SQUASH_COMMAND_NAME,
	runStackSquash,
	type StackSquashExtensionAPI,
} from "../../src/pi/stack-squash.ts";

type RegisteredCommand = Parameters<StackSquashExtensionAPI["registerCommand"]>[1];

interface FakeCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notifications: { message: string; level: "info" | "warning" | "error" | undefined }[];
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
	waitForIdle(): Promise<void>;
}

class FakePi implements StackSquashExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: CustomMessage[] = [];
	readonly events: string[];
	private readonly results: Array<{
		code: number;
		stdout: string;
		stderr: string;
		killed: boolean;
	}>;

	constructor(
		results: Array<{ code?: number; stdout?: string; stderr?: string }> = [],
		events: string[] = [],
	) {
		this.events = events;
		this.results = results.map((result) => ({
			code: result.code ?? 0,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			killed: false,
		}));
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(_customType: string, _renderer: MessageRenderer): void {}

	sendMessage(message: CustomMessage): void {
		this.messages.push(message);
		this.events.push(`message:${message.customType}`);
	}

	async exec(): Promise<{ code: number; stdout: string; stderr: string; killed: boolean }> {
		this.events.push("exec");
		const result = this.results.shift();
		if (result === undefined) throw new Error("unexpected exec");
		return result;
	}
}

function fakeCtx(events: string[] = []): FakeCommandContext {
	return {
		cwd: "/work",
		hasUI: true,
		ui: {
			notifications: [],
			notify(message, level) {
				this.notifications.push({ message, level });
			},
		},
		async waitForIdle() {
			events.push("wait-for-idle");
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
		expect(pi.commands.get(STACK_SQUASH_COMMAND_NAME)?.description).toBe(
			"Run gt squash on every branch in the current stack from the tip down to the bottom",
		);
	});

	test("acknowledges in the transcript before waiting or command I/O", async () => {
		const events: string[] = [];
		const pi = new FakePi([{ stdout: " M file.ts\n" }], events);
		stackSquashExtension(pi);
		const command = pi.commands.get(STACK_SQUASH_COMMAND_NAME);
		if (command === undefined) throw new Error("missing command");

		await command.handler("", fakeCtx(events));

		expect(events.slice(0, 3)).toEqual([
			`message:${IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE}`,
			"wait-for-idle",
			"exec",
		]);
		expect(pi.messages[0]).toMatchObject({
			customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
			display: true,
		});
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

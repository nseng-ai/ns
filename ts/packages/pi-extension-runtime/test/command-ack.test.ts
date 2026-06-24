import { describe, expect, test, vi } from "vitest";

import {
	IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
	IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
	IMMEDIATE_COMMAND_ACK_STATUS_KEY,
	registerCommandWithImmediateAck,
	renderImmediateCommandAckMessage,
	renderImmediateCommandProgressMessage,
	sendCommandProgressOrNotify,
} from "../src/command-ack.ts";
import {
	FakeCommandAckHost,
	commandFor,
	createNotifyContext,
	createStatusContext,
	type RegisteredCommand,
} from "./support/command-ack-fakes.ts";

describe("sendCommandProgressOrNotify", () => {
	test("sends progress above the fold when custom messages are available", () => {
		const host = new FakeCommandAckHost();
		const { ctx, notifications } = createNotifyContext(true);

		sendCommandProgressOrNotify({ host, ctx, message: "Working…" });

		expect(host.renderers.has(IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE)).toBe(true);
		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ Working…",
				display: true,
			},
		]);
		expect(notifications).toEqual([]);
	});

	test("notifies with info when custom messages are unavailable", () => {
		const { ctx, notifications } = createNotifyContext(true);

		sendCommandProgressOrNotify({ host: {}, ctx, message: "Working…" });

		expect(notifications).toEqual([["Working…", "info"]]);
	});

	test("notifies with an explicit fallback level", () => {
		const { ctx, notifications } = createNotifyContext(true);

		sendCommandProgressOrNotify({
			host: {},
			ctx,
			message: "Still waiting…",
			level: "warning",
		});

		expect(notifications).toEqual([["Still waiting…", "warning"]]);
	});

	test("can explicitly notify even when custom messages are available", () => {
		const host = new FakeCommandAckHost();
		const { ctx, notifications } = createNotifyContext(true);

		sendCommandProgressOrNotify({ host, ctx, message: "Working…", delivery: "notify" });

		expect(host.messages).toEqual([]);
		expect(notifications).toEqual([["Working…", "info"]]);
	});

	test("can emit both a custom message and a notification", () => {
		const host = new FakeCommandAckHost();
		const { ctx, notifications } = createNotifyContext(true);

		sendCommandProgressOrNotify({ host, ctx, message: "Working…", delivery: "both" });

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ Working…",
				display: true,
			},
		]);
		expect(notifications).toEqual([["Working…", "info"]]);
	});

	test("notifies non-UI contexts by default", () => {
		const host = new FakeCommandAckHost();
		const { ctx, notifications } = createNotifyContext(false);

		sendCommandProgressOrNotify({ host, ctx, message: "Working…" });

		expect(host.messages).toEqual([]);
		expect(notifications).toEqual([["Working…", "info"]]);
	});

	test("can explicitly skip non-UI notifications", () => {
		const host = new FakeCommandAckHost();
		const { ctx, notifications } = createNotifyContext(false);

		sendCommandProgressOrNotify({
			host,
			ctx,
			message: "Working…",
			shouldNotifyWhenNoUi: false,
		});

		expect(host.messages).toEqual([]);
		expect(notifications).toEqual([]);
	});

	test("skips non-UI notification fallback when notify is unavailable", () => {
		const host = new FakeCommandAckHost();

		expect(() =>
			sendCommandProgressOrNotify({
				host,
				ctx: { hasUI: false, ui: {} },
				message: "Working…",
			}),
		).not.toThrow();
		expect(host.messages).toEqual([]);
	});
});

describe("registerCommandWithImmediateAck", () => {
	test("registers commands without a footer or transcript acknowledgement by default", () => {
		const host = new FakeCommandAckHost();
		const calls: string[] = [];
		const { ctx, statuses } = createStatusContext();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				description: "Run demo",
				handler(args) {
					calls.push(args);
				},
			},
		});

		expect(host.renderers.has(IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE)).toBe(false);
		commandFor(host, "demo:run").handler("--flag", ctx);

		expect(host.messages).toEqual([]);
		expect(statuses).toEqual([]);
		expect(calls).toEqual(["--flag"]);
	});

	test("replaces the starting acknowledgement with started after the status delay", async () => {
		vi.useFakeTimers();
		try {
			const host = new FakeCommandAckHost();
			const { ctx, statuses } = createStatusContext();

			registerCommandWithImmediateAck({
				host: host,
				commandName: "demo:run",
				commandDefinition: {
					handler() {},
				},
				options: { delivery: "status" },
			});
			commandFor(host, "demo:run").handler("", ctx);

			expect(statuses).toEqual([
				[IMMEDIATE_COMMAND_ACK_STATUS_KEY, "→ /demo:run received; starting…"],
			]);

			await vi.advanceTimersByTimeAsync(3_000);

			expect(statuses).toEqual([
				[IMMEDIATE_COMMAND_ACK_STATUS_KEY, "→ /demo:run received; starting…"],
				[IMMEDIATE_COMMAND_ACK_STATUS_KEY, "→ /demo:run received; started"],
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	test("preserves non-handler command definition fields", () => {
		const host = new FakeCommandAckHost();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				description: "Run demo",
				argumentHint: "[flags]",
				handler() {},
			},
		});

		expect(commandFor(host, "demo:run")).toMatchObject({
			description: "Run demo",
			argumentHint: "[flags]",
		});
	});

	test("preserves command status progress as status without adding a default ack", () => {
		const host = new FakeCommandAckHost();
		const { ctx, statuses } = createStatusContext();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler(_args, commandCtx) {
					commandCtx.ui?.setStatus?.("demo", "working…");
					commandCtx.ui?.setStatus?.("demo", "working…");
					commandCtx.ui?.setStatus?.("demo", "finishing…");
					commandCtx.ui?.setStatus?.("demo", undefined);
				},
			},
		});
		commandFor(host, "demo:run").handler("", ctx);

		expect(host.renderers.has(IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE)).toBe(false);
		expect(host.messages).toEqual([]);
		expect(statuses).toEqual([
			["demo", "working…"],
			["demo", "working…"],
			["demo", "finishing…"],
			["demo", undefined],
		]);
	});

	test("can explicitly use a transient status acknowledgement", () => {
		const host = {
			commands: new Map<string, RegisteredCommand>(),
			registerCommand(name: string, command: RegisteredCommand): void {
				this.commands.set(name, command);
			},
		};
		const { ctx, statuses } = createStatusContext();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler(_args, commandCtx) {
					commandCtx.ui?.setStatus?.("demo", "working…");
				},
			},
			options: { delivery: "status" },
		});
		host.commands.get("demo:run")?.handler("", ctx);

		expect(statuses[0]).toEqual([
			IMMEDIATE_COMMAND_ACK_STATUS_KEY,
			"→ /demo:run received; starting…",
		]);
		expect(statuses[1]).toEqual(["demo", "working…"]);
	});

	test("does not acknowledge explicitly non-UI contexts", () => {
		const host = new FakeCommandAckHost();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler() {},
			},
		});
		commandFor(host, "demo:run").handler("", { hasUI: false });

		expect(host.messages).toEqual([]);
	});

	test("can suppress the acknowledgement when a command provides its own progress surface", () => {
		const host = new FakeCommandAckHost();
		const { ctx, statuses } = createStatusContext();
		const calls: string[] = [];

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler(args) {
					calls.push(args);
				},
			},
			options: { delivery: "none" },
		});
		commandFor(host, "demo:run").handler("--flag", ctx);

		expect(host.messages).toEqual([]);
		expect(statuses).toEqual([]);
		expect(calls).toEqual(["--flag"]);
	});

	test("deduplicates duplicate acknowledgement attempts for the same command context", () => {
		const host = new FakeCommandAckHost();
		const { ctx, statuses } = createStatusContext();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler() {},
			},
			options: { delivery: "status" },
		});
		const command = commandFor(host, "demo:run");
		command.handler("", ctx);
		command.handler("again", ctx);

		expect(host.messages).toEqual([]);
		expect(statuses).toEqual([
			[IMMEDIATE_COMMAND_ACK_STATUS_KEY, "→ /demo:run received; starting…"],
		]);
	});

	test("explicit progress helper emits transcript progress from command milestones", () => {
		const host = new FakeCommandAckHost();
		const { ctx, statuses } = createStatusContext();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler(_args, commandCtx) {
					sendCommandProgressOrNotify({ host, ctx: commandCtx, message: "Working…" });
				},
			},
		});
		commandFor(host, "demo:run").handler("", ctx);

		// The ack is suppressed by default; explicit progress is still a transcript message.
		expect(statuses).toEqual([]);
		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ Working…",
				display: true,
			},
		]);
	});
});

describe("renderImmediateCommandAckMessage", () => {
	test("renders acknowledgement lines as dim text", () => {
		const component = renderImmediateCommandAckMessage(
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
			{ expanded: false },
			{ fg: (color, text) => `${color}:${text}` },
		);

		expect(component.render(80)).toEqual(["dim:→ /demo:run received; starting…"]);
	});
});

describe("renderImmediateCommandProgressMessage", () => {
	test("renders progress lines as dim text", () => {
		const component = renderImmediateCommandProgressMessage(
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ working…",
				display: true,
			},
			{ expanded: false },
			{ fg: (color, text) => `${color}:${text}` },
		);

		expect(component.render(80)).toEqual(["dim:→ working…"]);
	});
});

import { describe, expect, test } from "vitest";

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
	test("registers commands with an above-fold message acknowledgement by default", () => {
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

		expect(host.renderers.has(IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE)).toBe(true);
		commandFor(host, "demo:run").handler("--flag", ctx);

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
		expect(statuses).toEqual([]);
		expect(calls).toEqual(["--flag"]);
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

	test("preserves command status progress as status by default", () => {
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
		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
		expect(statuses).toEqual([
			["demo", "working…"],
			["demo", "working…"],
			["demo", "finishing…"],
			["demo", undefined],
		]);
	});

	test("falls back to a transient status acknowledgement when custom messages are unavailable", () => {
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

	test("deduplicates duplicate acknowledgement attempts for the same command context", () => {
		const host = new FakeCommandAckHost();
		const ctx = { hasUI: true };

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler() {},
			},
		});
		const command = commandFor(host, "demo:run");
		command.handler("", ctx);
		command.handler("again", ctx);

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
	});

	test("explicit progress helper emits transcript progress from command milestones", () => {
		const host = new FakeCommandAckHost();

		registerCommandWithImmediateAck({
			host: host,
			commandName: "demo:run",
			commandDefinition: {
				handler(_args, ctx) {
					sendCommandProgressOrNotify({ host, ctx, message: "Working…" });
				},
			},
		});
		commandFor(host, "demo:run").handler("", { hasUI: true });

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
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

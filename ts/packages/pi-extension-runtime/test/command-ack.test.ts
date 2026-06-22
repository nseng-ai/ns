import { describe, expect, test } from "vitest";

import {
	IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
	IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
	renderImmediateCommandAckMessage,
	renderImmediateCommandProgressMessage,
	sendCommandProgressOrNotify,
	withImmediateCommandAck,
	type CommandProgressNotifyLevel,
	type ImmediateCommandAckCustomMessage,
} from "../src/command-ack.ts";

interface CommandContext {
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: CommandProgressNotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
}

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: CommandContext): unknown;
}

class FakeHost {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: ImmediateCommandAckCustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(name: string, renderer: unknown): void {
		this.renderers.set(name, renderer);
	}

	sendMessage(message: ImmediateCommandAckCustomMessage): void {
		this.messages.push(message);
	}
}

function commandFor(host: FakeHost, name: string): RegisteredCommand {
	const command = host.commands.get(name);
	if (command === undefined) throw new Error(`Missing command ${name}`);
	return command;
}

function createNotifyContext(hasUI?: boolean): {
	ctx: {
		hasUI?: boolean;
		ui: { notify(message: string, level?: CommandProgressNotifyLevel): void };
	};
	notifications: Array<[string, CommandProgressNotifyLevel | undefined]>;
} {
	const notifications: Array<[string, CommandProgressNotifyLevel | undefined]> = [];
	return {
		ctx: {
			...(hasUI === undefined ? {} : { hasUI }),
			ui: {
				notify(message, level) {
					notifications.push([message, level]);
				},
			},
		},
		notifications,
	};
}

describe("sendCommandProgressOrNotify", () => {
	test("sends progress above the fold when custom messages are available", () => {
		const host = new FakeHost();
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

	test("honors wrapper status progress delivery for helper progress", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(host, { progressDelivery: "status" });
		const notifications: Array<[string, CommandProgressNotifyLevel | undefined]> = [];

		wrapped.registerCommand("demo:run", {
			handler(_args, ctx) {
				sendCommandProgressOrNotify({ host, ctx, message: "Working…" });
			},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: {
				notify: (message, level) => notifications.push([message, level]),
				setStatus() {},
			},
		});

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
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

	test("skips progress and notifications for non-UI contexts by default", () => {
		const host = new FakeHost();
		const { ctx, notifications } = createNotifyContext(false);

		sendCommandProgressOrNotify({ host, ctx, message: "Working…" });

		expect(host.messages).toEqual([]);
		expect(notifications).toEqual([]);
	});

	test("can notify non-UI contexts when explicitly requested", () => {
		const host = new FakeHost();
		const { ctx, notifications } = createNotifyContext(false);

		sendCommandProgressOrNotify({
			host,
			ctx,
			message: "Working…",
			shouldNotifyWhenNoUi: true,
		});

		expect(host.messages).toEqual([]);
		expect(notifications).toEqual([["Working…", "info"]]);
	});

	test("skips non-UI notification fallback when notify is unavailable", () => {
		const host = new FakeHost();

		expect(() =>
			sendCommandProgressOrNotify({
				host,
				ctx: { hasUI: false, ui: {} },
				message: "Working…",
				shouldNotifyWhenNoUi: true,
			}),
		).not.toThrow();
		expect(host.messages).toEqual([]);
	});
});

describe("withImmediateCommandAck", () => {
	test("wraps registered commands with an above-fold message acknowledgement by default", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(host);
		const calls: string[] = [];
		const statuses: Array<[string, string | undefined]> = [];

		wrapped.registerCommand("demo:run", {
			description: "Run demo",
			handler(args) {
				calls.push(args);
			},
		});

		expect(host.renderers.has(IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE)).toBe(true);
		commandFor(host, "demo:run").handler("--flag", {
			hasUI: true,
			ui: { setStatus: (key, value) => statuses.push([key, value]) },
		});

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

	test("preserves command status progress as status by default", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(host);
		const statuses: Array<[string, string | undefined]> = [];

		wrapped.registerCommand("demo:run", {
			handler(_args, ctx) {
				ctx.ui?.setStatus("demo", "working…");
				ctx.ui?.setStatus("demo", "working…");
				ctx.ui?.setStatus("demo", "finishing…");
				ctx.ui?.setStatus("demo", undefined);
			},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: { setStatus: (key, value) => statuses.push([key, value]) },
		});

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

	test("can opt command status progress into above-fold messages", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(host, { progressDelivery: "message" });
		const statuses: Array<[string, string | undefined]> = [];

		wrapped.registerCommand("demo:run", {
			handler(_args, ctx) {
				ctx.ui?.setStatus("demo", "working…");
				ctx.ui?.setStatus("demo", "working…");
				ctx.ui?.setStatus("demo", "finishing…");
				ctx.ui?.setStatus("demo", undefined);
			},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: { setStatus: (key, value) => statuses.push([key, value]) },
		});

		expect(host.renderers.has(IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE)).toBe(true);
		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ working…",
				display: true,
			},
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ finishing…",
				display: true,
			},
		]);
		expect(statuses).toEqual([]);
	});

	test("falls back to a transient status acknowledgement and status progress when custom messages are unavailable", () => {
		const host = {
			commands: new Map<string, RegisteredCommand>(),
			registerCommand(name: string, command: RegisteredCommand): void {
				this.commands.set(name, command);
			},
		};
		const wrapped = withImmediateCommandAck(host);
		const statuses: Array<[string, string | undefined]> = [];

		wrapped.registerCommand("demo:run", {
			handler(_args, ctx) {
				ctx.ui?.setStatus("demo", "working…");
			},
		});
		host.commands.get("demo:run")?.handler("", {
			hasUI: true,
			ui: { setStatus: (key, value) => statuses.push([key, value]) },
		});

		expect(statuses[0]).toEqual(["sdl-command-ack", "→ /demo:run received; starting…"]);
		expect(statuses[1]).toEqual(["demo", "working…"]);
	});

	test("can emit persistent command-stream text when message delivery is requested", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(host, { delivery: "message" });

		wrapped.registerCommand("demo:run", {
			handler() {},
		});
		commandFor(host, "demo:run").handler("", { hasUI: true });

		expect(host.renderers.has(IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE)).toBe(true);
		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
	});

	test("deduplicates nested wrappers for the same command invocation", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(
			withImmediateCommandAck(host, { delivery: "message" }),
			{ delivery: "message" },
		);

		wrapped.registerCommand("demo:run", {
			handler(_args, ctx) {
				ctx.ui?.setStatus("demo", "working…");
			},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: { setStatus() {} },
		});

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
	});

	test("deduplicates nested wrappers with different acknowledgement delivery modes", () => {
		const host = new FakeHost();
		const statuses: Array<[string, string | undefined]> = [];
		const wrapped = withImmediateCommandAck(
			withImmediateCommandAck(host, { delivery: "message" }),
			{ delivery: "status" },
		);

		wrapped.registerCommand("demo:run", {
			handler() {},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: { setStatus: (key, value) => statuses.push([key, value]) },
		});

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
		expect(statuses).toEqual([]);
	});

	test("prefers message acknowledgement when a default wrapper is wrapped with status delivery", () => {
		const host = new FakeHost();
		const statuses: Array<[string, string | undefined]> = [];
		const wrapped = withImmediateCommandAck(withImmediateCommandAck(host), {
			delivery: "status",
		});

		wrapped.registerCommand("demo:run", {
			handler() {},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: { setStatus: (key, value) => statuses.push([key, value]) },
		});

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
		expect(statuses).toEqual([]);
	});

	test("nested progress delivery lets sub-registrars opt into message progress", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(
			withImmediateCommandAck(host, { progressDelivery: "status" }),
			{ progressDelivery: "message" },
		);
		const statuses: Array<[string, string | undefined]> = [];

		wrapped.registerCommand("demo:run", {
			handler(_args, ctx) {
				ctx.ui?.setStatus("demo", "working…");
				sendCommandProgressOrNotify({ host, ctx, message: "Helper progress…" });
			},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: {
				setStatus: (key, value) => statuses.push([key, value]),
			},
		});

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ working…",
				display: true,
			},
			{
				customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
				content: "→ Helper progress…",
				display: true,
			},
		]);
		expect(statuses).toEqual([]);
	});

	test("nested progress delivery lets sub-registrars keep progress status-only", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(
			withImmediateCommandAck(host, { progressDelivery: "message" }),
			{ progressDelivery: "status" },
		);
		const notifications: Array<[string, CommandProgressNotifyLevel | undefined]> = [];
		const statuses: Array<[string, string | undefined]> = [];

		wrapped.registerCommand("demo:run", {
			handler(_args, ctx) {
				ctx.ui?.setStatus("demo", "working…");
				sendCommandProgressOrNotify({ host, ctx, message: "Helper progress…" });
			},
		});
		commandFor(host, "demo:run").handler("", {
			hasUI: true,
			ui: {
				notify: (message, level) => notifications.push([message, level]),
				setStatus: (key, value) => statuses.push([key, value]),
			},
		});

		expect(host.messages).toEqual([
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: "→ /demo:run received; starting…",
				display: true,
			},
		]);
		expect(statuses).toEqual([["demo", "working…"]]);
		expect(notifications).toEqual([["Helper progress…", "info"]]);
	});

	test("does not acknowledge explicitly non-UI contexts", () => {
		const host = new FakeHost();
		const wrapped = withImmediateCommandAck(host);

		wrapped.registerCommand("demo:run", {
			handler() {},
		});
		commandFor(host, "demo:run").handler("", { hasUI: false });

		expect(host.messages).toEqual([]);
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

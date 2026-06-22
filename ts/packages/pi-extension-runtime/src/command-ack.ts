import {
	customMessageText,
	truncateDisplayLine,
	type CustomMessageContent,
} from "./terminal-presentation.ts";

export const IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE = "sdl-command-ack";
export const IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE = "sdl-command-progress";

const acknowledgedCommandsByContext = new WeakMap<object, Set<string>>();
const commandProgressOptionsByContext = new WeakMap<object, ImmediateCommandAckOptions>();
const COMMAND_ACK_HOST_SOURCE = Symbol("sdl.commandAckHostSource");
const COMMAND_ACK_HOST_OPTIONS = Symbol("sdl.commandAckHostOptions");
const COMMAND_PROGRESS_CONTEXT_MARKER = Symbol("sdl.commandProgressContext");
const COMMAND_CONTEXT_SOURCE = Symbol("sdl.commandContextSource");

export interface ImmediateCommandAckCustomMessage {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
}

export interface ImmediateCommandAckRenderTheme {
	fg(color: string, text: string): string;
}

export interface ImmediateCommandAckRenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

export type ImmediateCommandAckMessageRenderer = (
	message: ImmediateCommandAckCustomMessage,
	options: { expanded: boolean },
	theme: ImmediateCommandAckRenderTheme,
) => ImmediateCommandAckRenderComponent;

export type ImmediateCommandAckDelivery = "status" | "message";
export type ImmediateCommandProgressDelivery = "status" | "message" | "both" | "none";
export type CommandProgressNotifyLevel = "info" | "success" | "warning" | "error";

export interface CommandProgressNotifyContext<
	TLevel extends CommandProgressNotifyLevel = CommandProgressNotifyLevel,
> {
	hasUI?: boolean;
	ui?: {
		notify?: (message: string, level?: TLevel | "info") => void;
	};
}

export interface SendCommandProgressOrNotifyOptions<
	TLevel extends CommandProgressNotifyLevel = CommandProgressNotifyLevel,
> {
	host: object;
	ctx: CommandProgressNotifyContext<TLevel>;
	message: string;
	level?: TLevel;
	shouldNotifyWhenNoUi?: boolean;
}

export interface ImmediateCommandStatusProgress {
	commandName: string;
	statusKey: string;
	status: string;
}

export interface ImmediateCommandAckOptions {
	delivery?: ImmediateCommandAckDelivery;
	messageForCommand?: (commandName: string) => string;
	progressDelivery?: ImmediateCommandProgressDelivery;
	progressMessageForStatus?: (progress: ImmediateCommandStatusProgress) => string;
	statusKey?: string;
	statusClearDelayMs?: number;
}

interface CommandDefinitionRecord {
	handler: (args: string, ctx: unknown) => unknown;
	[key: string]: unknown;
}

interface ImmediateCommandAckHostShape {
	registerCommand: unknown;
	registerMessageRenderer?: unknown;
	sendMessage?: unknown;
}

interface EmitImmediateCommandAckOptions {
	host: ImmediateCommandAckHostShape;
	commandName: string;
	ctx: unknown;
	options: ImmediateCommandAckOptions;
}

interface WrapCommandContextForProgressOptions {
	host: ImmediateCommandAckHostShape;
	commandName: string;
	ctx: unknown;
	options: ImmediateCommandAckOptions;
}

interface EmitCommandStatusProgressOptions {
	host: ImmediateCommandAckHostShape;
	commandName: string;
	statusKey: string;
	status: string;
	options: ImmediateCommandAckOptions;
}

interface EmitStatusAckOptions {
	ctx: unknown;
	key: string;
	message: string;
	clearDelayMs: number;
}

export function withImmediateCommandAck<THost extends object>(
	host: THost,
	options: ImmediateCommandAckOptions = {},
): THost {
	const baseHost = commandAckHostSource(host) as THost;
	const mergedOptions = mergeImmediateCommandAckOptions(commandAckHostOptions(host), options);
	const hostShape = baseHost as ImmediateCommandAckHostShape;
	if (typeof hostShape.registerCommand !== "function") return host;

	const resolvedOptions = {
		...mergedOptions,
		delivery: resolveImmediateCommandAckDelivery(hostShape, mergedOptions),
	} satisfies ImmediateCommandAckOptions;
	if (resolvedOptions.delivery === "message") {
		registerImmediateCommandAckRenderer(hostShape);
	}
	if (shouldRegisterCommandProgressRenderer(hostShape, resolvedOptions)) {
		registerImmediateCommandProgressRenderer(hostShape);
	}
	const registerCommand = hostShape.registerCommand;
	return new Proxy(baseHost, {
		get(target, property, receiver) {
			if (property === COMMAND_ACK_HOST_SOURCE) return baseHost;
			if (property === COMMAND_ACK_HOST_OPTIONS) return resolvedOptions;
			if (property !== "registerCommand") return Reflect.get(target, property, receiver);
			return (commandName: string, commandDefinition: unknown): unknown => {
				if (!isCommandDefinitionRecord(commandDefinition)) {
					return Reflect.apply(registerCommand, baseHost, [commandName, commandDefinition]);
				}

				return Reflect.apply(registerCommand, baseHost, [
					commandName,
					{
						...commandDefinition,
						handler(args: string, ctx: unknown): unknown {
							emitImmediateCommandAck({
								host: hostShape,
								commandName,
								ctx,
								options: resolvedOptions,
							});
							return commandDefinition.handler(
								args,
								wrapCommandContextForProgress({
									host: hostShape,
									commandName,
									ctx,
									options: resolvedOptions,
								}),
							);
						},
					},
				]);
			};
		},
	}) as THost;
}

export function registerImmediateCommandAckRenderer(host: object): void {
	registerImmediateCommandMessageRenderer(
		host,
		IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
		renderImmediateCommandAckMessage,
	);
}

export function registerImmediateCommandProgressRenderer(host: object): void {
	registerImmediateCommandMessageRenderer(
		host,
		IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
		renderImmediateCommandProgressMessage,
	);
}

export function sendCommandProgressMessage(host: object, message: string): boolean {
	const hostShape = host as ImmediateCommandAckHostShape;
	if (!canSendRenderedMessage(hostShape)) return false;
	const sendMessage = hostShape.sendMessage;
	if (typeof sendMessage !== "function") return false;
	registerImmediateCommandProgressRenderer(host);
	Reflect.apply(sendMessage, host, [
		{
			customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
			content: defaultCommandProgressMessage(message),
			display: true,
		},
	]);
	return true;
}

export function sendCommandProgressOrNotify<
	TLevel extends CommandProgressNotifyLevel = CommandProgressNotifyLevel,
>(options: SendCommandProgressOrNotifyOptions<TLevel>): void {
	const { host, ctx, message } = options;
	const hasUi = ctx.hasUI !== false;
	const hostShape = commandAckHostSource(host) as ImmediateCommandAckHostShape;
	const delivery = resolveCommandProgressHelperDelivery(host, hostShape, ctx);
	if (delivery === "none") return;
	if (!hasUi) {
		if (options.shouldNotifyWhenNoUi === true) notifyCommandProgress(ctx, message, options.level);
		return;
	}
	if (delivery === "message" && sendCommandProgressMessage(hostShape, message)) return;
	if (delivery === "both") {
		sendCommandProgressMessage(hostShape, message);
		notifyCommandProgress(ctx, message, options.level);
		return;
	}
	notifyCommandProgress(ctx, message, options.level);
}

function registerImmediateCommandMessageRenderer(
	host: object,
	customType: string,
	renderer: ImmediateCommandAckMessageRenderer,
): void {
	const registerMessageRenderer = (host as ImmediateCommandAckHostShape).registerMessageRenderer;
	if (typeof registerMessageRenderer !== "function") return;
	Reflect.apply(registerMessageRenderer, host, [customType, renderer]);
}

function mergeImmediateCommandAckOptions(
	base: ImmediateCommandAckOptions | undefined,
	overrides: ImmediateCommandAckOptions,
): ImmediateCommandAckOptions {
	if (base === undefined) return overrides;
	const merged = { ...base, ...overrides };
	if (base.delivery === "message" || overrides.delivery === "message") {
		merged.delivery = "message";
	}
	return merged;
}

function commandAckHostSource(host: object): object {
	const source = (host as { [COMMAND_ACK_HOST_SOURCE]?: unknown })[COMMAND_ACK_HOST_SOURCE];
	return typeof source === "object" && source !== null ? source : host;
}

function commandAckHostOptions(host: object): ImmediateCommandAckOptions | undefined {
	const options = (host as { [COMMAND_ACK_HOST_OPTIONS]?: unknown })[COMMAND_ACK_HOST_OPTIONS];
	if (typeof options !== "object" || options === null) return undefined;
	return options as ImmediateCommandAckOptions;
}

export function renderImmediateCommandAckMessage(
	message: ImmediateCommandAckCustomMessage,
	_options: { expanded: boolean },
	theme: ImmediateCommandAckRenderTheme,
): ImmediateCommandAckRenderComponent {
	return renderImmediateCommandDimMessage(message, theme);
}

export function renderImmediateCommandProgressMessage(
	message: ImmediateCommandAckCustomMessage,
	_options: { expanded: boolean },
	theme: ImmediateCommandAckRenderTheme,
): ImmediateCommandAckRenderComponent {
	return renderImmediateCommandDimMessage(message, theme);
}

function renderImmediateCommandDimMessage(
	message: ImmediateCommandAckCustomMessage,
	theme: ImmediateCommandAckRenderTheme,
): ImmediateCommandAckRenderComponent {
	const content = customMessageText(message.content);
	return {
		render(width: number): string[] {
			return content.split("\n").map((line) => theme.fg("dim", truncateDisplayLine(line, width)));
		},
		invalidate(): void {},
	};
}

function emitImmediateCommandAck(params: EmitImmediateCommandAckOptions): void {
	const { host, commandName, ctx, options } = params;
	if (!shouldAcknowledgeContext(ctx)) return;
	const delivery = resolveImmediateCommandAckDelivery(host, options);
	if (!markAcknowledged(ctx, commandName)) return;
	const message = options.messageForCommand?.(commandName) ?? defaultCommandAckMessage(commandName);

	if (delivery === "message") {
		if (typeof host.sendMessage !== "function") return;
		Reflect.apply(host.sendMessage, host, [
			{
				customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
				content: message,
				display: true,
			},
		]);
		return;
	}

	emitStatusAck({
		ctx,
		key: options.statusKey ?? "sdl-command-ack",
		message,
		clearDelayMs: options.statusClearDelayMs ?? 3_000,
	});
}

function defaultCommandAckMessage(commandName: string): string {
	return `→ /${commandName} received; starting…`;
}

function defaultCommandProgressMessage(message: string): string {
	return message.startsWith("→ ") ? message : `→ ${message}`;
}

function shouldRegisterCommandProgressRenderer(
	host: ImmediateCommandAckHostShape,
	options: ImmediateCommandAckOptions,
): boolean {
	const delivery = resolveImmediateCommandProgressDelivery(host, options);
	return delivery === "message" || delivery === "both";
}

function resolveImmediateCommandAckDelivery(
	host: ImmediateCommandAckHostShape,
	options: ImmediateCommandAckOptions,
): ImmediateCommandAckDelivery {
	if (options.delivery !== undefined) return options.delivery;
	return canSendRenderedMessage(host) ? "message" : "status";
}

function canSendRenderedMessage(host: ImmediateCommandAckHostShape): boolean {
	return (
		typeof host.sendMessage === "function" && typeof host.registerMessageRenderer === "function"
	);
}

function wrapCommandContextForProgress(params: WrapCommandContextForProgressOptions): unknown {
	const { host, commandName, ctx, options } = params;
	if (typeof ctx !== "object" || ctx === null) return ctx;
	if ((ctx as { [COMMAND_PROGRESS_CONTEXT_MARKER]?: unknown })[COMMAND_PROGRESS_CONTEXT_MARKER]) {
		return ctx;
	}
	const contextSource = commandContextSource(ctx);
	commandProgressOptionsByContext.set(contextSource, options);
	const delivery = resolveImmediateCommandProgressDelivery(host, options);
	if (delivery === "status" || delivery === "none") return ctx;
	const ui = (ctx as { ui?: unknown }).ui;
	if (typeof ui !== "object" || ui === null) return ctx;
	const setStatus = (ui as { setStatus?: unknown }).setStatus;
	if (typeof setStatus !== "function") return ctx;

	const lastProgressByKey = new Map<string, string>();
	const wrappedUi = new Proxy(ui, {
		get(target, property, receiver) {
			if (property !== "setStatus") return Reflect.get(target, property, receiver);
			return (statusKey: string, status: string | undefined): unknown => {
				if (status === undefined) {
					lastProgressByKey.delete(statusKey);
				} else if (lastProgressByKey.get(statusKey) !== status) {
					lastProgressByKey.set(statusKey, status);
					emitCommandStatusProgress({ host, commandName, statusKey, status, options });
				}
				if (delivery === "both") return Reflect.apply(setStatus, target, [statusKey, status]);
				return undefined;
			};
		},
	});
	return new Proxy(ctx, {
		get(target, property, receiver) {
			if (property === COMMAND_PROGRESS_CONTEXT_MARKER) return true;
			if (property === COMMAND_CONTEXT_SOURCE) return contextSource;
			if (property === "ui") return wrappedUi;
			return Reflect.get(target, property, receiver);
		},
	});
}

function emitCommandStatusProgress(params: EmitCommandStatusProgressOptions): void {
	const { host, commandName, statusKey, status, options } = params;
	const message =
		options.progressMessageForStatus?.({ commandName, statusKey, status }) ??
		defaultCommandProgressMessage(status);
	if (typeof host.sendMessage !== "function") return;
	Reflect.apply(host.sendMessage, host, [
		{
			customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
			content: message,
			display: true,
		},
	]);
}

function resolveImmediateCommandProgressDelivery(
	host: ImmediateCommandAckHostShape,
	options: ImmediateCommandAckOptions,
): ImmediateCommandProgressDelivery {
	return resolveProgressDeliveryOption(host, options.progressDelivery, "status");
}

function resolveCommandProgressHelperDelivery<TLevel extends CommandProgressNotifyLevel>(
	host: object,
	hostShape: ImmediateCommandAckHostShape,
	ctx: CommandProgressNotifyContext<TLevel>,
): ImmediateCommandProgressDelivery {
	const options = commandProgressContextOptions(ctx) ?? commandAckHostOptions(host);
	return resolveProgressDeliveryOption(hostShape, options?.progressDelivery, "message");
}

function resolveProgressDeliveryOption(
	host: ImmediateCommandAckHostShape,
	progressDelivery: ImmediateCommandProgressDelivery | undefined,
	defaultDelivery: ImmediateCommandProgressDelivery,
): ImmediateCommandProgressDelivery {
	if (progressDelivery === "message" || progressDelivery === "both") {
		return canSendRenderedMessage(host) ? progressDelivery : "status";
	}
	if (progressDelivery !== undefined) return progressDelivery;
	return canSendRenderedMessage(host) ? defaultDelivery : "status";
}

function commandProgressContextOptions<TLevel extends CommandProgressNotifyLevel>(
	ctx: CommandProgressNotifyContext<TLevel>,
): ImmediateCommandAckOptions | undefined {
	const contextSource = commandContextSource(ctx);
	return commandProgressOptionsByContext.get(contextSource);
}

function notifyCommandProgress<TLevel extends CommandProgressNotifyLevel>(
	ctx: CommandProgressNotifyContext<TLevel>,
	message: string,
	level: TLevel | undefined,
): void {
	if (typeof ctx.ui?.notify !== "function") return;
	ctx.ui.notify(message, level ?? "info");
}

function isCommandDefinitionRecord(value: unknown): value is CommandDefinitionRecord {
	if (typeof value !== "object" || value === null) return false;
	const handler = (value as { handler?: unknown }).handler;
	return typeof handler === "function";
}

function shouldAcknowledgeContext(ctx: unknown): boolean {
	if (typeof ctx !== "object" || ctx === null) return true;
	const hasUI = (ctx as { hasUI?: unknown }).hasUI;
	return hasUI !== false;
}

function emitStatusAck(params: EmitStatusAckOptions): void {
	const { ctx, key, message, clearDelayMs } = params;
	if (typeof ctx !== "object" || ctx === null) return;
	const ui = (ctx as { ui?: { setStatus?: unknown } }).ui;
	const setStatus = ui?.setStatus;
	if (typeof setStatus !== "function") return;
	setStatus(key, message);
	const timer = setTimeout(() => setStatus(key, undefined), clearDelayMs);
	timer.unref?.();
}

function markAcknowledged(ctx: unknown, commandName: string): boolean {
	if (typeof ctx !== "object" || ctx === null) return true;
	const contextSource = commandContextSource(ctx);
	const key = commandName;
	const existing = acknowledgedCommandsByContext.get(contextSource);
	if (existing?.has(key)) return false;
	if (existing) {
		existing.add(key);
		return true;
	}
	acknowledgedCommandsByContext.set(contextSource, new Set([key]));
	return true;
}

function commandContextSource(ctx: object): object {
	const source = (ctx as { [COMMAND_CONTEXT_SOURCE]?: unknown })[COMMAND_CONTEXT_SOURCE];
	return typeof source === "object" && source !== null ? source : ctx;
}

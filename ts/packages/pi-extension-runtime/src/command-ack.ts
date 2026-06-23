import {
	customMessageText,
	truncateDisplayLine,
	type CustomMessageContent,
} from "./terminal-presentation.ts";

export const IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE = "sdl-command-ack";
export const IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE = "sdl-command-progress";

const acknowledgedCommandsByContext = new WeakMap<object, Set<string>>();

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
export type CommandProgressDelivery = "message" | "notify" | "both" | "none";
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
	delivery?: CommandProgressDelivery;
	level?: TLevel;
	shouldNotifyWhenNoUi?: boolean;
}

export interface ImmediateCommandAckOptions {
	delivery?: ImmediateCommandAckDelivery;
	messageForCommand?: (commandName: string) => string;
	statusKey?: string;
	statusClearDelayMs?: number;
}

export interface ImmediateCommandAckCommandDefinition<TContext = unknown> {
	handler(args: string, ctx: TContext): unknown;
}

export interface ImmediateCommandAckCommandRegistrar<TCommand> {
	registerCommand(name: string, command: TCommand): unknown;
	registerMessageRenderer?: unknown;
	sendMessage?: unknown;
}

interface ImmediateCommandAckHostShape {
	registerMessageRenderer?: unknown;
	sendMessage?: unknown;
}

interface EmitImmediateCommandAckOptions {
	host: ImmediateCommandAckHostShape;
	commandName: string;
	ctx: unknown;
	options: ImmediateCommandAckOptions;
}

interface EmitStatusAckOptions {
	ctx: unknown;
	key: string;
	message: string;
	clearDelayMs: number;
}

export function registerCommandWithImmediateAck<
	TContext,
	TCommand extends ImmediateCommandAckCommandDefinition<TContext>,
>(
	host: ImmediateCommandAckCommandRegistrar<TCommand>,
	commandName: string,
	commandDefinition: TCommand,
	options: ImmediateCommandAckOptions = {},
): unknown {
	if (resolveImmediateCommandAckDelivery(host, options) === "message") {
		registerImmediateCommandAckRenderer(host);
	}
	return host.registerCommand(commandName, {
		...commandDefinition,
		handler(args: string, ctx: TContext): unknown {
			emitImmediateCommandAck({ host, commandName, ctx, options });
			return commandDefinition.handler(args, ctx);
		},
	} as TCommand);
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
	const delivery = options.delivery ?? "message";
	if (delivery === "none") return;

	const hasUi = ctx.hasUI !== false;
	if (!hasUi) {
		if (options.shouldNotifyWhenNoUi === true && shouldNotifyForDelivery(delivery)) {
			notifyCommandProgress(ctx, message, options.level);
		}
		return;
	}

	if (delivery === "notify") {
		notifyCommandProgress(ctx, message, options.level);
		return;
	}

	const sentMessage = sendCommandProgressMessage(host, message);
	if (delivery === "both") {
		notifyCommandProgress(ctx, message, options.level);
		return;
	}
	if (!sentMessage) notifyCommandProgress(ctx, message, options.level);
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

function shouldNotifyForDelivery(delivery: CommandProgressDelivery): boolean {
	return delivery === "notify" || delivery === "both" || delivery === "message";
}

function notifyCommandProgress<TLevel extends CommandProgressNotifyLevel>(
	ctx: CommandProgressNotifyContext<TLevel>,
	message: string,
	level: TLevel | undefined,
): void {
	if (typeof ctx.ui?.notify !== "function") return;
	ctx.ui.notify(message, level ?? "info");
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
	const existing = acknowledgedCommandsByContext.get(ctx);
	if (existing?.has(commandName)) return false;
	if (existing) {
		existing.add(commandName);
		return true;
	}
	acknowledgedCommandsByContext.set(ctx, new Set([commandName]));
	return true;
}

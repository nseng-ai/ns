import { withSafePiUi, withSafePiUiValue } from "../shared/safe-ui.ts";
import { unrefTimerScheduler } from "../shared/timers.ts";
import {
	customMessageText,
	truncateDisplayLine,
	type CustomMessageContent,
} from "../terminal/presentation.ts";

export const IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE = "sdl-command-ack";
export const IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE = "sdl-command-progress";
export const IMMEDIATE_COMMAND_ACK_STATUS_KEY = "sdl-command-ack";

const acknowledgedCommandsByContext = new WeakMap<WeakKey, Set<string>>();

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

export interface ImmediateCommandRenderedMessageHost {
	registerMessageRenderer(
		customType: string,
		renderer: ImmediateCommandAckMessageRenderer,
	): unknown;
	sendMessage(message: ImmediateCommandAckCustomMessage): unknown;
}

export interface ImmediateCommandStatusContext {
	hasUI?: boolean;
	ui?: {
		setStatus?(key: string, value: string | undefined): void;
	};
}

export interface ImmediateCommandNotifyContext<
	TLevel extends CommandProgressNotifyLevel = CommandProgressNotifyLevel,
> {
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: TLevel | "info"): void;
	};
}

export type ImmediateCommandAckDelivery = "status" | "message" | "none";
export type CommandProgressDelivery = "message" | "notify" | "both" | "none";
export type CommandProgressNotifyLevel = "info" | "success" | "warning" | "error";

export interface SendCommandProgressOrNotifyOptions<
	THost,
	TLevel extends CommandProgressNotifyLevel = CommandProgressNotifyLevel,
> {
	host: THost;
	ctx: ImmediateCommandNotifyContext<TLevel>;
	message: string;
	delivery?: CommandProgressDelivery;
	level?: TLevel;
	/**
	 * Defaults to true so headless command hosts that implement notify/print still surface progress.
	 * Set false only when a caller intentionally wants progress to be UI-only.
	 */
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

export interface ImmediateCommandAckCommandRegistrar<TCommand = unknown> {
	registerCommand(name: string, command: TCommand): unknown;
}

type RegisteredCommandFor<THost> =
	THost extends ImmediateCommandAckCommandRegistrar<infer TCommand> ? TCommand : never;

type CommandContextFor<TCommand> =
	TCommand extends ImmediateCommandAckCommandDefinition<infer TContext> ? TContext : never;

export interface RegisterCommandWithImmediateAckOptions<
	THost extends ImmediateCommandAckCommandRegistrar,
> {
	host: THost;
	commandName: string;
	commandDefinition: RegisteredCommandFor<THost>;
	options?: ImmediateCommandAckOptions;
}

interface EmitImmediateCommandAckOptions<THost> {
	host: THost;
	commandName: string;
	ctx: unknown;
	options: ImmediateCommandAckOptions;
}

interface EmitStatusAckOptions {
	ctx: unknown;
	key: string;
	message: string;
	startedMessage: string;
	clearDelayMs: number;
}

export function registerCommandWithImmediateAck<THost extends ImmediateCommandAckCommandRegistrar>(
	params: RegisterCommandWithImmediateAckOptions<THost>,
): unknown {
	const { host, commandName, commandDefinition } = params;
	const options = params.options ?? {};
	if (resolveImmediateCommandAckDelivery(host, options) === "message") {
		registerImmediateCommandAckRenderer(host);
	}
	type TCommand = RegisteredCommandFor<THost>;
	type TContext = CommandContextFor<TCommand>;
	const commandWithHandler = commandDefinition as ImmediateCommandAckCommandDefinition<TContext>;
	const acknowledgedCommandDefinition = Object.assign({}, commandDefinition, {
		handler(args: string, ctx: TContext): unknown {
			emitImmediateCommandAck({ host, commandName, ctx, options });
			return commandWithHandler.handler(args, ctx);
		},
	}) as TCommand;
	return host.registerCommand(commandName, acknowledgedCommandDefinition);
}

export function registerImmediateCommandAckRenderer<THost>(host: THost): void {
	registerImmediateCommandMessageRenderer(
		host,
		IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
		renderImmediateCommandAckMessage,
	);
}

export function registerImmediateCommandProgressRenderer<THost>(host: THost): void {
	registerImmediateCommandMessageRenderer(
		host,
		IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
		renderImmediateCommandProgressMessage,
	);
}

export function sendCommandProgressMessage<THost>(host: THost, message: string): boolean {
	if (!isRenderedMessageHost(host)) return false;
	registerImmediateCommandProgressRenderer(host);
	host.sendMessage({
		customType: IMMEDIATE_COMMAND_PROGRESS_MESSAGE_TYPE,
		content: defaultCommandProgressMessage(message),
		display: true,
	});
	return true;
}

export function sendCommandProgressOrNotify<
	THost,
	TLevel extends CommandProgressNotifyLevel = CommandProgressNotifyLevel,
>(options: SendCommandProgressOrNotifyOptions<THost, TLevel>): void {
	const { host, ctx, message } = options;
	const delivery = options.delivery ?? "message";
	if (delivery === "none") return;

	const hasUi = ctx.hasUI !== false;
	if (!hasUi) {
		if (options.shouldNotifyWhenNoUi !== false && shouldNotifyForDelivery(delivery)) {
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

function registerImmediateCommandMessageRenderer<THost>(
	host: THost,
	customType: string,
	renderer: ImmediateCommandAckMessageRenderer,
): void {
	if (!isRendererRegistrationHost(host)) return;
	host.registerMessageRenderer(customType, renderer);
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

function emitImmediateCommandAck<THost>(params: EmitImmediateCommandAckOptions<THost>): void {
	const { host, commandName, ctx, options } = params;
	if (!shouldAcknowledgeContext(ctx)) return;
	const delivery = resolveImmediateCommandAckDelivery(host, options);
	if (delivery === "none") return;
	if (!markAcknowledged(ctx, commandName)) return;
	const message = options.messageForCommand?.(commandName) ?? defaultCommandAckMessage(commandName);

	if (delivery === "message") {
		if (!isMessageSendHost(host)) return;
		host.sendMessage({
			customType: IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE,
			content: message,
			display: true,
		});
		return;
	}

	emitStatusAck({
		ctx,
		key: options.statusKey ?? IMMEDIATE_COMMAND_ACK_STATUS_KEY,
		message,
		startedMessage: defaultCommandAckStartedMessage(commandName),
		clearDelayMs: options.statusClearDelayMs ?? 3_000,
	});
}

function defaultCommandAckMessage(commandName: string): string {
	return `→ /${commandName} received; starting…`;
}

function defaultCommandAckStartedMessage(commandName: string): string {
	return `→ /${commandName} received; started`;
}

function defaultCommandProgressMessage(message: string): string {
	return message.startsWith("→ ") ? message : `→ ${message}`;
}

function resolveImmediateCommandAckDelivery<THost>(
	_host: THost,
	options: ImmediateCommandAckOptions,
): ImmediateCommandAckDelivery {
	// Acknowledgements are opt-in. Most commands already provide their own durable or live
	// progress surface, and a default footer status duplicates that state below the fold.
	// Callers that genuinely need a persistent transcript breadcrumb opt in with delivery:
	// "message". Callers that need a footer status opt in with delivery: "status".
	return options.delivery ?? "none";
}

function isRendererRegistrationHost(
	value: unknown,
): value is Pick<ImmediateCommandRenderedMessageHost, "registerMessageRenderer"> {
	return hasFunctionProperty(value, "registerMessageRenderer");
}

function isMessageSendHost(
	value: unknown,
): value is Pick<ImmediateCommandRenderedMessageHost, "sendMessage"> {
	return hasFunctionProperty(value, "sendMessage");
}

function isRenderedMessageHost(value: unknown): value is ImmediateCommandRenderedMessageHost {
	return isMessageSendHost(value) && isRendererRegistrationHost(value);
}

function shouldNotifyForDelivery(delivery: CommandProgressDelivery): boolean {
	return delivery === "notify" || delivery === "both" || delivery === "message";
}

function notifyCommandProgress<TLevel extends CommandProgressNotifyLevel>(
	ctx: ImmediateCommandNotifyContext<TLevel>,
	message: string,
	level: TLevel | undefined,
): void {
	withSafePiUi(() => {
		ctx.ui?.notify?.(message, level ?? "info");
	});
}

function shouldAcknowledgeContext(ctx: unknown): boolean {
	if (!hasRecordShape(ctx)) return true;
	return ctx.hasUI !== false;
}

function emitStatusAck(params: EmitStatusAckOptions): void {
	const { ctx, key, message, startedMessage, clearDelayMs } = params;
	if (!isImmediateCommandStatusContext(ctx)) return;
	const setStatusResult = withSafePiUiValue(() => ctx.ui?.setStatus);
	if (setStatusResult.type === "stale-context") return;
	const setStatus = setStatusResult.value;
	if (setStatus === undefined) return;
	const initialResult = withSafePiUi(() => {
		setStatus(key, message);
	});
	if (initialResult.type === "stale-context") return;
	unrefTimerScheduler.setTimeout(() => {
		withSafePiUi(() => {
			setStatus(key, startedMessage);
		});
	}, clearDelayMs);
}

function markAcknowledged(ctx: unknown, commandName: string): boolean {
	if (!isWeakMapKey(ctx)) return true;
	const existing = acknowledgedCommandsByContext.get(ctx);
	if (existing?.has(commandName)) return false;
	if (existing) {
		existing.add(commandName);
		return true;
	}
	acknowledgedCommandsByContext.set(ctx, new Set([commandName]));
	return true;
}

function isImmediateCommandStatusContext(value: unknown): value is ImmediateCommandStatusContext {
	if (!hasRecordShape(value)) return false;
	const ui = value.ui;
	if (ui === undefined) return true;
	if (!hasRecordShape(ui)) return false;
	return ui.setStatus === undefined || typeof ui.setStatus === "function";
}

function hasFunctionProperty<TName extends string>(
	value: unknown,
	name: TName,
): value is Record<TName, (...args: never[]) => unknown> {
	return hasRecordShape(value) && typeof value[name] === "function";
}

function hasRecordShape(value: unknown): value is Record<PropertyKey, unknown> {
	return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isWeakMapKey(value: unknown): value is WeakKey {
	return (typeof value === "object" && value !== null) || typeof value === "symbol";
}

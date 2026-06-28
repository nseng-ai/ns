import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { ExecOptions, ExecResult } from "@sdl/core/exec";
import { formatZodError } from "@sdl/core/primitives";
import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import { parseCliCommandArgs } from "@sdl/pi/commands/args";
import type { PiModelRegistryLike } from "@sdl/pi/models/call";
import { definePiSurfaceParity } from "@sdl/pi/parity/extension";
import type {
	PiCommandContext,
	PiCommandHost,
	PiCommandRegistration,
} from "@sdl/pi/runtime/command-host";
import { parseMachineEnvelopeDataWithFailureData } from "@sdl/pi/runtime/machine-envelope";
import { z } from "zod";

import { createPrPreviewChecksCommand } from "./preview-checks-command.ts";
import { createPrPreviewFeedbackCommand } from "./preview-feedback-command.ts";

export type { ExecOptions, ExecResult } from "@sdl/core/exec";

export const PR_PREVIEW_FEEDBACK_COMMAND_NAME = "pr:preview-feedback";
export const PR_PREVIEW_CHECKS_COMMAND_NAME = "pr:preview-checks";

const PREVIEW_FEEDBACK_STATUS_KEY = PR_PREVIEW_FEEDBACK_COMMAND_NAME;
const PREVIEW_CHECKS_STATUS_KEY = PR_PREVIEW_CHECKS_COMMAND_NAME;
const COMMAND_TIMEOUT_MS = 60_000;

export const prPreviewsExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: PR_PREVIEW_FEEDBACK_COMMAND_NAME,
		workflow: "Preview unresolved PR review threads in a read-only Pi modal overlay",
		parity: "WAIVED",
		fallback:
			"Use pr-address exec download-feedback --format json, then pr-address exec pr-review-threads --pr-number <n> --format json.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@local-pi-tools/pr-previews",
		sourceModule: "pr-previews",
		notes:
			"The browser modal is Pi-native TUI/session behavior; pr-address owns portable read-only feedback collection.",
	},
	{
		kind: "command",
		surface: PR_PREVIEW_CHECKS_COMMAND_NAME,
		workflow: "Preview GitHub PR checks in a read-only Pi modal overlay",
		parity: "WAIVED",
		fallback: "Use pr-address exec pr-checks [--pr-number <n>] --format json.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@local-pi-tools/pr-previews",
		sourceModule: "pr-previews",
		notes: "Pi owns modal/session UI; pr-address owns portable check collection.",
	},
] as const);

export interface ExtensionContext extends PiCommandContext {
	modelRegistry?: PiModelRegistryLike | undefined;
	ui: PiCommandContext["ui"] & {
		custom?<T>(
			factory: (
				tui: TUI,
				theme: Theme,
				keybindings: unknown,
				done: (value: T) => void,
			) => Component,
			options?: unknown,
		): Promise<T>;
	};
	isIdle?(): boolean;
}

export type RegisteredCommand = Omit<PiCommandRegistration, "handler"> & {
	handler(args: string, ctx: ExtensionContext): Promise<void> | void;
};

export interface ExtensionAPI {
	registerCommand(
		name: string,
		command: RegisteredCommand,
	): ReturnType<PiCommandHost["registerCommand"]>;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

type ParsedDownloadFeedbackArgs =
	| { type: "valid"; args: string[]; prNumber?: number | undefined }
	| { type: "invalid"; message: string };

export type CommandResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

export interface EnvelopeWithSchemaOptions<T> {
	label: string;
	result: ExecResult;
	schema: z.ZodType<T>;
	allowFailureData?: boolean | undefined;
}

export function registerPrPreviewsExtension(pi: ExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: PR_PREVIEW_FEEDBACK_COMMAND_NAME,
		commandDefinition: createPrPreviewFeedbackCommand(pi, {
			statusKey: PREVIEW_FEEDBACK_STATUS_KEY,
			commandTimeoutMs: COMMAND_TIMEOUT_MS,
			parseOptionalPrNumberArgs,
			parseEnvelopeWithSchema,
			notify,
		}),
	});
	registerCommandWithImmediateAck({
		host: pi,
		commandName: PR_PREVIEW_CHECKS_COMMAND_NAME,
		commandDefinition: createPrPreviewChecksCommand(pi, {
			statusKey: PREVIEW_CHECKS_STATUS_KEY,
			commandTimeoutMs: COMMAND_TIMEOUT_MS,
			parseOptionalPrNumberArgs,
			parseEnvelopeWithSchema,
			notify,
		}),
	});
}

export default registerPrPreviewsExtension;

function parseOptionalPrNumberArgs(rawArgs: string, usage: string): ParsedDownloadFeedbackArgs {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) return { type: "invalid", message: parsed.error };
	if (parsed.args.length === 0) return { type: "valid", args: [] };
	const prNumberToken = parsed.args[0] ?? "";
	if (parsed.args.length === 1 && isPositiveIntegerToken(prNumberToken)) {
		return { type: "valid", args: ["--pr-number", prNumberToken], prNumber: Number(prNumberToken) };
	}
	return { type: "invalid", message: usage };
}

function isPositiveIntegerToken(value: string): boolean {
	if (!/^\d+$/u.test(value)) return false;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0;
}

function parseEnvelopeWithSchema<T>(options: EnvelopeWithSchemaOptions<T>): CommandResult<T> {
	const parsed = parseMachineEnvelopeDataWithFailureData(options.result.stdout, {
		label: options.label,
		stdoutTail: { maxLines: 20, maxChars: 2000 },
		shouldAllowFailureData: options.allowFailureData,
	});
	if (parsed.type === "invalid") {
		return { type: "error", message: envelopeDetail(parsed, options.result) };
	}

	const schemaResult = options.schema.safeParse(parsed.data);
	if (!schemaResult.success) {
		return { type: "error", message: schemaError(options.label, schemaResult.error) };
	}
	return { type: "ok", value: schemaResult.data };
}

function envelopeDetail(parsed: { message: string }, result: ExecResult): string {
	const stderr = result.stderr.trim();
	return stderr === "" ? parsed.message : `${parsed.message}\n${stderr}`;
}

function schemaError(label: string, error: z.ZodError): string {
	return `${label} returned unexpected data: ${formatZodError(error, { rootPath: null })}`;
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	ctx.ui?.notify?.(message, level);
}

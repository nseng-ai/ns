import type { ClinkrUsageErrorExit } from "./exit.ts";
import { usageError } from "./exit.ts";

export type ConfirmationDefault = "yes" | "no";

export interface ConfirmationRequest {
	message: string;
	defaultAnswer: ConfirmationDefault;
}

export type ConfirmationPromptFormatter = (request: ConfirmationRequest, suffix: string) => string;

export type ConfirmationResult = { type: "confirmed" } | { type: "declined" } | { type: "aborted" };

/**
 * Semantic terminal interaction capabilities owned by Clinkr.
 *
 * Use this for interactive yes/no confirmation. Keep output rendering/status on
 * ClinkrIo, and keep full stdin payload reads on package-local stdin helpers;
 * do not drain full stdin streams for interactive confirmation.
 */
export interface ClinkrInteraction {
	confirm(request: ConfirmationRequest): Promise<ConfirmationResult>;
	isInteractive(): boolean;
}

export interface CreateClinkrInteractionOptions {
	stdin: () => Promise<string | null>;
	stderr: (text: string) => void;
	isInteractive?: () => boolean;
	injectedStdin?: () => Promise<string | null>;
	formatPrompt?: ConfirmationPromptFormatter;
}

export interface ResolveClinkrInteractionOptions extends CreateClinkrInteractionOptions {
	interaction?: ClinkrInteraction;
}

export function createClinkrInteraction(
	options: CreateClinkrInteractionOptions,
): ClinkrInteraction {
	return {
		confirm: (request) => confirmWithLineReader(options, request),
		isInteractive: () => options.isInteractive?.() ?? defaultIsInteractive(options.injectedStdin),
	};
}

function defaultIsInteractive(injectedStdin: (() => Promise<string | null>) | undefined): boolean {
	return injectedStdin !== undefined || process.stdin.isTTY === true;
}

export interface ConfirmInteractiveOrUsageErrorOptions {
	nonInteractive: { message: string; missingFlag: string; howToSupply: string };
	confirmation: ConfirmationRequest;
	beforePrompt?: () => void;
}

export interface ConfirmationUsageErrorData {
	readonly missingFlag: string;
	readonly howToSupply: string;
}

export type InteractiveConfirmationResult =
	| ConfirmationResult
	| ClinkrUsageErrorExit<ConfirmationUsageErrorData>;

export function requireInteractiveOrUsageError(
	interaction: ClinkrInteraction,
	opts: { message: string; missingFlag: string; howToSupply: string },
): ClinkrUsageErrorExit<ConfirmationUsageErrorData> | undefined {
	return interaction.isInteractive()
		? undefined
		: usageError(opts.message, { missingFlag: opts.missingFlag, howToSupply: opts.howToSupply });
}

export async function confirmInteractiveOrUsageError(
	interaction: ClinkrInteraction,
	options: ConfirmInteractiveOrUsageErrorOptions,
): Promise<InteractiveConfirmationResult> {
	const gate = requireInteractiveOrUsageError(interaction, options.nonInteractive);
	if (gate !== undefined) return gate;
	options.beforePrompt?.();
	return interaction.confirm(options.confirmation);
}

export function resolveClinkrInteraction(
	options: ResolveClinkrInteractionOptions,
): ClinkrInteraction {
	return options.interaction ?? createClinkrInteraction(options);
}

async function confirmWithLineReader(
	options: CreateClinkrInteractionOptions,
	request: ConfirmationRequest,
): Promise<ConfirmationResult> {
	writePrompt(options, request);
	for (;;) {
		const input = await options.stdin();
		if (input === null) return { type: "aborted" };
		const lines = input.split(/\r?\n/);
		for (const rawLine of lines) {
			const parsed = parseConfirmationLine(rawLine, request.defaultAnswer);
			if (parsed !== null) return parsed;
			options.stderr("Error: invalid input\n");
			writePrompt(options, request);
		}
	}
}

function writePrompt(
	options: Pick<CreateClinkrInteractionOptions, "stderr" | "formatPrompt">,
	request: ConfirmationRequest,
): void {
	const suffix = promptSuffix(request.defaultAnswer);
	options.stderr(options.formatPrompt?.(request, suffix) ?? `${request.message} ${suffix}: `);
}

function promptSuffix(defaultAnswer: ConfirmationDefault): string {
	return defaultAnswer === "yes" ? "[Y/n]" : "[y/N]";
}

function parseConfirmationLine(
	rawLine: string,
	defaultAnswer: ConfirmationDefault,
): ConfirmationResult | null {
	const value = rawLine.trim().toLowerCase();
	if (value === "y" || value === "yes") return { type: "confirmed" };
	if (value === "n" || value === "no") return { type: "declined" };
	if (value === "") return defaultAnswer === "yes" ? { type: "confirmed" } : { type: "declined" };
	return null;
}

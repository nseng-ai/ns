export type ConfirmationDefault = "yes" | "no";

export interface ConfirmationRequest {
	message: string;
	defaultAnswer: ConfirmationDefault;
}

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
}

export interface CreateClinkrInteractionOptions {
	stdin: () => Promise<string | null>;
	stderr: (text: string) => void;
}

export function createClinkrInteraction(
	options: CreateClinkrInteractionOptions,
): ClinkrInteraction {
	return {
		confirm: (request) => confirmWithLineReader(options, request),
	};
}

async function confirmWithLineReader(
	options: CreateClinkrInteractionOptions,
	request: ConfirmationRequest,
): Promise<ConfirmationResult> {
	writePrompt(options.stderr, request);
	for (;;) {
		const input = await options.stdin();
		if (input === null) return { type: "aborted" };
		const lines = input.split(/\r?\n/);
		for (const rawLine of lines) {
			const parsed = parseConfirmationLine(rawLine, request.defaultAnswer);
			if (parsed !== null) return parsed;
			options.stderr("Error: invalid input\n");
			writePrompt(options.stderr, request);
		}
	}
}

function writePrompt(stderr: (text: string) => void, request: ConfirmationRequest): void {
	stderr(`${request.message} ${promptSuffix(request.defaultAnswer)}: `);
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

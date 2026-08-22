import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

/**
 * Asserts the complete argv contract used for focused raw-text Pi model calls and returns the prompt.
 *
 * This test helper deliberately owns an independent literal copy of the contract so production
 * changes cannot make contract tests pass without an explicit test-side review.
 */
export function assertFocusedRawTextModelArgs(
	args: readonly string[],
	modelSelection: ModelSelection,
): string {
	const expectedPrefix = [
		"--provider",
		modelSelection.provider,
		"--model",
		modelSelection.modelId,
		"--thinking",
		modelSelection.thinking,
		"--no-session",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--no-tools",
		"--mode",
		"text",
		"--print",
	] as const;

	for (const [index, expected] of expectedPrefix.entries()) {
		const actual = args[index];
		if (actual !== expected) {
			throw new Error(
				`Focused raw-text Pi argv mismatch at index ${String(index)}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}. Expected ordered contract: ${JSON.stringify(expectedPrefix)} followed by the prompt.`,
			);
		}
	}
	if (args.length !== expectedPrefix.length + 1) {
		throw new Error(
			`Focused raw-text Pi argv must contain exactly ${String(expectedPrefix.length)} contract arguments followed by one prompt; received ${String(args.length)} arguments: ${JSON.stringify(args)}.`,
		);
	}

	const prompt = args.at(-1);
	if (prompt === undefined) {
		throw new Error("Focused raw-text Pi argv omitted the final prompt.");
	}
	return prompt;
}

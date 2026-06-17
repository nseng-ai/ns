import type { ClinkrFailureExit } from "@asdl/clinkr";
import { failure } from "@asdl/clinkr";

export type ConfirmationDefault = "yes" | "no";
export type ConfirmationResult = "yes" | "no" | ClinkrFailureExit;

export async function confirmFromStdin(options: {
	stdin: () => Promise<string>;
	stderr: (text: string) => void;
	prompt: string;
	defaultAnswer: ConfirmationDefault;
}): Promise<ConfirmationResult> {
	options.stderr(options.prompt);
	const input = await options.stdin();
	const lines = input.split(/\r?\n/);
	for (const rawLine of lines) {
		const value = rawLine.trim().toLowerCase();
		if (value === "y" || value === "yes") return "yes";
		if (value === "n" || value === "no") return "no";
		if (value === "") return options.defaultAnswer;
		options.stderr("Error: invalid input\n");
		options.stderr(options.prompt);
	}
	return failure("aborted", "Aborted!");
}

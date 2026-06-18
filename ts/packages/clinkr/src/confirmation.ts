import { failure, type ClinkrFailureExit } from "./exit.ts";

export type ConfirmationDefault = "yes" | "no";
export type ConfirmationAnswer = "yes" | "no";
export type ConfirmationResult = ConfirmationAnswer | ClinkrFailureExit;

export async function confirmFromStdin(options: {
	stdin: () => Promise<string | null>;
	stderr: (text: string) => void;
	prompt: string;
	defaultAnswer: ConfirmationDefault;
}): Promise<ConfirmationResult> {
	options.stderr(options.prompt);
	for (;;) {
		const input = await options.stdin();
		if (input === null) return failure("aborted", "Aborted!");
		const lines = input.split(/\r?\n/);
		for (const rawLine of lines) {
			const value = rawLine.trim().toLowerCase();
			if (value === "y" || value === "yes") return "yes";
			if (value === "n" || value === "no") return "no";
			if (value === "") return options.defaultAnswer;
			options.stderr("Error: invalid input\n");
			options.stderr(options.prompt);
		}
	}
}

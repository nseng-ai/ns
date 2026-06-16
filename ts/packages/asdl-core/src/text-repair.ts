const MAX_ATTEMPTS = 2;

export type TextGenerationResult = { ok: true; text: string } | { ok: false; error: string };

export type TextRepairProgressEvent =
	| { type: "attempt_started"; attempt: number; maxAttempts: number }
	| { type: "attempt_invalid"; attempt: number; maxAttempts: number; feedback: string };

export type ValidateGeneratedTextResult<T> = { ok: true; value: T } | { ok: false; feedback: string };

export type PrepareRepairedTextResult<T> =
	| { ok: true; value: T; source: "model" | "repaired_model"; feedback?: string }
	| { ok: false; error: string };

export interface PrepareRepairedTextOptions<T> {
	noun: string;
	initialPrompt: string;
	generate: (prompt: string) => Promise<TextGenerationResult>;
	validate: (text: string) => ValidateGeneratedTextResult<T>;
	buildRepairPrompt: (input: { initialPrompt: string; previousDraft: string; feedback: string }) => string;
	onProgress?: (event: TextRepairProgressEvent) => void;
}

export async function prepareRepairedText<T>(options: PrepareRepairedTextOptions<T>): Promise<PrepareRepairedTextResult<T>> {
	let prompt = options.initialPrompt;
	let firstFeedback: string | undefined;
	let latestFeedback = "";

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		options.onProgress?.({ type: "attempt_started", attempt, maxAttempts: MAX_ATTEMPTS });
		const generated = await options.generate(prompt);
		if (!generated.ok) return { ok: false, error: generated.error };

		const validation = options.validate(generated.text);
		if (validation.ok) {
			return {
				ok: true,
				value: validation.value,
				source: attempt === 1 ? "model" : "repaired_model",
				...(firstFeedback === undefined ? {} : { feedback: firstFeedback }),
			};
		}

		latestFeedback = validation.feedback;
		firstFeedback ??= validation.feedback;
		if (attempt < MAX_ATTEMPTS) {
			options.onProgress?.({ type: "attempt_invalid", attempt, maxAttempts: MAX_ATTEMPTS, feedback: validation.feedback });
			prompt = options.buildRepairPrompt({ initialPrompt: options.initialPrompt, previousDraft: generated.text, feedback: validation.feedback });
		}
	}

	return {
		ok: false,
		error: `Model produced an invalid ${options.noun} after ${MAX_ATTEMPTS} attempts.\n${latestFeedback}`,
	};
}

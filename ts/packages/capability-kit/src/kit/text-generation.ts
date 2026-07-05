import { DEFAULT_FAST_MODEL_REF } from "@nseng-ai/foundation/model-slug";

export interface TextGenerationRequest {
	modelRef: string;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: "minimal" | "low";
	operation?: string;
}

export interface TextGenerationUsage {
	inputTokens: number;
	outputTokens: number;
}

export type TextGenerationResult =
	| { ok: true; text: string; usage?: TextGenerationUsage }
	| { ok: false; error: string };

export interface TextGenerator {
	generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

export const DEFAULT_CHECKPOINT_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const DEFAULT_CHANGES_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const DEFAULT_SUBMIT_FAILURE_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const DEFAULT_PR_DESCRIPTION_MODEL_REF = "openai-codex/gpt-5.4-mini";
export const CHECKPOINT_MODEL_ENV = "NS_CHECKPOINT_MODEL";
export const LEGACY_CHECKPOINT_MODEL_ENV = "NS_DEV_CHECKPOINT_MODEL";
export const CHANGES_MODEL_ENV = "NS_CHANGES_MODEL";
export const LEGACY_CHANGES_MODEL_ENV = "PI_DRAFT_MODEL";
export const SUBMIT_FAILURE_MODEL_ENV = "NS_SUBMIT_FAILURE_MODEL";
export const PR_DESCRIPTION_MODEL_ENV = "NS_DEV_PR_DESCRIPTION_MODEL";

export const selectCheckpointModelRef = makeModelRefSelector(
	DEFAULT_CHECKPOINT_MODEL_REF,
	CHECKPOINT_MODEL_ENV,
	LEGACY_CHECKPOINT_MODEL_ENV,
);
export const selectChangesModelRef = makeModelRefSelector(
	DEFAULT_CHANGES_MODEL_REF,
	CHANGES_MODEL_ENV,
	LEGACY_CHANGES_MODEL_ENV,
);
export const selectSubmitFailureModelRef = makeModelRefSelector(
	DEFAULT_SUBMIT_FAILURE_MODEL_REF,
	SUBMIT_FAILURE_MODEL_ENV,
);
export const selectPrDescriptionModelRef = makeModelRefSelector(
	DEFAULT_PR_DESCRIPTION_MODEL_REF,
	PR_DESCRIPTION_MODEL_ENV,
);

function makeModelRefSelector(
	defaultRef: string,
	...envNames: string[]
): (env: Record<string, string | undefined>) => string {
	return (env) => firstEnvValue(env, ...envNames) ?? defaultRef;
}

function firstEnvValue(
	env: Record<string, string | undefined>,
	...envNames: string[]
): string | undefined {
	for (const envName of envNames) {
		const value = env[envName]?.trim();
		if (value !== undefined && value !== "") {
			return value;
		}
	}
	return undefined;
}

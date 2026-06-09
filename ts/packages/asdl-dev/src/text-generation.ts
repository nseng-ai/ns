import { DEFAULT_FAST_MODEL_REF } from "@asdl/plans";

export interface TextGenerationRequest {
	modelRef: string;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: "minimal" | "low";
	operation?: "checkpoint-message";
}

export type TextGenerationResult = { ok: true; text: string } | { ok: false; error: string };

export interface TextGenerationGateway {
	generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

export type TextGenerationBackend = "pi";

export interface TextGenerationConfig {
	backend: TextGenerationBackend;
	modelRef: string;
}

export const DEFAULT_TEXT_BACKEND: TextGenerationBackend = "pi";
export const DEFAULT_CHECKPOINT_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const TEXT_BACKEND_ENV = "ASDL_DEV_TEXT_BACKEND";
export const CHECKPOINT_MODEL_ENV = "ASDL_DEV_CHECKPOINT_MODEL";

export function selectCheckpointTextGenerationConfig(
	env: Record<string, string | undefined>,
): { ok: true; value: TextGenerationConfig } | { ok: false; error: string } {
	const backendValue = env[TEXT_BACKEND_ENV]?.trim() || DEFAULT_TEXT_BACKEND;
	if (!isTextGenerationBackend(backendValue)) {
		return {
			ok: false,
			error: `Invalid ${TEXT_BACKEND_ENV}=${JSON.stringify(backendValue)}. Valid values: pi.`,
		};
	}

	return {
		ok: true,
		value: {
			backend: backendValue,
			modelRef: env[CHECKPOINT_MODEL_ENV]?.trim() || DEFAULT_CHECKPOINT_MODEL_REF,
		},
	};
}

function isTextGenerationBackend(value: string): value is TextGenerationBackend {
	return value === "pi";
}

import { DEFAULT_FAST_MODEL_REF } from "@asdl/plans";

export interface TextGenerationRequest {
	modelRef: string;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: "minimal" | "low";
	operation?: "checkpoint-message" | "pr-description";
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
export const TEXT_BACKEND_ENV = "SDL_TEXT_BACKEND";
export const CHECKPOINT_MODEL_ENV = "SDL_CHECKPOINT_MODEL";
export const LEGACY_TEXT_BACKEND_ENV = "ASDL_DEV_TEXT_BACKEND";
export const LEGACY_CHECKPOINT_MODEL_ENV = "ASDL_DEV_CHECKPOINT_MODEL";

export function selectCheckpointTextGenerationConfig(
	env: Record<string, string | undefined>,
): { ok: true; value: TextGenerationConfig } | { ok: false; error: string } {
	const backendSelection = selectEnvValue(env, TEXT_BACKEND_ENV, LEGACY_TEXT_BACKEND_ENV);
	const backendValue = backendSelection.value || DEFAULT_TEXT_BACKEND;
	if (!isTextGenerationBackend(backendValue)) {
		return {
			ok: false,
			error: `Invalid ${backendSelection.sourceEnvName ?? TEXT_BACKEND_ENV}=${JSON.stringify(backendValue)}. Valid values: pi.`,
		};
	}

	const modelSelection = selectEnvValue(env, CHECKPOINT_MODEL_ENV, LEGACY_CHECKPOINT_MODEL_ENV);
	return {
		ok: true,
		value: {
			backend: backendValue,
			modelRef: modelSelection.value || DEFAULT_CHECKPOINT_MODEL_REF,
		},
	};
}

function selectEnvValue(
	env: Record<string, string | undefined>,
	primaryEnvName: string,
	legacyEnvName: string,
): { value: string; sourceEnvName?: string } {
	const primary = env[primaryEnvName]?.trim();
	if (primary !== undefined && primary !== "") {
		return { value: primary, sourceEnvName: primaryEnvName };
	}

	const legacy = env[legacyEnvName]?.trim();
	if (legacy !== undefined && legacy !== "") {
		return { value: legacy, sourceEnvName: legacyEnvName };
	}

	return { value: "" };
}

function isTextGenerationBackend(value: string): value is TextGenerationBackend {
	return value === "pi";
}

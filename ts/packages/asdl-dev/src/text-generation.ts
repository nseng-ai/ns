import { DEFAULT_FAST_MODEL_REF } from "@asdl/plans";
import { DEFAULT_TEXT_BACKEND, type TextGenerationBackend, type TextGenerationConfig } from "@asdl/sdl/text-generation";

export {
	DEFAULT_TEXT_BACKEND,
	type TextGenerationBackend,
	type TextGenerationConfig,
	type TextGenerationGateway,
	type TextGenerationRequest,
	type TextGenerationResult,
} from "@asdl/sdl/text-generation";

export const DEFAULT_PR_DESCRIPTION_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const TEXT_BACKEND_ENV = "ASDL_DEV_TEXT_BACKEND";
export const PR_DESCRIPTION_MODEL_ENV = "ASDL_DEV_PR_DESCRIPTION_MODEL";

export function selectPrDescriptionTextGenerationConfig(
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
			modelRef: env[PR_DESCRIPTION_MODEL_ENV]?.trim() || DEFAULT_PR_DESCRIPTION_MODEL_REF,
		},
	};
}

function isTextGenerationBackend(value: string): value is TextGenerationBackend {
	return value === "pi";
}

import { DEFAULT_FAST_MODEL_REF } from "@sdl/core/model-slug";

const SUBMIT_FAILURE_MODEL_ENV = "SDL_SUBMIT_FAILURE_MODEL";
const DEFAULT_SUBMIT_FAILURE_MODEL_REF = DEFAULT_FAST_MODEL_REF;

export function selectSubmitFailureModelRef(env: Record<string, string | undefined>): string {
	const v = env[SUBMIT_FAILURE_MODEL_ENV]?.trim();
	return v !== undefined && v !== "" ? v : DEFAULT_SUBMIT_FAILURE_MODEL_REF;
}

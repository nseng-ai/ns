import { DEFAULT_FAST_MODEL_REF } from "@asdl/plans";

export {
	type TextGenerationGateway,
	type TextGenerationRequest,
	type TextGenerationResult,
} from "@asdl/core/submit";

export type SubmitOutputListener = (stream: "stdout" | "stderr", text: string) => void;

export const DEFAULT_PR_DESCRIPTION_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const PR_DESCRIPTION_MODEL_ENV = "ASDL_DEV_PR_DESCRIPTION_MODEL";

export function selectPrDescriptionModelRef(env: Record<string, string | undefined>): string {
	const modelRef = env[PR_DESCRIPTION_MODEL_ENV]?.trim();
	if (modelRef !== undefined && modelRef !== "") {
		return modelRef;
	}
	return DEFAULT_PR_DESCRIPTION_MODEL_REF;
}

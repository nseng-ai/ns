export {
	DEFAULT_PR_DESCRIPTION_MODEL_REF,
	PR_DESCRIPTION_MODEL_ENV,
	selectPrDescriptionModelRef,
	type TextGenerationGateway,
	type TextGenerationRequest,
	type TextGenerationResult,
} from "@asdl/core/submit";

export type SubmitOutputListener = (stream: "stdout" | "stderr", text: string) => void;

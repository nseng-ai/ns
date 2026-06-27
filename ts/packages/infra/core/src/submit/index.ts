export {
	RealGithubPrGateway,
	type GithubPrDetails,
	type GithubPrGateway,
	type PrCommitMessage,
	type StablePatchIdForPrResult,
} from "./github-pr-gateway.ts";
export {
	orchestratePrDescription,
	type PrewrittenPrMetadata,
	type PrDescriptionOrchestrationOptions,
	type PrDescriptionOrchestrationResult,
} from "./pr-description-orchestration.ts";
export {
	appendGeneratedMarker,
	buildPrDescriptionUserPrompt,
	filterLockfileSections,
	formatManagedGeneratedRegion,
	DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT,
	GENERATED_BODY_MARKER,
	hashPrDescriptionPrompt,
	hasGeneratedMarker,
	isCommitMessagePrefillBody,
	MAX_DIFF_CHARS,
	parseManagedGeneratedRegion,
	parsePrDescriptionOutput,
	preparePrDescription,
	PR_DESCRIPTION_GENERATOR_VERSION,
	PR_DESCRIPTION_PROMPT_ENV,
	replaceOrInsertGeneratedRegion,
	resolvePrDescriptionGeneration,
	resolvePrDescriptionPrompt,
	REPO_PR_DESCRIPTION_PROMPT_PATH,
	truncateDiff,
	type PrDescriptionFingerprintMetadata,
	type PrDescriptionGenerationResolution,
	type PrDescriptionPromptContext,
	type PreparedPrDescription,
	type PromptSource,
} from "./pr-description.ts";
export { commandFailure, type CommandFailureOptions } from "./command-failure.ts";
export { formatItemCount } from "./format.ts";
export { err, ok, type ErrorInfo, type GatewayResult } from "./result.ts";
export {
	DEFAULT_PR_DESCRIPTION_MODEL_REF,
	PR_DESCRIPTION_MODEL_ENV,
	selectPrDescriptionModelRef,
	type TextGenerationRequest,
	type TextGenerationResult,
	type TextGenerationUsage,
	type TextGenerator,
} from "./text-generation.ts";

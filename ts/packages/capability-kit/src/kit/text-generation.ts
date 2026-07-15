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

/** @deprecated Pass resolved model references explicitly. */
export const CHECKPOINT_MODEL_ENV = "NS_CHECKPOINT_MODEL";
export const LEGACY_CHECKPOINT_MODEL_ENV = "NS_DEV_CHECKPOINT_MODEL";
export const CHANGES_MODEL_ENV = "NS_CHANGES_MODEL";
export const LEGACY_CHANGES_MODEL_ENV = "PI_DRAFT_MODEL";
export const SUBMIT_FAILURE_MODEL_ENV = "NS_SUBMIT_FAILURE_MODEL";
export const PR_DESCRIPTION_MODEL_ENV = "NS_DEV_PR_DESCRIPTION_MODEL";
export function selectCheckpointModelRef(): string { return DEFAULT_CHECKPOINT_MODEL_REF; }
export function selectChangesModelRef(): string { return DEFAULT_CHANGES_MODEL_REF; }
export function selectSubmitFailureModelRef(): string { return DEFAULT_SUBMIT_FAILURE_MODEL_REF; }
export function selectPrDescriptionModelRef(): string { return DEFAULT_PR_DESCRIPTION_MODEL_REF; }

export const DEFAULT_CHECKPOINT_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const DEFAULT_CHANGES_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const DEFAULT_SUBMIT_FAILURE_MODEL_REF = DEFAULT_FAST_MODEL_REF;
export const DEFAULT_PR_DESCRIPTION_MODEL_REF = DEFAULT_FAST_MODEL_REF;

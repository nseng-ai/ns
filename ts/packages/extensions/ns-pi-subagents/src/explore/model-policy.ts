import { providerMatchesModelProviderFamily } from "@nseng-ai/foundation/model-slug";
import type { ModelInfo } from "@nseng-ai/pi/runtime/types";

import {
	ANTHROPIC_PROVIDER_ID,
	EXPLORER_CHEAP_MODEL_SHORTHAND,
	EXPLORER_CHEAP_QUALIFIED_MODEL,
} from "./contract.ts";

/**
 * How an explorer child should be launched. "cheap" carries a Pi --model pattern for a
 * Haiku-class model; "inherit" omits the model so the child inherits the parent
 * session's provider and model (no cheap option was safely available).
 */
export type ExplorerLaunchPlan = { kind: "cheap"; model: string } | { kind: "inherit" };
export type IsProviderAuthConfigured = (providerId: string) => boolean;

export interface ResolveExplorerLaunchPlanInput {
	parentModel?: ModelInfo;
	isProviderAuthConfigured: IsProviderAuthConfigured;
}

export function resolveExplorerLaunchPlan(
	input: ResolveExplorerLaunchPlanInput,
): ExplorerLaunchPlan {
	if (
		input.parentModel !== undefined &&
		providerMatchesModelProviderFamily(input.parentModel.provider, ANTHROPIC_PROVIDER_ID)
	) {
		return { kind: "cheap", model: EXPLORER_CHEAP_MODEL_SHORTHAND };
	}
	if (input.isProviderAuthConfigured(ANTHROPIC_PROVIDER_ID)) {
		return { kind: "cheap", model: EXPLORER_CHEAP_QUALIFIED_MODEL };
	}
	return { kind: "inherit" };
}

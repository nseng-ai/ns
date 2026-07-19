import {
	type ModelProviderFamily,
	type ModelSelection,
	providerMatchesModelProviderFamily,
} from "@nseng-ai/foundation/model-slug";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { SubagentAgentDescriptor } from "./registry.ts";

export const ANTHROPIC_PROVIDER_ID = "anthropic";
export const CHEAP_MODEL_IDS = {
	anthropic: "claude-haiku-4-5",
	google: "gemini-3.5-flash",
	openai: "gpt-5.6-luna",
} as const satisfies Record<ModelProviderFamily, string>;
export const DEFAULT_CHEAP_MODEL_SELECTION: ModelSelection = {
	provider: ANTHROPIC_PROVIDER_ID,
	modelId: CHEAP_MODEL_IDS.anthropic,
};

export type IsProviderAuthConfigured = (providerId: string) => boolean;

/**
 * How an explorer child should be launched. "cheap" carries a concrete
 * provider-local selection when one is known; "inherit" omits the selection
 * when no same-provider cheap option is safely available.
 */
export type ExplorerLaunchPlan =
	| { kind: "cheap"; modelSelection: ModelSelection }
	| { kind: "inherit" };

export interface ModelSelectionAuthContext {
	parentModelSelection?: ModelSelection;
	isProviderAuthConfigured: IsProviderAuthConfigured;
}

export type ResolveExplorerLaunchPlanInput = ModelSelectionAuthContext;

export function resolveExplorerLaunchPlan(
	input: ResolveExplorerLaunchPlanInput,
): ExplorerLaunchPlan {
	if (input.parentModelSelection !== undefined) {
		const modelSelection = resolveSameProviderCheapModel(input.parentModelSelection);
		return modelSelection === undefined ? { kind: "inherit" } : { kind: "cheap", modelSelection };
	}
	if (input.isProviderAuthConfigured(ANTHROPIC_PROVIDER_ID)) {
		return { kind: "cheap", modelSelection: DEFAULT_CHEAP_MODEL_SELECTION };
	}
	return { kind: "inherit" };
}

/**
 * Resolve the approved cheap model within the parent's concrete provider.
 * Undefined means the child must inherit; this helper never changes providers.
 */
export function resolveSameProviderCheapModel(
	parentModelSelection: ModelSelection | undefined,
): ModelSelection | undefined {
	if (parentModelSelection === undefined) return undefined;
	for (const family of ["anthropic", "google", "openai"] as const) {
		if (providerMatchesModelProviderFamily(parentModelSelection.provider, family)) {
			return {
				provider: parentModelSelection.provider,
				modelId: CHEAP_MODEL_IDS[family],
			};
		}
	}
	return undefined;
}

export interface ResolveDescriptorModelInput extends ModelSelectionAuthContext {
	policy: SubagentAgentDescriptor["modelPolicy"];
}

/**
 * Model selected by the descriptor's model policy; undefined inherits the
 * parent session's model.
 */
export function resolveDescriptorModel(
	input: ResolveDescriptorModelInput,
): ModelSelection | undefined {
	switch (input.policy) {
		case "inherit":
			return undefined;
		case "cheap-or-inherit": {
			const plan = resolveExplorerLaunchPlan({
				...optionalEntry("parentModelSelection", input.parentModelSelection),
				isProviderAuthConfigured: input.isProviderAuthConfigured,
			});
			return plan.kind === "inherit" ? undefined : plan.modelSelection;
		}
		default: {
			const exhaustive: never = input.policy;
			return exhaustive;
		}
	}
}

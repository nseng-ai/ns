import {
	type ModelProviderFamily,
	providerMatchesModelProviderFamily,
} from "@nseng-ai/foundation/model-slug";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ModelInfo } from "@nseng-ai/pi/runtime/types";

import type { SubagentAgentDescriptor } from "./registry.ts";

export const ANTHROPIC_PROVIDER_ID = "anthropic";
export const CHEAP_MODEL_IDS = {
	anthropic: "claude-haiku-4-5",
	google: "gemini-3.5-flash",
	openai: "gpt-5.6-luna",
} as const satisfies Record<ModelProviderFamily, string>;
export const DEFAULT_CHEAP_QUALIFIED_MODEL = `${ANTHROPIC_PROVIDER_ID}/${CHEAP_MODEL_IDS.anthropic}`;

export type IsProviderAuthConfigured = (providerId: string) => boolean;

/**
 * How an explorer child should be launched. "cheap" carries a Pi --model
 * pattern from the parent's provider when one is known; "inherit" omits the
 * model when no same-provider cheap option is safely available.
 */
export type ExplorerLaunchPlan = { kind: "cheap"; model: string } | { kind: "inherit" };

export interface ModelSelectionAuthContext {
	parentModel?: ModelInfo;
	isProviderAuthConfigured: IsProviderAuthConfigured;
}

export type ResolveExplorerLaunchPlanInput = ModelSelectionAuthContext;

export function resolveExplorerLaunchPlan(
	input: ResolveExplorerLaunchPlanInput,
): ExplorerLaunchPlan {
	if (input.parentModel !== undefined) {
		const model = resolveSameProviderCheapModel(input.parentModel);
		return model === undefined ? { kind: "inherit" } : { kind: "cheap", model };
	}
	if (input.isProviderAuthConfigured(ANTHROPIC_PROVIDER_ID)) {
		return { kind: "cheap", model: DEFAULT_CHEAP_QUALIFIED_MODEL };
	}
	return { kind: "inherit" };
}

/**
 * Resolve the approved cheap model within the parent's concrete provider.
 * Undefined means the child must inherit; this helper never changes providers.
 */
export function resolveSameProviderCheapModel(
	parentModel: ModelInfo | undefined,
): string | undefined {
	if (parentModel === undefined) return undefined;
	for (const family of ["anthropic", "google", "openai"] as const) {
		if (providerMatchesModelProviderFamily(parentModel.provider, family)) {
			return `${parentModel.provider}/${CHEAP_MODEL_IDS[family]}`;
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
export function resolveDescriptorModel(input: ResolveDescriptorModelInput): string | undefined {
	switch (input.policy) {
		case "inherit":
			return undefined;
		case "cheap-or-inherit": {
			const plan = resolveExplorerLaunchPlan({
				...optionalEntry("parentModel", input.parentModel),
				isProviderAuthConfigured: input.isProviderAuthConfigured,
			});
			return plan.kind === "inherit" ? undefined : plan.model;
		}
		default: {
			const exhaustive: never = input.policy;
			return exhaustive;
		}
	}
}

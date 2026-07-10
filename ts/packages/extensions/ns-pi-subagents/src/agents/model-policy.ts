import { providerMatchesModelProviderFamily } from "@nseng-ai/foundation/model-slug";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ModelInfo } from "@nseng-ai/pi/runtime/types";

import type { SubagentAgentDescriptor } from "./registry.ts";

export const ANTHROPIC_PROVIDER_ID = "anthropic";
export const EXPLORER_CHEAP_MODEL_ID = "claude-haiku-4-5";
export const EXPLORER_CHEAP_MODEL_SHORTHAND = "haiku";
export const EXPLORER_CHEAP_QUALIFIED_MODEL = `${ANTHROPIC_PROVIDER_ID}/${EXPLORER_CHEAP_MODEL_ID}`;

export type IsProviderAuthConfigured = (providerId: string) => boolean;

/**
 * How an explorer child should be launched. "cheap" carries a Pi --model
 * pattern; "inherit" omits the model so the child inherits the parent
 * session's provider and model (no cheap option was safely available).
 */
export type ExplorerLaunchPlan = { kind: "cheap"; model: string } | { kind: "inherit" };

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

export interface ResolveDescriptorModelInput {
	policy: SubagentAgentDescriptor["modelPolicy"];
	parentModel?: ModelInfo;
	isProviderAuthConfigured: IsProviderAuthConfigured;
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

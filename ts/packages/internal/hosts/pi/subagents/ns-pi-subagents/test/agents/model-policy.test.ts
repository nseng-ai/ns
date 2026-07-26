import { describe, expect, test } from "vitest";

import {
	ANTHROPIC_PROVIDER_ID,
	CHEAP_MODEL_IDS,
	DEFAULT_CHEAP_MODEL_SELECTION,
	resolveDescriptorModel,
	resolveExplorerLaunchPlan,
	resolveSameProviderCheapModel,
} from "../../src/agents/model-policy.ts";

function recordingAuthProbe(configured: boolean): {
	isProviderAuthConfigured: (providerId: string) => boolean;
	probedProviders: string[];
} {
	const probedProviders: string[] = [];
	return {
		probedProviders,
		isProviderAuthConfigured: (providerId) => {
			probedProviders.push(providerId);
			return configured;
		},
	};
}

describe("resolveExplorerLaunchPlan", () => {
	test("derives the Anthropic fallback from provider and model IDs", () => {
		expect(DEFAULT_CHEAP_MODEL_SELECTION).toEqual({
			provider: ANTHROPIC_PROVIDER_ID,
			modelId: CHEAP_MODEL_IDS.anthropic,
			thinking: "minimal",
		});
	});

	test.each([
		{
			parentModelSelection: {
				provider: "anthropic",
				modelId: "claude-opus-4-1",
				thinking: "minimal",
			},
			expectedModelSelection: "anthropic/claude-haiku-4-5",
		},
		{
			parentModelSelection: { provider: "openai", modelId: "gpt-5.6-sol", thinking: "minimal" },
			expectedModelSelection: "openai/gpt-5.6-luna",
		},
		{
			parentModelSelection: {
				provider: "openai-codex",
				modelId: "gpt-5.6-sol",
				thinking: "minimal",
			},
			expectedModelSelection: "openai-codex/gpt-5.6-luna",
		},
		{
			parentModelSelection: {
				provider: "google",
				modelId: "gemini-3.1-pro-preview",
				thinking: "minimal",
			},
			expectedModelSelection: "google/gemini-3.5-flash",
		},
		{
			parentModelSelection: {
				provider: "gemini",
				modelId: "gemini-3.1-pro-preview",
				thinking: "minimal",
			},
			expectedModelSelection: "gemini/gemini-3.5-flash",
		},
	] as const)(
		"uses $expectedModelSelection for parent $parentModelSelection.provider",
		({ parentModelSelection, expectedModelSelection }) => {
			const auth = recordingAuthProbe(true);
			const plan = resolveExplorerLaunchPlan({
				parentModelSelection,
				isProviderAuthConfigured: auth.isProviderAuthConfigured,
			});

			const [provider, modelId] = expectedModelSelection.split("/");
			expect(plan).toEqual({
				kind: "cheap",
				modelSelection: { provider, modelId, thinking: "minimal" as const },
			});
			expect(auth.probedProviders).toEqual([]);
		},
	);

	test("inherits from an unrecognized parent provider instead of switching providers", () => {
		const auth = recordingAuthProbe(true);
		const plan = resolveExplorerLaunchPlan({
			parentModelSelection: { provider: "acme", modelId: "acme-pro", thinking: "minimal" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "inherit" });
		expect(auth.probedProviders).toEqual([]);
	});

	test("uses the qualified haiku model when no parent model is known but auth exists", () => {
		const auth = recordingAuthProbe(true);
		const plan = resolveExplorerLaunchPlan({
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "cheap", modelSelection: DEFAULT_CHEAP_MODEL_SELECTION });
		expect(auth.probedProviders).toEqual(["anthropic"]);
	});

	test("inherits when no parent model is known and no Anthropic auth exists", () => {
		const auth = recordingAuthProbe(false);
		const plan = resolveExplorerLaunchPlan({
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "inherit" });
		expect(auth.probedProviders).toEqual(["anthropic"]);
	});
});

describe("resolveSameProviderCheapModel", () => {
	test.each([
		["anthropic", "anthropic/claude-haiku-4-5"],
		["openai", "openai/gpt-5.6-luna"],
		["openai-codex", "openai-codex/gpt-5.6-luna"],
		["google", "google/gemini-3.5-flash"],
		["gemini", "gemini/gemini-3.5-flash"],
	])("retains concrete provider %s", (provider, expected) => {
		const [expectedProvider, modelId] = expected.split("/");
		expect(
			resolveSameProviderCheapModel({ provider, modelId: "parent-model", thinking: "high" }),
		).toEqual({
			provider: expectedProvider,
			modelId,
			thinking: "high",
		});
	});

	test("inherits for an unknown or absent parent", () => {
		expect(
			resolveSameProviderCheapModel({ provider: "acme", modelId: "acme-pro", thinking: "minimal" }),
		).toBeUndefined();
		expect(resolveSameProviderCheapModel(undefined)).toBeUndefined();
	});
});

describe("resolveDescriptorModel", () => {
	test("inherit policy never selects a model or probes auth", () => {
		const auth = recordingAuthProbe(true);
		const modelSelection = resolveDescriptorModel({
			policy: "inherit",
			parentModelSelection: { provider: "openai-codex", modelId: "gpt-5", thinking: "minimal" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(modelSelection).toBeUndefined();
		expect(auth.probedProviders).toEqual([]);
	});

	test("cheap-or-inherit resolves through the explorer launch plan", () => {
		const auth = recordingAuthProbe(false);
		const modelSelection = resolveDescriptorModel({
			policy: "cheap-or-inherit",
			parentModelSelection: {
				provider: "anthropic",
				modelId: "claude-opus-4-1",
				thinking: "minimal",
			},
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(modelSelection).toEqual({
			provider: "anthropic",
			modelId: "claude-haiku-4-5",
			thinking: "minimal",
		});
	});

	test("cheap-or-inherit inherits when no same-provider cheap option is safe", () => {
		const auth = recordingAuthProbe(true);
		const modelSelection = resolveDescriptorModel({
			policy: "cheap-or-inherit",
			parentModelSelection: { provider: "acme", modelId: "acme-pro", thinking: "minimal" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(modelSelection).toBeUndefined();
		expect(auth.probedProviders).toEqual([]);
	});
});

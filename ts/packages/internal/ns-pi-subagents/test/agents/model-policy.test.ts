import { describe, expect, test } from "vitest";

import {
	ANTHROPIC_PROVIDER_ID,
	EXPLORER_CHEAP_MODEL_IDS,
	EXPLORER_CHEAP_QUALIFIED_MODEL,
	resolveDescriptorModel,
	resolveExplorerLaunchPlan,
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
		expect(EXPLORER_CHEAP_QUALIFIED_MODEL).toBe(
			`${ANTHROPIC_PROVIDER_ID}/${EXPLORER_CHEAP_MODEL_IDS.anthropic}`,
		);
	});

	test.each([
		{
			parentModel: { provider: "anthropic", id: "claude-opus-4-1" },
			expectedModel: "anthropic/claude-haiku-4-5",
		},
		{
			parentModel: { provider: "openai", id: "gpt-5.6-sol" },
			expectedModel: "openai/gpt-5.6-luna",
		},
		{
			parentModel: { provider: "openai-codex", id: "gpt-5.6-sol" },
			expectedModel: "openai-codex/gpt-5.6-luna",
		},
		{
			parentModel: { provider: "google", id: "gemini-3.1-pro-preview" },
			expectedModel: "google/gemini-3.5-flash",
		},
		{
			parentModel: { provider: "gemini", id: "gemini-3.1-pro-preview" },
			expectedModel: "gemini/gemini-3.5-flash",
		},
	])("uses $expectedModel for parent $parentModel.provider", ({ parentModel, expectedModel }) => {
		const auth = recordingAuthProbe(true);
		const plan = resolveExplorerLaunchPlan({
			parentModel,
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "cheap", model: expectedModel });
		expect(auth.probedProviders).toEqual([]);
	});

	test("inherits from an unrecognized parent provider instead of switching providers", () => {
		const auth = recordingAuthProbe(true);
		const plan = resolveExplorerLaunchPlan({
			parentModel: { provider: "acme", id: "acme-pro" },
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

		expect(plan).toEqual({ kind: "cheap", model: EXPLORER_CHEAP_QUALIFIED_MODEL });
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

describe("resolveDescriptorModel", () => {
	test("inherit policy never selects a model or probes auth", () => {
		const auth = recordingAuthProbe(true);
		const model = resolveDescriptorModel({
			policy: "inherit",
			parentModel: { provider: "openai-codex", id: "gpt-5" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(model).toBeUndefined();
		expect(auth.probedProviders).toEqual([]);
	});

	test("cheap-or-inherit resolves through the explorer launch plan", () => {
		const auth = recordingAuthProbe(false);
		const model = resolveDescriptorModel({
			policy: "cheap-or-inherit",
			parentModel: { provider: "anthropic", id: "claude-opus-4-1" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(model).toBe("anthropic/claude-haiku-4-5");
	});

	test("cheap-or-inherit inherits when no same-provider cheap option is safe", () => {
		const auth = recordingAuthProbe(true);
		const model = resolveDescriptorModel({
			policy: "cheap-or-inherit",
			parentModel: { provider: "acme", id: "acme-pro" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(model).toBeUndefined();
		expect(auth.probedProviders).toEqual([]);
	});
});

import { describe, expect, test } from "vitest";

import {
	EXPLORER_CHEAP_MODEL_SHORTHAND,
	EXPLORER_CHEAP_QUALIFIED_MODEL,
} from "../../src/explore/contract.ts";
import { resolveExplorerLaunchPlan } from "../../src/explore/model-policy.ts";

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
	test("uses the haiku shorthand without probing auth when the parent is Anthropic", () => {
		const auth = recordingAuthProbe(false);
		const plan = resolveExplorerLaunchPlan({
			parentModel: { provider: "anthropic", id: "claude-opus-4-1" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "cheap", model: EXPLORER_CHEAP_MODEL_SHORTHAND });
		expect(auth.probedProviders).toEqual([]);
	});

	test("uses the qualified haiku model for a non-Anthropic parent with Anthropic auth", () => {
		const auth = recordingAuthProbe(true);
		const plan = resolveExplorerLaunchPlan({
			parentModel: { provider: "openai-codex", id: "gpt-5" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "cheap", model: EXPLORER_CHEAP_QUALIFIED_MODEL });
		expect(auth.probedProviders).toEqual(["anthropic"]);
	});

	test("inherits the parent model for a non-Anthropic parent without Anthropic auth", () => {
		const auth = recordingAuthProbe(false);
		const plan = resolveExplorerLaunchPlan({
			parentModel: { provider: "google", id: "gemini-2.5-pro" },
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "inherit" });
		expect(auth.probedProviders).toEqual(["anthropic"]);
	});

	test("uses the qualified haiku model when no parent model is known but auth exists", () => {
		const auth = recordingAuthProbe(true);
		const plan = resolveExplorerLaunchPlan({
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "cheap", model: EXPLORER_CHEAP_QUALIFIED_MODEL });
	});

	test("inherits when no parent model is known and no Anthropic auth exists", () => {
		const auth = recordingAuthProbe(false);
		const plan = resolveExplorerLaunchPlan({
			isProviderAuthConfigured: auth.isProviderAuthConfigured,
		});

		expect(plan).toEqual({ kind: "inherit" });
	});
});

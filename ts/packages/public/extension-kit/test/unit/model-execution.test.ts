import { describe, expect, test, vi } from "vitest";

import {
	createExplicitModelExecutionSelection,
	createModelExecutionCoordinator,
	modelExecutionSelectionFromResolvedOperation,
	type ModelExecutionSelection,
} from "@nseng-ai/extension-kit/model-execution";

const BUILT_IN_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
const FALLBACK_WARNING =
	"No configured fast model profile was found; using built-in openai-codex/gpt-5.6-luna with minimal thinking.";

function policySelection(profileSource: "built-in" | "project"): ModelExecutionSelection {
	return modelExecutionSelectionFromResolvedOperation({
		operationId: "slug",
		profile: "fast",
		selection: BUILT_IN_SELECTION,
		profileSource,
		operationSource: "default",
	});
}

describe("model execution", () => {
	test("preserves resolved model selection and provenance", () => {
		expect(policySelection("built-in")).toEqual({
			modelSelection: BUILT_IN_SELECTION,
			provenance: {
				type: "model-policy",
				operationId: "slug",
				profile: "fast",
				profileSource: "built-in",
				operationSource: "default",
			},
		});
	});

	test("constructs explicit selections without policy provenance", () => {
		expect(createExplicitModelExecutionSelection(BUILT_IN_SELECTION)).toEqual({
			modelSelection: BUILT_IN_SELECTION,
			provenance: { type: "explicit" },
		});
	});

	test("warns synchronously once before built-in execution", () => {
		const events: string[] = [];
		const coordinator = createModelExecutionCoordinator({
			warn: (message) => events.push(`warning: ${message}`),
		});
		const selection = policySelection("built-in");

		coordinator.beforeExecution(selection);
		events.push("execution");
		coordinator.beforeExecution(selection);

		expect(events).toEqual([`warning: ${FALLBACK_WARNING}`, "execution"]);
	});

	test("suppresses project and explicit selections", () => {
		const warn = vi.fn();
		const coordinator = createModelExecutionCoordinator({ warn });

		coordinator.beforeExecution(policySelection("project"));
		coordinator.beforeExecution(createExplicitModelExecutionSelection(BUILT_IN_SELECTION));

		expect(warn).not.toHaveBeenCalled();
	});
});

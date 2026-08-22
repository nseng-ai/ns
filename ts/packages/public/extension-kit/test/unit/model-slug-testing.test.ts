import { describe, expect, test } from "vitest";

import { assertFocusedRawTextModelArgs } from "@nseng-ai/extension-kit/model-slug/testing";

const MODEL_SELECTION = {
	provider: "acme",
	modelId: "focused-1",
	thinking: "minimal" as const,
};
const VALID_ARGS: string[] = [
	"--provider",
	"acme",
	"--model",
	"focused-1",
	"--thinking",
	"minimal",
	"--no-session",
	"--no-extensions",
	"--no-skills",
	"--no-prompt-templates",
	"--no-context-files",
	"--no-tools",
	"--mode",
	"text",
	"--print",
	"model prompt",
];

describe("assertFocusedRawTextModelArgs", () => {
	test("accepts the exact ordered contract and returns the final prompt", () => {
		expect(assertFocusedRawTextModelArgs(VALID_ARGS, MODEL_SELECTION)).toBe("model prompt");
	});

	test("reports a missing isolation flag at its contract position", () => {
		const args = VALID_ARGS.filter((value) => value !== "--no-skills");
		expect(() => assertFocusedRawTextModelArgs(args, MODEL_SELECTION)).toThrow(
			'Focused raw-text Pi argv mismatch at index 8: expected "--no-skills", received "--no-prompt-templates"',
		);
	});

	test("reports a wrong argument order with its index and expected value", () => {
		const args = [...VALID_ARGS];
		args.splice(0, 4, "--model", "focused-1", "--provider", "acme");
		expect(() => assertFocusedRawTextModelArgs(args, MODEL_SELECTION)).toThrow(
			'argv mismatch at index 0: expected "--provider", received "--model". Expected ordered contract:',
		);
	});

	test("reports a wrong argument value with its index and expected value", () => {
		const args = [...VALID_ARGS];
		args[1] = "other-provider";
		expect(() => assertFocusedRawTextModelArgs(args, MODEL_SELECTION)).toThrow(
			'argv mismatch at index 1: expected "acme", received "other-provider". Expected ordered contract:',
		);
	});
});

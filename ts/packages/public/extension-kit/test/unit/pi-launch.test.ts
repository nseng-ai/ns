import {
	buildPiLaunchArgs,
	buildPiLaunchCommand,
	buildPiModelThinkingArgs,
	getPiLaunchOptions,
} from "@nseng-ai/extension-kit/pi-launch";
import { describe, expect, test } from "vitest";

describe("buildPiLaunchArgs", () => {
	test("omits model and thinking flags when unset", () => {
		expect(buildPiLaunchArgs("prompt.md", { thinkingLevel: "off" })).toEqual(["pi", "prompt.md"]);
	});

	test("includes provider and model when a model is selected", () => {
		expect(
			buildPiLaunchArgs("prompt.md", {
				model: { provider: "anthropic", id: "claude-sonnet" },
				thinkingLevel: "off",
			}),
		).toEqual(["pi", "--provider", "anthropic", "--model", "claude-sonnet", "prompt.md"]);
	});

	test("includes thinking flag for non-off levels", () => {
		expect(buildPiLaunchArgs("prompt.md", { thinkingLevel: "high" })).toEqual([
			"pi",
			"--thinking",
			"high",
			"prompt.md",
		]);
	});

	test("builds a prompt-free launch without manufacturing an empty argument", () => {
		expect(
			buildPiLaunchArgs(undefined, {
				model: { provider: "anthropic", id: "claude-sonnet" },
				thinkingLevel: "high",
			}),
		).toEqual(["pi", "--provider", "anthropic", "--model", "claude-sonnet", "--thinking", "high"]);
		expect(buildPiLaunchArgs(undefined, { thinkingLevel: "off" })).toEqual(["pi"]);
	});
});

describe("buildPiModelThinkingArgs", () => {
	test("builds the shared model and thinking flags", () => {
		expect(
			buildPiModelThinkingArgs({
				model: { provider: "anthropic", id: "claude-sonnet" },
				thinkingLevel: "high",
			}),
		).toEqual(["--provider", "anthropic", "--model", "claude-sonnet", "--thinking", "high"]);
		expect(buildPiModelThinkingArgs({ thinkingLevel: "medium" })).toEqual(["--thinking", "medium"]);
		expect(
			buildPiModelThinkingArgs({
				model: { provider: "openai", id: "gpt-5" },
				thinkingLevel: "off",
			}),
		).toEqual(["--provider", "openai", "--model", "gpt-5"]);
	});
});

describe("buildPiLaunchCommand", () => {
	test("shell-quotes arguments that need it", () => {
		expect(
			buildPiLaunchCommand("run the plan", {
				model: { provider: "anthropic", id: "claude-sonnet" },
				thinkingLevel: "medium",
			}),
		).toBe("pi --provider anthropic --model claude-sonnet --thinking medium 'run the plan'");
	});

	test("keeps plain arguments unquoted with thinking off", () => {
		expect(buildPiLaunchCommand("prompt.md", { thinkingLevel: "off" })).toBe("pi prompt.md");
	});
});

describe("getPiLaunchOptions", () => {
	test("omits the model key when the context has no model", () => {
		const options = getPiLaunchOptions({ getThinkingLevel: () => "low" }, {});
		expect(options).toEqual({ thinkingLevel: "low" });
		expect("model" in options).toBe(false);
	});

	test("carries the context model through", () => {
		expect(
			getPiLaunchOptions(
				{ getThinkingLevel: () => "off" },
				{ model: { provider: "openai", id: "gpt-5" } },
			),
		).toEqual({ model: { provider: "openai", id: "gpt-5" }, thinkingLevel: "off" });
	});
});

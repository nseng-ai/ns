import {
	buildPiLaunchArgs,
	buildPiLaunchCommand,
	getPiLaunchOptions,
} from "@nseng-ai/capability-kit/pi-launch";
import { buildTrackedBranchPayloadLaunchCommand } from "@nseng-ai/capability-kit/tracked-branch-payload";
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

describe("buildTrackedBranchPayloadLaunchCommand", () => {
	test("uses the shared argv builder with the payload expansion last", () => {
		expect(
			buildTrackedBranchPayloadLaunchCommand("feature/demo", {
				model: { provider: "anthropic", id: "claude-sonnet" },
				thinkingLevel: "high",
			}),
		).toBe(
			'payload="$(brmem get prompt.md --namespace ns-dispatch --branch feature/demo)" && exec pi --provider anthropic --model claude-sonnet --thinking high "$payload"',
		);
	});

	test("omits model and thinking flags when unset", () => {
		expect(buildTrackedBranchPayloadLaunchCommand("feature/demo", { thinkingLevel: "off" })).toBe(
			'payload="$(brmem get prompt.md --namespace ns-dispatch --branch feature/demo)" && exec pi "$payload"',
		);
	});
});

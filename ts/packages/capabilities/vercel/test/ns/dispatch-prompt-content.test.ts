import { describe, expect, test } from "vitest";

import { isValidDispatchAnchorBranch } from "../../src/dispatch/dispatch-run.ts";
import {
	buildAnchorBranchName,
	buildAnchorPrBody,
	buildAnchorPrTitle,
} from "../../src/ns/dispatch-prompt/content.ts";

describe("buildAnchorBranchName", () => {
	test("keeps the source branch recognizable under the dispatch/ prefix", () => {
		expect(buildAnchorBranchName("feature/widgets", "ab12cd34")).toBe(
			"dispatch/feature-widgets-ab12cd34",
		);
	});

	test("sanitizes unsafe characters and collapses runs", () => {
		const name = buildAnchorBranchName("fix crash!! (issue #42)", "ab12cd34");
		expect(name).toBe("dispatch/fix-crash-issue-42-ab12cd34");
		expect(isValidDispatchAnchorBranch(name)).toBe(true);
	});

	test("trims dot edges and double dots that break git ref rules", () => {
		const name = buildAnchorBranchName("..weird..branch.", "ab12cd34");
		expect(isValidDispatchAnchorBranch(name)).toBe(true);
		expect(name.startsWith("dispatch/weird")).toBe(true);
	});

	test("falls back when the source branch sanitizes to nothing", () => {
		expect(buildAnchorBranchName("///", "ab12cd34")).toBe("dispatch/work-ab12cd34");
	});

	test("caps very long source branches while staying valid", () => {
		const name = buildAnchorBranchName(`feature/${"x".repeat(400)}`, "ab12cd34");
		expect(name.length).toBeLessThanOrEqual(200);
		expect(isValidDispatchAnchorBranch(name)).toBe(true);
	});

	test("avoids the forbidden .lock segment suffix", () => {
		const name = buildAnchorBranchName("thing.lock", "ab12cd34");
		expect(isValidDispatchAnchorBranch(name)).toBe(true);
	});
});

describe("buildAnchorPrTitle", () => {
	test("uses the prompt's first non-empty line", () => {
		expect(buildAnchorPrTitle("\nRename the widget gateway\nand more")).toBe(
			"[dispatch] Rename the widget gateway",
		);
	});

	test("truncates long first lines with an ellipsis", () => {
		const title = buildAnchorPrTitle("y".repeat(200));
		expect(title.length).toBeLessThanOrEqual("[dispatch] ".length + 72);
		expect(title.endsWith("…")).toBe(true);
	});

	test("falls back for whitespace-only prompts", () => {
		expect(buildAnchorPrTitle("  \n ")).toBe("[dispatch] dispatched prompt");
	});
});

describe("buildAnchorPrBody", () => {
	test("carries the source branch, revision, and fenced prompt", () => {
		const body = buildAnchorPrBody({
			prompt: "Do the thing.",
			revision: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
			sourceBranch: "feature/widgets",
		});
		expect(body).toContain("`feature/widgets`");
		expect(body).toContain("`a1b2c3d4e5f60718293a4b5c6d7e8f9012345678`");
		expect(body).toContain("```text\nDo the thing.\n```");
		expect(body).toContain("stamped on this description at");
	});

	test("widens the fence when the prompt contains one", () => {
		const body = buildAnchorPrBody({
			prompt: "```js\ncode\n```",
			revision: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
			sourceBranch: "main",
		});
		expect(body).toContain("````text\n```js\ncode\n```\n````");
	});
});

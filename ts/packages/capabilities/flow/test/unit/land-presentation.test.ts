import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";

import {
	buildLandFailurePresentation,
	failureLevel,
	formatFailedTarget,
	formatFailure,
	formatFailureNotification,
	landFailureKind,
	renderLandConfirmationDetails,
	renderLandResultBlock,
	renderPlainLandConfirmationDetails,
} from "../../src/land/land-presentation.ts";
import {
	landFlowFailureFacts,
	landingExecutionFailure,
	type LandFlowFailure,
} from "../../src/land/stack/errors.ts";
import type { LandConfirmationPreview } from "../../src/land/stack/types.ts";

const DIM = "\x1b[2m";

function caps(): Caps {
	return { isTty: true, colorDepth: "truecolor", columns: 80, canRenderUnicode: true };
}

describe("renderLandResultBlock", () => {
	test("renders land CLI facts through the shared finite result block", () => {
		const block = renderLandResultBlock(caps(), {
			kind: "success",
			headline: "Landed 1 PR: #42 feature-branch.",
			body: "Remaining cleanup:\n  - Remote branches were not deleted.",
			cwd: "/repo",
		});

		expect(stripAnsi(block).split("\n")).toEqual([
			"✓ Landed 1 PR: #42 feature-branch.",
			"Remaining cleanup:",
			"  - Remote branches were not deleted.",
			"Cwd: /repo",
		]);
		expect(block).toContain(`${DIM}Cwd: /repo\x1b[0m`);
		expect(block).not.toContain(`${DIM}Remaining cleanup:`);
	});

	test("still supports land outcomes with no cwd line", () => {
		const block = renderLandResultBlock(caps(), {
			kind: "refusal",
			headline: "Cancelled before merge; no PRs were landed.",
		});

		expect(stripAnsi(block).split("\n")).toEqual(["✗ Cancelled before merge; no PRs were landed."]);
	});
});

describe("renderLandConfirmationDetails", () => {
	test("colorizes structured stack-path confirmation sections without changing the text", () => {
		const preview: LandConfirmationPreview = {
			headline: "Review the landing plan before merging this stack.",
			impactLines: ["Squash-merge the selected Graphite path from bottom to top."],
			planRows: [
				{ label: "Stack", value: "2 PRs" },
				{ label: "Range", value: "feature-1 → feature-2" },
				{ label: "Target", value: "main" },
			],
			guidance: "Press Enter to proceed, or type n to cancel.",
		};

		const plain = renderPlainLandConfirmationDetails(preview);
		const rendered = renderLandConfirmationDetails(caps(), preview);

		expect(plain).toBe(
			[
				"Review the landing plan before merging this stack.",
				"",
				"Impact",
				"  • Squash-merge the selected Graphite path from bottom to top.",
				"",
				"Plan",
				"  Stack   2 PRs",
				"  Range   feature-1 → feature-2",
				"  Target  main",
				"",
				"Press Enter to proceed, or type n to cancel.",
			].join("\n"),
		);
		expect(stripAnsi(rendered)).toBe(plain);
		expect(rendered).toContain("\x1b[38;2;34;211;238mReview the landing plan");
		expect(rendered).toContain("\x1b[38;2;34;211;238mImpact");
		expect(rendered).toContain("\x1b[38;2;139;148;158m  Stack");
		expect(rendered).toContain("\x1b[38;2;63;185;80mPress Enter");
	});
});

const execResult = {
	type: "exited",
	stdout: "",
	stderr: "failed\n",
	code: 1,
	signal: null,
} as const;

const failures = [
	landingExecutionFailure("Execution failed.", {
		level: "warning",
		displayCommand: "gt restack",
		execResult,
		failedBranch: "feature-a",
		failedPrNumber: 42,
		outcome: "refusal",
	}),
	{
		type: "boundary",
		phase: "preflight",
		source: "git",
		code: "git-failed",
		message: "Boundary failed.",
		displayCommand: "git status",
		execResult,
		suggestedAction: "Inspect git.",
	},
	{
		type: "domain",
		phase: "preflight",
		reason: "pull-request-not-open",
		message: "Pull request is not open.",
		failedBranch: "feature-b",
		failedPrNumber: 43,
	},
	{
		type: "not-implemented",
		phase: "request-validation",
		message: "Not implemented.",
	},
] satisfies readonly LandFlowFailure[];

describe("land failure presentation", () => {
	test("formats and classifies every flow failure variant", () => {
		for (const failure of failures) {
			const facts = landFlowFailureFacts(failure);
			const presentation = buildLandFailurePresentation(failure, []);
			expect(formatFailure(failure, [])).toContain(facts.message);
			expect(formatFailureNotification(failure)).toBeTruthy();
			expect(landFailureKind(failure)).toBe(facts.outcome === "refusal" ? "refusal" : "failure");
			expect(presentation).toEqual({
				fullMessage: formatFailure(failure, []),
				level: facts.level,
				uiMessage: formatFailureNotification(failure),
				kind: landFailureKind(failure),
			});
		}
	});

	test("preserves execution metadata and failure defaults", () => {
		const defaultExecution = landingExecutionFailure("Default execution failure.");
		expect(failureLevel(defaultExecution)).toBe("error");
		expect(landFlowFailureFacts(defaultExecution).outcome).toBe("failure");

		const [execution, boundary, domain, notImplemented] = failures;
		if (!execution || !boundary || !domain || !notImplemented) return;

		const executionFacts = landFlowFailureFacts(execution);
		expect(failureLevel(execution)).toBe("warning");
		expect(executionFacts.outcome).toBe("refusal");
		expect(executionFacts.displayCommand).toBe("gt restack");
		expect(executionFacts.execResult).toEqual(execResult);
		expect(executionFacts.failedBranch).toBe("feature-a");
		expect(executionFacts.failedPrNumber).toBe(42);
		expect(formatFailedTarget(execution)).toBe("#42 feature-a");

		for (const failure of [boundary, domain, notImplemented]) {
			const facts = landFlowFailureFacts(failure);
			expect(facts.level).toBe("error");
			expect(facts.outcome).toBe("failure");
		}
		const boundaryFacts = landFlowFailureFacts(boundary);
		expect(boundaryFacts.displayCommand).toBe("git status");
		expect(boundaryFacts.execResult).toEqual(execResult);
		const domainFacts = landFlowFailureFacts(domain);
		expect(domainFacts.failedBranch).toBe("feature-b");
		expect(domainFacts.failedPrNumber).toBe(43);
		expect(formatFailedTarget(notImplemented)).toBe("unknown");
	});

	test("rewords dirty-worktree only at the presentation boundary", () => {
		const failure: LandFlowFailure = {
			type: "domain",
			phase: "preflight",
			reason: "dirty-worktree",
			message: "Working tree must be clean before landing.",
		};

		expect(failure.message).toBe("Working tree must be clean before landing.");
		expect(formatFailure(failure, [])).toBe(
			"Working tree is dirty; refusing to start stack landing.",
		);
	});
});

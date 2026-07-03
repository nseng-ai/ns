import { describe, expect, test } from "vitest";

import type { Caps } from "@ji/clinkr";
import { stripAnsi } from "@ji/clinkr/testing";

import {
	renderLandConfirmationDetails,
	renderLandResultBlock,
	renderPlainLandConfirmationDetails,
} from "../../src/land/stack/land-presentation.ts";
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

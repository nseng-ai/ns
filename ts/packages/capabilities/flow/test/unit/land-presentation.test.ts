import { describe, expect, test } from "vitest";

import type { Caps } from "@sdl/clinkr";
import { stripAnsi } from "@sdl/clinkr/testing";

import {
	renderLandConfirmationDetails,
	renderLandResultBlock,
} from "../../src/land-stack/land-presentation.ts";

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
	test("colorizes parseable stack-path confirmation sections without changing the text", () => {
		const message = [
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
		].join("\n");

		const rendered = renderLandConfirmationDetails(caps(), message);

		expect(stripAnsi(rendered)).toBe(message);
		expect(rendered).toContain("\x1b[38;2;34;211;238mReview the landing plan");
		expect(rendered).toContain("\x1b[38;2;34;211;238mImpact");
		expect(rendered).toContain("\x1b[38;2;139;148;158m  Stack");
		expect(rendered).toContain("\x1b[38;2;63;185;80mPress Enter");
	});
});

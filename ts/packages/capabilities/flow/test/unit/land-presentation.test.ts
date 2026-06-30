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
	test("colorizes parseable chunked confirmation sections without changing the text", () => {
		const message = [
			"Land 11 PRs in 2 chunks.",
			"",
			"Summary:",
			"  Chunks          2",
			"",
			"Chunks:",
			"  Chunk 1/2 — PRs 1-8",
			"    1. feature-1",
		].join("\n");

		const rendered = renderLandConfirmationDetails(caps(), message);

		expect(stripAnsi(rendered)).toBe(message);
		expect(rendered).toContain("\x1b[38;2;34;211;238mLand 11 PRs in 2 chunks.");
		expect(rendered).toContain("\x1b[38;2;210;153;34m  Chunk 1/2 — PRs 1-8");
	});
});

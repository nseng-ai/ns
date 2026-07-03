import { describe, expect, test } from "vitest";

import type { Caps } from "@ns/clinkr";
import { stripAnsi } from "@ns/clinkr/testing";

import { renderAutoslotResultBlock } from "../src/ns/autoslot-presentation.ts";

const DIM = "\x1b[2m";

function caps(): Caps {
	return { isTty: true, colorDepth: "truecolor", columns: 80, canRenderUnicode: true };
}

describe("renderAutoslotResultBlock", () => {
	test("renders autoslot domain facts through the shared finite result block", () => {
		const block = renderAutoslotResultBlock(caps(), {
			kind: "success",
			headline: "Autoslot moved demo-branch to slot-01.",
			cwd: "/repo",
			body: "Worktree: /slots/slot-01",
			guidance: "ns slot co demo-branch",
		});

		expect(stripAnsi(block).split("\n")).toEqual([
			"✓ Autoslot moved demo-branch to slot-01.",
			"Worktree: /slots/slot-01",
			"ns slot co demo-branch",
			"Cwd: /repo",
		]);
		expect(block).toContain(`${DIM}Cwd: /repo\x1b[0m`);
		expect(block).not.toContain(`${DIM}ns slot co demo-branch`);
	});

	test("keeps declined guardrails as warn refusals", () => {
		const block = renderAutoslotResultBlock(caps(), {
			kind: "refusal",
			headline: "Autoslot created demo-branch, but slot movement was skipped.",
			cwd: "/repo",
			body: "The worktree is not clean.",
		});

		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain("\x1b[38;2;210;153;34m");
		expect(headline).not.toContain("\x1b[38;2;248;81;73m");
	});
});

import { describe, expect, test } from "vitest";

import type { Caps } from "@sdl/clinkr";
import { stripAnsi } from "@sdl/clinkr/testing";

import { renderWorkflowResultBlock } from "../../src/shared/workflow-result-block.ts";

const DIM = "\x1b[2m";

function caps(): Caps {
	return { isTty: true, colorDepth: "truecolor", columns: 80, canRenderUnicode: true };
}

describe("renderWorkflowResultBlock", () => {
	test("delegates workflow-domain messages to the shared finite result block", () => {
		const block = renderWorkflowResultBlock(caps(), {
			kind: "success",
			headline: "Moved the latest commit to a new Graphite branch.",
			cwd: "/repo",
			body: "New branch: demo-branch\nWorking directory is clean.",
			guidance: "sdl slot co demo-branch",
		});

		expect(stripAnsi(block).split("\n")).toEqual([
			"✓ Moved the latest commit to a new Graphite branch.",
			"New branch: demo-branch",
			"Working directory is clean.",
			"sdl slot co demo-branch",
			"Cwd: /repo",
		]);
		expect(block).toContain(`${DIM}Cwd: /repo\x1b[0m`);
		expect(block).not.toContain(`${DIM}New branch: demo-branch`);
	});

	test("keeps refusal as a warn outcome, not an error outcome", () => {
		const block = renderWorkflowResultBlock(caps(), {
			kind: "refusal",
			headline: "`sdl flow autobranch` requires pending worktree changes and did not run.",
			cwd: "/repo",
			body: "Working tree is clean.",
		});

		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain("\x1b[38;2;210;153;34m");
		expect(headline).not.toContain("\x1b[38;2;248;81;73m");
	});
});

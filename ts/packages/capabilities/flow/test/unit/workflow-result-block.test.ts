import { describe, expect, test } from "vitest";

import type { Caps, ColorDepth } from "@sdl/clinkr";
import { stripAnsi } from "@sdl/clinkr/testing";

import { renderWorkflowResultBlock } from "../../src/shared/workflow-result-block.ts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const SUCCESS_TRUECOLOR = "\x1b[38;2;63;185;80m";
const ERROR_TRUECOLOR = "\x1b[38;2;248;81;73m";

function caps(parts: { colorDepth?: ColorDepth; canRenderUnicode?: boolean } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		canRenderUnicode: parts.canRenderUnicode ?? true,
	};
}

describe("renderWorkflowResultBlock — success", () => {
	const block = renderWorkflowResultBlock(caps(), {
		kind: "success",
		headline: "Moved the latest commit to a new Graphite branch.",
		cwd: "/repo",
		body: "New branch: demo-branch\nMoved commit: abc123d Add demo feature\nWorking directory is clean.",
	});
	const plain = stripAnsi(block);

	test("green ✓ headline carries the success swatch and bold", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(SUCCESS_TRUECOLOR);
		expect(headline).toContain(BOLD);
		expect(headline).toContain("✓ Moved the latest commit to a new Graphite branch.");
	});

	test("renders the workflow summary body at normal weight and dimmed cwd evidence", () => {
		expect(plain).toContain("New branch: demo-branch");
		expect(plain).toContain("Working directory is clean.");
		expect(block).toContain(`${DIM}Cwd: /repo${RESET}`);
		// The summary body is not dimmed.
		expect(block).not.toContain(`${DIM}New branch: demo-branch`);
	});
});

describe("renderWorkflowResultBlock — failure", () => {
	const block = renderWorkflowResultBlock(caps(), {
		kind: "failure",
		headline: "Could not move the latest commit to a new Graphite branch.",
		cwd: "/repo",
		body: "Failed to create Graphite branch after resetting source branch.\nRecovery branch: autobranch-backup/feature/123\nDeleted incomplete branch demo-branch.",
		guidance: "Inspect the repository state before retrying.",
	});
	const plain = stripAnsi(block);

	test("bold error headline with the ✗ glyph", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(BOLD);
		expect(headline).toContain(ERROR_TRUECOLOR);
		expect(headline).toContain("✗ Could not move the latest commit to a new Graphite branch.");
	});

	test("keeps the domain cause/recovery body and guidance at normal weight", () => {
		expect(plain).toContain("Failed to create Graphite branch after resetting source branch.");
		expect(plain).toContain("Recovery branch: autobranch-backup/feature/123");
		expect(plain).toContain("Inspect the repository state before retrying.");
		expect(block).not.toContain(`${DIM}Recovery branch`);
		expect(block).toContain(`${DIM}Cwd: /repo${RESET}`);
	});
});

describe("renderWorkflowResultBlock — refusal", () => {
	const block = renderWorkflowResultBlock(caps(), {
		kind: "refusal",
		headline: "`sdl flow autobranch` requires pending worktree changes and did not run.",
		cwd: "/repo",
		body: "Working tree is clean.",
		guidance: "Use `sdl flow branch-latest-commit` to move the latest eligible unpushed commit.",
	});
	const plain = stripAnsi(block);

	test("warn ✗ headline is bold and not error-colored", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(BOLD);
		// Refusal is a first-class warn outcome, never the red error swatch (house-style §7.3).
		expect(headline).not.toContain(ERROR_TRUECOLOR);
		expect(headline).toContain(
			"✗ `sdl flow autobranch` requires pending worktree changes and did not run.",
		);
	});

	test("keeps the actionable reason and guidance at normal weight, with dimmed cwd", () => {
		expect(plain).toContain("Working tree is clean.");
		expect(plain).toContain("Use `sdl flow branch-latest-commit`");
		expect(block).not.toContain(`${DIM}Working tree is clean.`);
		expect(block).toContain(`${DIM}Cwd: /repo${RESET}`);
	});
});

describe("renderWorkflowResultBlock — caps degradation", () => {
	const input = {
		kind: "success" as const,
		headline: "done",
		cwd: "/repo",
		body: "New branch: demo-branch",
	};

	test("truecolor caps emit color SGR", () => {
		expect(renderWorkflowResultBlock(caps({ colorDepth: "truecolor" }), input)).toContain(
			SUCCESS_TRUECOLOR,
		);
	});

	test("mono caps drop color but keep bold/dim weight", () => {
		const mono = renderWorkflowResultBlock(caps({ colorDepth: "none" }), input);
		expect(mono).not.toContain("\x1b[38;2");
		expect(mono).not.toContain("\x1b[38;5");
		expect(mono).not.toMatch(/\x1b\[9[0-6]m/);
		expect(mono).toContain(BOLD);
		expect(mono).toContain(DIM);
	});

	test("no-unicode caps fall back to the ascii glyph", () => {
		const ascii = renderWorkflowResultBlock(caps({ canRenderUnicode: false }), input);
		expect(stripAnsi(ascii).split("\n")[0]).toContain("v done");
		expect(ascii).not.toContain("✓");
	});
});

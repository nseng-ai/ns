import { describe, expect, test } from "vitest";

import type { Caps, ColorDepth } from "@sdl/clinkr";
import { stripAnsi } from "@sdl/clinkr/testing";
import type { ExecResult } from "sdl-sdk";

import { renderGitResultBlock } from "../../src/shared/git-result-block.ts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
// success swatch at truecolor (PALETTE.success.rgb), used to prove color is present / absent.
const SUCCESS_TRUECOLOR = "\x1b[38;2;63;185;80m";

function caps(parts: { colorDepth?: ColorDepth; canRenderUnicode?: boolean } = {}): Caps {
	return {
		isTty: true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		canRenderUnicode: parts.canRenderUnicode ?? true,
	};
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return { stdout: "", stderr: "", code: 0, killed: false, ...overrides };
}

describe("renderGitResultBlock — success", () => {
	const block = renderGitResultBlock(caps(), {
		kind: "success",
		headline: "`git push` completed successfully.",
		command: "git push",
		cwd: "/repo",
		result: execResult({ stdout: "Everything up-to-date\n" }),
	});
	const plain = stripAnsi(block);

	test("green ✓ headline carries the success swatch and bold", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(SUCCESS_TRUECOLOR);
		expect(headline).toContain(BOLD);
		expect(headline).toContain("✓ `git push` completed successfully.");
	});

	test("includes concise command/cwd evidence without debug transcript plumbing", () => {
		expect(plain).toContain("Command: git push");
		expect(plain).toContain("Cwd: /repo");
		expect(plain).not.toContain("Exit: 0");
		expect(plain).not.toContain("Killed: false");
		expect(plain).not.toContain("stdout:");
		expect(plain).not.toContain("Everything up-to-date");
	});

	test("command/cwd evidence is dimmed", () => {
		expect(block).toContain(`${DIM}Command: git push${RESET}`);
		expect(block).toContain(`${DIM}Cwd: /repo${RESET}`);
	});
});

describe("renderGitResultBlock — failure", () => {
	const block = renderGitResultBlock(caps(), {
		kind: "failure",
		headline: "`git push` failed.",
		command: "git push",
		cwd: "/repo",
		result: execResult({
			stdout: "",
			stderr:
				"To github.com:acme/app.git\n ! [rejected] main -> main (fetch first)\nerror: failed to push some refs\nhint: Updates were rejected\n",
			code: 1,
		}),
		guidance: "Use `sdl flow submit` when appropriate.",
	});
	const plain = stripAnsi(block);

	test("bold error headline with the ✗ glyph", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain(BOLD);
		expect(headline).toContain("\x1b[38;2;248;81;73m"); // PALETTE.error truecolor
		expect(headline).toContain("✗ `git push` failed.");
	});

	test("surfaces cause lines (rejected / error:) at normal foreground weight", () => {
		const reject = " ! [rejected] main -> main (fetch first)";
		const err = "error: failed to push some refs";
		// Present at normal weight: not dimmed.
		expect(block).toContain(reject);
		expect(block).toContain(err);
		expect(block).not.toContain(`${DIM}${reject}${RESET}`);
		expect(block).not.toContain(`${DIM}${err}${RESET}`);
		// Non-cause transcript lines are not promoted as cause lines.
		expect(plain).toContain("hint: Updates were rejected"); // (still appears in the dimmed transcript)
	});

	test("guidance is present and plumbing + full transcript are dimmed", () => {
		expect(plain).toContain("Use `sdl flow submit` when appropriate.");
		expect(block).toContain(`${DIM}Exit: 1${RESET}`);
		expect(block).toContain(`${DIM}Killed: false${RESET}`);
		expect(block).toContain(`${DIM}stderr:${RESET}`);
	});

	test("surfaces pull-trunk not-fast-forward failures as cause lines", () => {
		const fastForwardBlock = renderGitResultBlock(caps(), {
			kind: "failure",
			headline: "Could not update local trunk branch `main`.",
			command: "git pull --ff-only origin main",
			cwd: "/repo",
			result: execResult({ stderr: "not fast-forward\n", code: 1 }),
		});

		expect(
			fastForwardBlock
				.split("\n")
				.some((line) => stripAnsi(line) === "not fast-forward" && !line.includes(DIM)),
		).toBe(true);
	});
});

describe("renderGitResultBlock — refusal (dirty worktree)", () => {
	const block = renderGitResultBlock(caps(), {
		kind: "refusal",
		headline: "`sdl flow push` requires a clean worktree and did not run `git push`.",
		command: "git status --porcelain",
		cwd: "/repo",
		detail: " M src/app.ts\n?? notes.md\n",
		guidance: "Commit or stash outstanding changes first.",
	});
	const plain = stripAnsi(block);

	test("warn headline, porcelain detail, and guidance — no exit/killed plumbing", () => {
		const headline = block.split("\n")[0] ?? "";
		expect(headline).toContain("\x1b[38;2;210;153;34m"); // PALETTE.warn truecolor
		expect(headline).toContain(BOLD);
		expect(plain).toContain(" M src/app.ts");
		expect(plain).toContain("?? notes.md");
		expect(plain).toContain("Commit or stash outstanding changes first.");
		expect(plain).toContain("Command: git status --porcelain");
		expect(plain).not.toContain("Exit:");
		expect(plain).not.toContain("Killed:");
	});

	test("porcelain detail stays at normal weight under a dimmed stdout label", () => {
		expect(block).toContain(`${DIM}stdout:${RESET}`);
		expect(block).not.toContain(`${DIM} M src/app.ts`);
	});
});

describe("renderGitResultBlock — caps degradation", () => {
	const input = {
		kind: "success" as const,
		headline: "done",
		command: "git push",
		cwd: "/repo",
		result: execResult({ stdout: "ok\n" }),
	};

	test("truecolor caps emit color SGR", () => {
		expect(renderGitResultBlock(caps({ colorDepth: "truecolor" }), input)).toContain(
			SUCCESS_TRUECOLOR,
		);
	});

	test("mono caps drop color but keep bold/dim weight", () => {
		const mono = renderGitResultBlock(caps({ colorDepth: "none" }), input);
		expect(mono).not.toContain("\x1b[38;2"); // no truecolor fg
		expect(mono).not.toContain("\x1b[38;5"); // no 256-color fg
		expect(mono).not.toMatch(/\x1b\[9[0-6]m/); // no bright-16 color fg
		expect(mono).toContain(BOLD); // bold headline survives
		expect(mono).toContain(DIM); // dimmed plumbing survives
	});

	test("no-unicode caps fall back to the ascii glyph", () => {
		const ascii = renderGitResultBlock(caps({ canRenderUnicode: false }), input);
		expect(stripAnsi(ascii).split("\n")[0]).toContain("v done");
		expect(ascii).not.toContain("✓");
	});
});

describe("renderGitResultBlock — empty output convention", () => {
	test("empty stdout/stderr render as <empty> for failures", () => {
		const block = renderGitResultBlock(caps(), {
			kind: "failure",
			headline: "failed",
			command: "git push",
			cwd: "/repo",
			result: execResult({ stdout: "", stderr: "", code: 1 }),
		});
		const plain = stripAnsi(block);
		expect(plain).toContain("stdout:\n<empty>");
		expect(plain).toContain("stderr:\n<empty>");
	});
});

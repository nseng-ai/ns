import { describe, expect, test } from "vitest";

import type { Caps, ColorDepth } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import type { ExecResult } from "@nseng-ai/kernel/sdk";

import { renderGitResultBlock } from "../../src/ns/presentation/git-result-block.ts";

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

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

function execResult(overrides: ExitedResultFields = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}

function hasNormalWeightLine(block: string, expected: string): boolean {
	return block.split("\n").some((line) => stripAnsi(line) === expected && !line.includes(DIM));
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
		expect(plain).not.toContain("timed out");
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
		guidance: "Use `ns flow submit` when appropriate.",
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
		expect(plain).toContain("Use `ns flow submit` when appropriate.");
		expect(block).toContain(`${DIM}Termination: exit 1${RESET}`);
		expect(plain).not.toContain("timed out");
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

		expect(hasNormalWeightLine(fastForwardBlock, "not fast-forward")).toBe(true);
	});

	test("renders timeout termination truthfully", () => {
		const killedBlock = renderGitResultBlock(caps(), {
			kind: "failure",
			headline: "`git push` was killed.",
			command: "git push",
			cwd: "/repo",
			result: { type: "timed-out", stdout: "", stderr: "", code: 1, signal: null },
		});

		expect(killedBlock).toContain(`${DIM}Termination: timed out${RESET}`);
	});

	test("normalizes CRLF transcript lines before promotion and full rendering", () => {
		const crlfBlock = renderGitResultBlock(caps(), {
			kind: "failure",
			headline: "`git fetch` failed.",
			command: "git fetch origin main",
			cwd: "/repo",
			result: execResult({
				stdout: "remote: counting\r\n",
				stderr: "fatal: could not resolve host\r\nnext line\r",
				code: 128,
			}),
		});
		const plain = stripAnsi(crlfBlock);

		expect(hasNormalWeightLine(crlfBlock, "fatal: could not resolve host")).toBe(true);
		expect(plain).not.toContain("\r");
		expect(plain).toContain("remote: counting\nstderr:\nfatal: could not resolve host\nnext line");
	});

	test("surfaces additional git authentication and name-resolution markers", () => {
		const markerBlock = renderGitResultBlock(caps(), {
			kind: "failure",
			headline: "`git fetch` failed.",
			command: "git fetch origin main",
			cwd: "/repo",
			result: execResult({
				stderr: [
					"Permission denied (publickey).",
					"Could not resolve host: github.com",
					"Authentication failed for 'https://github.com/acme/app.git/'",
				].join("\n"),
				code: 128,
			}),
		});

		expect(hasNormalWeightLine(markerBlock, "Permission denied (publickey).")).toBe(true);
		expect(hasNormalWeightLine(markerBlock, "Could not resolve host: github.com")).toBe(true);
		expect(
			hasNormalWeightLine(
				markerBlock,
				"Authentication failed for 'https://github.com/acme/app.git/'",
			),
		).toBe(true);
	});

	test("renders independent signal termination as failure evidence", () => {
		const block = renderGitResultBlock(caps(), {
			kind: "failure",
			headline: "`git push` was killed.",
			command: "git push",
			cwd: "/repo",
			result: { type: "exited", stdout: "", stderr: "", code: 143, signal: "SIGTERM" },
		});

		expect(block).toContain(`${DIM}Termination: signal SIGTERM (exit 143)${RESET}`);
	});

	test("normalizes CRLF transcript output and promoted cause lines", () => {
		const block = renderGitResultBlock(caps(), {
			kind: "failure",
			headline: "`git pull` failed.",
			command: "git pull",
			cwd: "/repo",
			result: execResult({
				stdout: "remote: denied\r\n",
				stderr: "fatal: could not read from remote repository\r\n",
				code: 1,
			}),
		});
		const plain = stripAnsi(block);

		expect(plain).not.toContain("\r");
		expect(block.split("\n").some((line) => stripAnsi(line) === "remote: denied")).toBe(true);
		expect(
			block
				.split("\n")
				.some((line) => stripAnsi(line) === "fatal: could not read from remote repository"),
		).toBe(true);
		expect(plain).toContain("stdout:\nremote: denied");
		expect(plain).toContain("stderr:\nfatal: could not read from remote repository");
	});

	test.each(["permission denied", "could not resolve", "authentication failed"])(
		"surfaces %s failures as cause lines",
		(marker) => {
			const block = renderGitResultBlock(caps(), {
				kind: "failure",
				headline: "`git fetch` failed.",
				command: "git fetch",
				cwd: "/repo",
				result: execResult({ stderr: `${marker}\n`, code: 1 }),
			});

			expect(
				block.split("\n").some((line) => stripAnsi(line) === marker && !line.includes(DIM)),
			).toBe(true);
		},
	);
});

describe("renderGitResultBlock — refusal (dirty worktree)", () => {
	const block = renderGitResultBlock(caps(), {
		kind: "refusal",
		headline: "`ns flow push` requires a clean worktree and did not run `git push`.",
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
		expect(plain).not.toContain("timed out");
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

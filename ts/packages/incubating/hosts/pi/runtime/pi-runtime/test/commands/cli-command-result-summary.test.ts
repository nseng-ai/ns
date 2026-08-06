import { describe, expect, test } from "vitest";

import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import {
	buildCliCommandResultSummaryPrompt,
	CLI_COMMAND_RESULT_OMISSION_MARKER_PREFIX,
	CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS,
	sanitizeTerminalControlText,
	summarizeCliCommandResult,
	validateCliCommandResultSummary,
	type CliCommandResultDetails,
	type GenerateCliCommandResultSummary,
	type SelectCliCommandResultModel,
	type WriteCliCommandResultLogs,
} from "../../src/commands/cli-command-result-summary.ts";

const MODEL_SELECTION: ModelSelection = {
	provider: "acme",
	modelId: "fast",
	thinking: "minimal",
};
const DETAILS: CliCommandResultDetails = {
	cliName: "ns",
	commandName: "objective list",
	argv: ["objective", "list"],
	cwd: "/repo",
	exitCode: 0,
	stdout: "one\ntwo",
	stderr: "",
};
const RAW_FALLBACK = "raw command output";
const LOG_PATHS = {
	stdoutPath: "/tmp/ns-pi-cli-result-a/stdout.log",
	stderrPath: "/tmp/ns-pi-cli-result-a/stderr.log",
};

function successfulFakes(summary: string): {
	writeLogs: WriteCliCommandResultLogs;
	selectModel: SelectCliCommandResultModel;
	generateSummary: GenerateCliCommandResultSummary;
	prompts: string[];
} {
	const prompts: string[] = [];
	return {
		writeLogs: async () => ({ ok: true, paths: LOG_PATHS }),
		selectModel: async () => ({ ok: true, modelSelection: MODEL_SELECTION }),
		generateSummary: async (request) => {
			prompts.push(request.prompt);
			return { ok: true, text: summary };
		},
		prompts,
	};
}

describe("CLI command result summary", () => {
	test("builds a deterministic sanitized prompt", () => {
		const prompt = buildCliCommandResultSummaryPrompt({
			...DETAILS,
			stdout: "ok\u001b[2J\u0007",
			stderr: "warn\rnext",
		});

		expect(prompt).toContain("Return exactly `## Summary`");
		expect(prompt).toContain("Exit code: 0");
		expect(prompt).toContain("<stdout>\nok\n</stdout>");
		expect(prompt).toContain("<stderr>\nwarn\nnext\n</stderr>");
		expect(prompt).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
	});

	test("uses one combined 40,000-character output cutoff", () => {
		const fixedPrompt = buildCliCommandResultSummaryPrompt({ ...DETAILS, stdout: "", stderr: "" });
		const outputSection = fixedPrompt.slice(fixedPrompt.indexOf("<stdout>"));
		const prompt = buildCliCommandResultSummaryPrompt({
			...DETAILS,
			stdout: "a".repeat(30_000),
			stderr: "b".repeat(30_000),
		});
		const truncatedOutput = prompt.slice(prompt.indexOf("<stdout>"));

		expect(truncatedOutput).toHaveLength(CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS);
		expect(truncatedOutput).toContain(CLI_COMMAND_RESULT_OMISSION_MARKER_PREFIX);
		expect(truncatedOutput).toMatch(/omitted \d+ characters\]\n$/u);
		expect(outputSection.length).toBeLessThan(CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS);
	});

	test("strictly validates success and failure Markdown", () => {
		expect(validateCliCommandResultSummary("## Summary\n- Done", 0)).toEqual({
			ok: true,
			markdown: "## Summary\n- Done",
		});
		expect(
			validateCliCommandResultSummary("## Summary\n- Failed\n## Errors\n- Bad input", 2),
		).toMatchObject({ ok: true });
		for (const invalid of [
			"prose\n## Summary\n- Done",
			"## Summary\n\n- One",
			"## Summary\n* Wrong marker",
			"## Summary\n- 1\n- 2\n- 3\n- 4\n- 5",
			"## Summary\n- Done\n## Errors\n- Unexpected",
		]) {
			expect(validateCliCommandResultSummary(invalid, 0)).toEqual({ ok: false });
		}
		expect(validateCliCommandResultSummary("## Summary\n- Failed", 1)).toEqual({ ok: false });
		expect(validateCliCommandResultSummary("## Summary\n- Done\u001b[2J", 0)).toEqual({
			ok: false,
		});
	});

	test("sanitizes terminal controls without removing newlines", () => {
		expect(sanitizeTerminalControlText("a\u001b]0;title\u0007b\r\nc\u0000")).toBe("ab\nc");
	});

	test("orchestrates logs, model selection, generation, validation, and host rendering", async () => {
		const fakes = successfulFakes("## Summary\n- Listed two objectives");
		const result = await summarizeCliCommandResult({
			...fakes,
			details: DETAILS,
			rawFallbackMarkdown: RAW_FALLBACK,
		});

		expect(fakes.prompts).toHaveLength(1);
		expect(result).toEqual({
			type: "summarized",
			markdown:
				"## Summary\n- Listed two objectives\n\n## Raw logs\n- stdout: /tmp/ns-pi-cli-result-a/stdout.log\n- stderr: /tmp/ns-pi-cli-result-a/stderr.log",
			summaryMarkdown: "## Summary\n- Listed two objectives",
			logPaths: LOG_PATHS,
			modelSelection: MODEL_SELECTION,
		});
	});

	test("falls back when selection, generation, or validation fails after logs exist", async () => {
		const writeLogs: WriteCliCommandResultLogs = async () => ({ ok: true, paths: LOG_PATHS });
		const selectModel: SelectCliCommandResultModel = async () => ({
			ok: true,
			modelSelection: MODEL_SELECTION,
		});
		const failures = [
			await summarizeCliCommandResult({
				details: DETAILS,
				rawFallbackMarkdown: RAW_FALLBACK,
				writeLogs,
				selectModel: async () => ({ ok: false, message: "no policy" }),
				generateSummary: async () => ({ ok: true, text: "unused" }),
			}),
			await summarizeCliCommandResult({
				details: DETAILS,
				rawFallbackMarkdown: RAW_FALLBACK,
				writeLogs,
				selectModel,
				generateSummary: async () => ({ ok: false, message: "offline" }),
			}),
			await summarizeCliCommandResult({
				details: DETAILS,
				rawFallbackMarkdown: RAW_FALLBACK,
				writeLogs,
				selectModel,
				generateSummary: async () => ({ ok: true, text: "not markdown" }),
			}),
		];

		expect(failures.map((result) => result.type)).toEqual(["fallback", "fallback", "fallback"]);
		expect(failures.map((result) => (result.type === "fallback" ? result.reason : ""))).toEqual([
			"model-selection-failed",
			"generation-failed",
			"invalid-summary",
		]);
		for (const result of failures) expect(result.markdown).toContain(LOG_PATHS.stdoutPath);
	});

	test("returns log-unavailable and does not invoke model operations", async () => {
		let selectionCalls = 0;
		const result = await summarizeCliCommandResult({
			details: { ...DETAILS, exitCode: 1 },
			rawFallbackMarkdown: RAW_FALLBACK,
			writeLogs: async () => ({ ok: false, message: "read-only temp" }),
			selectModel: async () => {
				selectionCalls += 1;
				return { ok: true, modelSelection: MODEL_SELECTION };
			},
			generateSummary: async () => ({ ok: true, text: "unused" }),
		});

		expect(selectionCalls).toBe(0);
		expect(result).toMatchObject({
			type: "log-unavailable",
			message: "read-only temp",
		});
		expect(result.markdown).toContain(RAW_FALLBACK);
		expect(result.markdown).toContain("Raw command logs are unavailable");
	});
});

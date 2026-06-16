import { describe, expect, test } from "vitest";
import { ScriptedCommandExecApi } from "@asdl/core/testing";

import { buildClaudeDiffFindingsJsonSchema, FakeHarnessGateway, RealHarnessGateway } from "../../src/gateways/harness.ts";
import { createFindingsReview, createLocalDiff, type HarnessReviewRequest, type ReviewExecutionResponse } from "../../src/models.ts";

function request(options: { readonly model?: string; readonly reviewName?: string; readonly diffText?: string } = {}): HarnessReviewRequest {
	const diffText = options.diffText ?? "diff --git a/src/app.ts b/src/app.ts\n+change\n";
	return {
		model: options.model ?? "haiku",
		reviewDefinition: {
			name: options.reviewName ?? "typescript-style",
			description: "Review TypeScript diffs.",
			instructions: "Flag concrete issues.",
			defaultModel: "haiku",
			applicability: { include: ["**/*.ts"], exclude: [] },
		},
		target: {
			localDiff: createLocalDiff({
				baseRef: "main",
				diffText,
				files: [
					{
						path: "src/app.ts",
						oldPath: null,
						changeKind: "modified",
						rawText: diffText,
						isBinary: false,
						addedLines: 1,
						removedLines: 0,
						hunkCount: 1,
						byteSize: diffText.length,
						estimatedTokens: 10,
					},
				],
			}),
		},
	};
}

function successResponse(): ReviewExecutionResponse {
	return { payload: createFindingsReview([]), usage: null, inputCoverage: null };
}

function claudeStdout(): string {
	return JSON.stringify({ type: "result", structured_output: { findings: [] } });
}

describe("FakeHarnessGateway", () => {
	test("returns default empty findings and records immutable request copies", async () => {
		const gateway = new FakeHarnessGateway();
		const reviewRequest = request();

		const result = await gateway.runReview(reviewRequest, { cwd: "/repo", env: { A: "1" } });
		reviewRequest.target.localDiff.changedPaths.push("mutated.ts");

		expect(result).toEqual({ type: "ok", value: successResponse() });
		expect(gateway.calls()[0]?.request.target.localDiff.changedPaths).toEqual(["src/app.ts"]);
		expect(gateway.calls()[0]?.options.env).toEqual({ A: "1" });
	});

	test("returns configured results by review name without sharing mutable response state", async () => {
		const configured: ReviewExecutionResponse = {
			payload: createFindingsReview([{ path: "src/app.ts", line: 1, severity: "info", summary: "A", details: "B" }]),
			usage: null,
			inputCoverage: null,
		};
		const gateway = new FakeHarnessGateway({ resultsByReviewName: { custom: { type: "ok", value: configured } } });

		const first = await gateway.runReview(request({ reviewName: "custom" }), { cwd: "/repo" });
		if (first.type === "ok") first.value.payload.findings.push({ path: "other.ts", line: null, severity: "warning", summary: "C", details: "D" });
		const second = await gateway.runReview(request({ reviewName: "custom" }), { cwd: "/repo" });

		expect(second.type).toBe("ok");
		if (second.type === "ok") {
			expect(second.value.payload.findings).toHaveLength(1);
		}
	});
});

describe("RealHarnessGateway", () => {
	test("resolves claude before spawning and invokes Claude Code with prompt on stdin", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: claudeStdout() }]);
		const resolved: string[] = [];
		const gateway = new RealHarnessGateway({
			execApi,
			binaryResolver: (name) => {
				resolved.push(name);
				return "/usr/bin/claude";
			},
		});
		const largeMarker = "UNIQUE_PROMPT_MARKER";
		const reviewRequest = request({ diffText: `${largeMarker}\n${"x".repeat(200_000)}` });

		const result = await gateway.runReview(reviewRequest, { cwd: "/repo" });

		expect(result.type).toBe("ok");
		expect(resolved).toEqual(["claude"]);
		const call = execApi.calls()[0];
		expect(call?.command).toBe("claude");
		expect(call?.args.slice(0, 8)).toEqual(["-p", "--output-format", "json", "--bare", "--tools", "Bash,Read", "--model", "haiku"]);
		expect(call?.args[6]).toBe("--model");
		expect(call?.args).toContain("--system-prompt");
		expect(call?.args).toContain("--json-schema");
		const schemaArg = call?.args.at((call?.args.indexOf("--json-schema") ?? -2) + 1);
		expect(schemaArg).toBeDefined();
		if (schemaArg !== undefined) {
			expect(JSON.parse(schemaArg)).toEqual(buildClaudeDiffFindingsJsonSchema());
			expect(JSON.parse(schemaArg)).not.toHaveProperty("$schema");
		}
		expect(call?.args.join(" ")).not.toContain("Edit");
		expect(call?.args.join(" ")).not.toContain("Write");
		expect(call?.args).not.toContain("--verbose");
		expect(call?.args).not.toContain("--append-system-prompt");
		expect(call?.args.some((arg) => arg.includes(largeMarker))).toBe(false);
		expect(call?.options?.stdin).toContain(largeMarker);
		expect(call?.options?.cwd).toBe("/repo");
	});

	test("missing binary returns harness_binary_missing without spawning", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: claudeStdout() }]);
		const gateway = new RealHarnessGateway({ execApi, binaryResolver: () => undefined });

		const result = await gateway.runReview(request(), { cwd: "/repo" });

		expect(result.type).toBe("error");
		if (result.type === "error") expect(result.error.type).toBe("harness_binary_missing");
		expect(execApi.calls()).toEqual([]);
	});

	test("rejects unsupported models before spawning", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: claudeStdout() }]);
		const gateway = new RealHarnessGateway({ execApi, binaryResolver: () => "/usr/bin/claude" });

		const result = await gateway.runReview(request({ model: "gpt-4" }), { cwd: "/repo" });

		expect(result.type).toBe("error");
		if (result.type === "error") expect(result.error.type).toBe("model_not_supported_by_harness");
		expect(execApi.calls()).toEqual([]);
	});

	test("non-zero exit maps to harness_execution_failed with stderr precedence", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: "last stdout line", stderr: "stderr wins", code: 2, killed: false }]);
		const gateway = new RealHarnessGateway({ execApi, binaryResolver: () => "/usr/bin/claude" });

		const result = await gateway.runReview(request(), { cwd: "/repo" });

		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error.type).toBe("harness_execution_failed");
			expect(result.error.message).toBe("stderr wins");
		}
	});

	test("successful stdout returns input coverage", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: claudeStdout() }]);
		const gateway = new RealHarnessGateway({ execApi, binaryResolver: () => "/usr/bin/claude" });

		const result = await gateway.runReview(request(), { cwd: "/repo" });

		expect(result.type).toBe("ok");
		if (result.type === "ok") {
			expect(result.value.inputCoverage).toMatchObject({ changedPathCount: 1, includedFileCount: 1, omittedFileCount: 0 });
		}
	});
});

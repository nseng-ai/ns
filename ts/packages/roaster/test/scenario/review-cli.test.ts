import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { FakeHarnessGateway } from "../../src/gateways/harness.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { createFindingsReview, createLocalDiff, type LocalDiff, type ReviewExecutionResponse, type ReviewFinding } from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

const REVIEW_KEY = "dignified-python";

interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

async function runRoaster(args: readonly string[], options: { readonly context?: ReturnType<typeof fakeRoasterContext>; readonly stdin?: string } = {}): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const exitCode = await runCli(args, {
		context: options.context ?? fakeRoasterContext(),
		cwd: "/repo",
		env: {},
		stdin: async () => options.stdin ?? "",
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

function sampleSource(options: { readonly defaultModel?: string | null; readonly description?: string; readonly appliesTo?: string } = {}): string {
	const defaultModel = options.defaultModel === undefined ? "sonnet" : options.defaultModel;
	return [
		"---",
		`description: ${options.description ?? "Review Python diffs for style violations."}`,
		...(defaultModel === null ? [] : [`default_model: ${defaultModel}`]),
		...(options.appliesTo === undefined ? [] : [options.appliesTo.trimEnd()]),
		"---",
		"",
		"Flag concrete issues in the diff.",
	].join("\n");
}

function diffForPath(path: string): LocalDiff {
	const rawText = `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n+changed\n`;
	return createLocalDiff({
		baseRef: "master",
		diffText: rawText,
		files: [
			{
				path,
				oldPath: null,
				changeKind: "modified",
				rawText,
				isBinary: false,
				addedLines: 1,
				removedLines: 0,
				hunkCount: 1,
				byteSize: rawText.length,
				estimatedTokens: 10,
			},
		],
	});
}

function applicableSources(): Record<string, string> {
	return {
		"dignified-python": sampleSource({ appliesTo: "applies_to:\n  include:\n    - '**/*.py'\n  exclude:\n    - '**/tests/**/*.py'" }),
		"typescript-style": sampleSource({
			description: "Review TypeScript diffs for style violations.",
			appliesTo: "applies_to:\n  include:\n    - '**/*.ts'\n    - '**/*.tsx'",
		}),
	};
}

function contextWithCatalog(options: { readonly sources: Record<string, string>; readonly keys?: readonly string[]; readonly diff?: LocalDiff; readonly response?: ReviewExecutionResponse } = { sources: { [REVIEW_KEY]: sampleSource() } }) {
	return fakeRoasterContext({
		reviewCatalog: new FakeReviewCatalogGateway({ reviewSourcesByKey: options.sources, reviewKeys: options.keys, reviewsDir: "/repo/reviews" }),
		localDiff: new FakeLocalDiffGateway({ defaultDiff: { type: "ok", value: options.diff ?? diffForPath("app.py") } }),
		harness: new FakeHarnessGateway({ defaultResult: { type: "ok", value: options.response ?? { payload: createFindingsReview([]), usage: null, inputCoverage: null } } }),
	});
}

describe("roaster review CLI", () => {
	test("root help exposes review and hides exec", async () => {
		const run = await runRoaster(["--help"]);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("review");
		expect(run.stdout).not.toContain("exec");
	});

	test("review list renders human output", async () => {
		const run = await runRoaster(["review", "list"], { context: contextWithCatalog({ sources: applicableSources(), keys: ["dignified-python", "typescript-style"] }) });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("Reviews directory: /repo/reviews");
		expect(run.stdout).toContain("Reviews: 2");
		expect(run.stdout).toContain("- dignified-python: Review Python diffs for style violations.");
	});

	test("review list JSON includes keys and count", async () => {
		const run = await runRoaster(["review", "list", "--format", "json"], { context: contextWithCatalog({ sources: applicableSources(), keys: ["dignified-python", "typescript-style"] }) });
		expect(run.exitCode).toBe(0);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.data.keys).toEqual(["dignified-python", "typescript-style"]);
		expect(envelope.data.count).toBe(2);
		expect(envelope.data.reviews[0].default_model).toBe("sonnet");
	});

	test("review ls aliases review list", async () => {
		const run = await runRoaster(["review", "ls", "--format", "json"], { context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource() }, keys: [REVIEW_KEY] }) });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout).data.keys).toEqual([REVIEW_KEY]);
	});

	test("review list --applicable filters by changed paths", async () => {
		const run = await runRoaster(["review", "list", "--applicable", "--base-ref", "master", "--format", "json"], {
			context: contextWithCatalog({ sources: applicableSources(), keys: ["dignified-python", "typescript-style"], diff: diffForPath("src/app.ts") }),
		});
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout).data.keys).toEqual(["typescript-style"]);
	});

	test("review list fails on invalid review definition", async () => {
		const run = await runRoaster(["review", "list", "--format", "json"], { context: contextWithCatalog({ sources: { bad: "not frontmatter" }, keys: ["bad"] }) });
		expect(run.exitCode).toBe(2);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.error_type).toBe("review_definition_invalid");
	});

	test("review run succeeds with explicit model and emits progress to stderr", async () => {
		const finding: ReviewFinding = { path: "app.py", line: 1, severity: "warning", summary: "Avoid print", details: "Use click.echo()." };
		const run = await runRoaster(["review", "run", REVIEW_KEY, "--model", "opus", "--format", "json"], {
			context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource() }, response: { payload: createFindingsReview([finding]), usage: null, inputCoverage: null } }),
		});
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toContain("resolved model=opus base_ref=master changed_paths=1");
		const data = JSON.parse(run.stdout).data;
		expect(data.reviewName).toBe(REVIEW_KEY);
		expect(data.reviewPath).toBe("/repo/reviews/dignified-python.md");
		expect(data.baseRef).toBe("master");
		expect(data.model).toBe("opus");
		expect(data.inputCoverage).toBeNull();
		expect(data.findings[0].summary).toBe("Avoid print");
		expect(data.payload).toBeUndefined();
		expect(data.review_name).toBeUndefined();
		expect(data.base_ref).toBeUndefined();
	});

	test("review run uses default model and fails when no model is available", async () => {
		const success = await runRoaster(["review", "run", REVIEW_KEY, "--format", "json"], { context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource() } }) });
		expect(success.exitCode).toBe(0);
		expect(JSON.parse(success.stdout).data.model).toBe("sonnet");

		const failure = await runRoaster(["review", "run", REVIEW_KEY, "--format", "json"], { context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource({ defaultModel: null }) } }) });
		expect(failure.exitCode).toBe(2);
		expect(JSON.parse(failure.stdout).error_type).toBe("model_not_provided");
	});
});

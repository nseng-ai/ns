import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { RoasterContext } from "../../src/context.ts";
import { FakeReviewRunnerGateway } from "../../src/gateways/review-runner.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway } from "../../src/gateways/review-log.ts";
import {
	createFindingsReview,
	createLocalDiff,
	type LocalDiff,
	type ReviewExecutionResponse,
	type ReviewFinding,
	type ReviewInputCoverage,
	type ReviewUsage,
} from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

const REVIEW_KEY = "dignified-python-tripwire";

interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

async function runRoaster(
	args: readonly string[],
	options: {
		readonly context?: RoasterContext;
		readonly stdin?: string;
	} = {},
): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const baseContext = options.context ?? fakeRoasterContext();
	const context: RoasterContext = {
		...baseContext,
		stdin: async () => options.stdin ?? "",
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	const exitCode = await runCli(args, { context });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

function sampleSource(
	options: {
		readonly modelProfile?: string | null;
		readonly description?: string;
		readonly appliesTo?: string;
		readonly localOnly?: boolean | undefined;
	} = {},
): string {
	const modelProfile = options.modelProfile === undefined ? "quick" : options.modelProfile;
	return [
		"---",
		`description: ${options.description ?? "Review Python diffs for style violations."}`,
		...(modelProfile === null ? [] : [`model_profile: ${modelProfile}`]),
		...(options.localOnly === true ? ["local_only: true"] : []),
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
		"dignified-python-tripwire": sampleSource({
			appliesTo: "applies_to:\n  include:\n    - '**/*.py'\n  exclude:\n    - '**/tests/**/*.py'",
		}),
		"typescript-style": sampleSource({
			description: "Review TypeScript diffs for style violations.",
			appliesTo: "applies_to:\n  include:\n    - '**/*.ts'\n    - '**/*.tsx'",
		}),
	};
}

function contextWithCatalog(
	options: {
		readonly sources: Record<string, string>;
		readonly keys?: readonly string[];
		readonly diff?: LocalDiff;
		readonly response?: ReviewExecutionResponse;
		readonly reviewLog?: FakeReviewLogGateway;
	} = { sources: { [REVIEW_KEY]: sampleSource() } },
) {
	return fakeRoasterContext({
		reviewCatalog: new FakeReviewCatalogGateway({
			reviewSourcesByKey: options.sources,
			reviewKeys: options.keys,
			reviewsDir: "/repo/.sdl/reviews",
		}),
		localDiff: new FakeLocalDiffGateway({
			defaultDiff: { type: "ok", value: options.diff ?? diffForPath("app.py") },
		}),
		reviewRunner: new FakeReviewRunnerGateway({
			defaultResult: {
				type: "ok",
				value: options.response ?? {
					payload: createFindingsReview([]),
					usage: null,
					inputCoverage: null,
				},
			},
		}),
		...(options.reviewLog === undefined ? {} : { reviewLog: options.reviewLog }),
	});
}

function sampleUsage(): ReviewUsage {
	return {
		inputTokens: 10,
		outputTokens: 5,
		cacheCreationInputTokens: 2,
		cacheReadInputTokens: 3,
		totalCostUsd: 0.0123,
		durationMs: 1500,
		numTurns: 2,
	};
}

function sampleInputCoverage(): ReviewInputCoverage {
	return {
		fullDiffEstimatedTokens: 100,
		promptDiffTokenCap: 80,
		promptDiffFileTokenCap: 50,
		changedPathCount: 2,
		includedFileCount: 1,
		omittedFileCount: 1,
		omittedFiles: [
			{
				path: "large.py",
				changeKind: "modified",
				byteSize: 1000,
				estimatedTokens: 90,
				addedLines: 10,
				removedLines: 1,
				reason: "file-exceeds-cap",
			},
		],
	};
}

describe("roaster review CLI", () => {
	test("root help exposes review and hides exec", async () => {
		const run = await runRoaster(["--help"]);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("review");
		expect(run.stdout).not.toContain("exec");
	});

	test("provided context supplies CLI I/O and ignores top-level overrides", async () => {
		const contextStdout: string[] = [];
		const topStdout: string[] = [];
		const context = fakeRoasterContext({
			stdout: (text) => contextStdout.push(text),
			stderr: () => undefined,
		});

		const exitCode = await runCli(["--help"], {
			context,
			cwd: "/ignored",
			env: { ROASTER_TOP_LEVEL: "ignored" },
			stdin: async () => "ignored",
			stdout: (text) => topStdout.push(text),
			stderr: () => undefined,
		});

		expect(exitCode).toBe(0);
		expect(contextStdout.join("")).toContain("review");
		expect(topStdout).toEqual([]);
	});

	test("default context supplies top-level CLI I/O", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];

		const exitCode = await runCli(["--help"], {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("review");
		expect(stderr).toEqual([]);
	});

	test("review list renders human output", async () => {
		const run = await runRoaster(["review", "list"], {
			context: contextWithCatalog({
				sources: applicableSources(),
				keys: ["dignified-python-tripwire", "typescript-style"],
			}),
		});
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("Reviews directory: /repo/.sdl/reviews");
		expect(run.stdout).toContain("Reviews: 2");
		expect(run.stdout).toContain("Tripwires: 2");
		expect(run.stdout).toContain(
			"- dignified-python-tripwire: Review Python diffs for style violations. (model profile: quick)",
		);
	});

	test("review list JSON includes keys and count", async () => {
		const run = await runRoaster(["review", "list", "--format", "json"], {
			context: contextWithCatalog({
				sources: applicableSources(),
				keys: ["dignified-python-tripwire", "typescript-style"],
			}),
		});
		expect(run.exitCode).toBe(0);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.data.keys).toEqual(["dignified-python-tripwire", "typescript-style"]);
		expect(envelope.data.count).toBe(2);
		expect(envelope.data.reviews[0].modelProfile).toBe("quick");
		expect(envelope.data.reviews[0].localOnly).toBe(false);
	});

	test("review ls aliases review list", async () => {
		const run = await runRoaster(["review", "ls", "--format", "json"], {
			context: contextWithCatalog({
				sources: { [REVIEW_KEY]: sampleSource() },
				keys: [REVIEW_KEY],
			}),
		});
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout).data.keys).toEqual([REVIEW_KEY]);
	});

	test("review list --ci omits local-only reviews", async () => {
		const run = await runRoaster(["review", "list", "--ci", "--format", "json"], {
			context: contextWithCatalog({
				sources: {
					"local-architecture": sampleSource({ localOnly: true }),
					"typescript-style": sampleSource({
						description: "Review TypeScript diffs for style violations.",
					}),
				},
				keys: ["local-architecture", "typescript-style"],
			}),
		});

		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout).data.keys).toEqual(["typescript-style"]);
	});

	test("review list --applicable filters by changed paths", async () => {
		const run = await runRoaster(
			["review", "list", "--applicable", "--base-ref", "master", "--format", "json"],
			{
				context: contextWithCatalog({
					sources: applicableSources(),
					keys: ["dignified-python-tripwire", "typescript-style"],
					diff: diffForPath("src/app.ts"),
				}),
			},
		);
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout).data.keys).toEqual(["typescript-style"]);
	});

	test("review list --ci and --applicable both filter discovered reviews", async () => {
		const run = await runRoaster(
			["review", "list", "--ci", "--applicable", "--base-ref", "master", "--format", "json"],
			{
				context: contextWithCatalog({
					sources: {
						"local-typescript": sampleSource({
							localOnly: true,
							appliesTo: "applies_to:\n  include:\n    - '**/*.ts'",
						}),
						"typescript-style": sampleSource({
							description: "Review TypeScript diffs for style violations.",
							appliesTo: "applies_to:\n  include:\n    - '**/*.ts'",
						}),
						"dignified-python-tripwire": sampleSource({
							appliesTo: "applies_to:\n  include:\n    - '**/*.py'",
						}),
					},
					keys: ["local-typescript", "typescript-style", "dignified-python-tripwire"],
					diff: diffForPath("src/app.ts"),
				}),
			},
		);

		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout).data.keys).toEqual(["typescript-style"]);
	});

	test("review list fails on invalid review definition", async () => {
		const run = await runRoaster(["review", "list", "--format", "json"], {
			context: contextWithCatalog({ sources: { bad: "not frontmatter" }, keys: ["bad"] }),
		});
		expect(run.exitCode).toBe(2);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.errorType).toBe("review-definition-invalid");
	});

	test("review run succeeds with explicit model and emits progress to stderr", async () => {
		const finding: ReviewFinding = {
			path: "app.py",
			line: 1,
			severity: "warning",
			summary: "Avoid print",
			details: "Use click.echo().",
		};
		const run = await runRoaster(
			["review", "run", REVIEW_KEY, "--model", "opus", "--format", "json"],
			{
				context: contextWithCatalog({
					sources: { [REVIEW_KEY]: sampleSource() },
					response: { payload: createFindingsReview([finding]), usage: null, inputCoverage: null },
				}),
			},
		);
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toContain(
			"resolved model=opus model_profile=quick base_ref=master changed_paths=1",
		);
		const data = JSON.parse(run.stdout).data;
		expect(data.reviewName).toBe(REVIEW_KEY);
		expect(data.reviewPath).toBe("/repo/.sdl/reviews/dignified-python-tripwire.md");
		expect(data.baseRef).toBe("master");
		expect(data.modelProfile).toBe("quick");
		expect(data.model).toBe("opus");
		expect(data.inputCoverage).toBeNull();
		expect(data.findings[0].summary).toBe("Avoid print");
		expect(data.payload).toBeUndefined();
		expect(data.review_name).toBeUndefined();
		expect(data.base_ref).toBeUndefined();
	});

	test("review run logs successful reviews to Branch Memory by default", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const finding: ReviewFinding = {
			path: "app.py",
			line: 1,
			severity: "warning",
			summary: "Avoid print",
			details: "Use click.echo().",
		};
		const run = await runRoaster(["review", "run", REVIEW_KEY, "--model", "opus"], {
			context: contextWithCatalog({
				sources: { [REVIEW_KEY]: sampleSource() },
				reviewLog,
				response: {
					payload: createFindingsReview([finding]),
					usage: sampleUsage(),
					inputCoverage: sampleInputCoverage(),
				},
			}),
		});

		expect(run.exitCode).toBe(0);
		const entries = reviewLog.writtenEntries();
		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry?.namespace).toBe("roaster");
		expect(entry?.branch).toBe("feature");
		expect(entry?.key).toMatch(/^reviews\/dignified-python-tripwire\/\d{4}-\d{2}-\d{2}T/);
		expect(entry?.content).toContain("# Roaster Tripwire: dignified-python-tripwire");
		expect(entry?.content).toContain("- Review key: `dignified-python-tripwire`");
		expect(entry?.content).toContain("- Base ref: `master`");
		expect(entry?.content).toContain("- Model profile: `quick`");
		expect(entry?.content).toContain("- Model: `opus`");
		expect(entry?.content).toContain("- Findings: 1");
		expect(entry?.content).toContain("Avoid print");
		expect(entry?.content).toContain("Use click.echo().");
		expect(entry?.content).toContain("## Usage");
		expect(entry?.content).toContain("## Input Coverage");
		expect(entry?.content).not.toContain("```json");
		expect(entry?.content).not.toContain("payload");
	});

	test("review run accepts an explicit Branch Memory log branch", async () => {
		const reviewLog = new FakeReviewLogGateway();
		const run = await runRoaster(
			["review", "run", REVIEW_KEY, "--model", "opus", "--log-branch", "pr/head"],
			{
				context: contextWithCatalog({
					sources: { [REVIEW_KEY]: sampleSource() },
					reviewLog,
				}),
			},
		);

		expect(run.exitCode).toBe(0);
		const entries = reviewLog.writtenEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.branch).toBe("pr/head");
		expect(entries[0]?.entryLocator).toContain("refs/brmem/ns/roaster/pr---head:");
		expect(entries[0]?.content).toContain("- Branch: `pr/head`");
	});

	test("review run logging failure exits nonzero and preserves review result", async () => {
		const reviewLog = new FakeReviewLogGateway({
			writeFailure: {
				type: "review-log-write-failed",
				message: "brmem put failed while writing roaster review log: missing brmem",
			},
		});
		const run = await runRoaster(
			["review", "run", REVIEW_KEY, "--model", "opus", "--format", "json"],
			{
				context: contextWithCatalog({
					sources: { [REVIEW_KEY]: sampleSource() },
					reviewLog,
				}),
			},
		);

		expect(run.exitCode).toBe(1);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.exitCode).toBe(1);
		expect(envelope.message).toContain("failed to write Branch Memory review log");
		expect(envelope.data.reviewName).toBe(REVIEW_KEY);
		expect(envelope.data.findings).toEqual([]);

		const human = await runRoaster(["review", "run", REVIEW_KEY, "--model", "opus"], {
			context: contextWithCatalog({
				sources: { [REVIEW_KEY]: sampleSource() },
				reviewLog,
			}),
		});
		expect(human.exitCode).toBe(1);
		expect(human.stderr).toContain("Tripwire: dignified-python-tripwire");
		expect(human.stderr).toContain("failed to write Branch Memory review log");
	});

	test("review run resolves model profiles and rejects unknown profiles", async () => {
		const success = await runRoaster(["review", "run", REVIEW_KEY, "--format", "json"], {
			context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource() } }),
		});
		expect(success.exitCode).toBe(0);
		expect(JSON.parse(success.stdout).data.modelProfile).toBe("quick");
		expect(JSON.parse(success.stdout).data.model).toBe("haiku");

		const reviewLog = new FakeReviewLogGateway();
		const failure = await runRoaster(["review", "run", REVIEW_KEY, "--format", "json"], {
			context: contextWithCatalog({
				sources: { [REVIEW_KEY]: sampleSource({ modelProfile: "missing" }) },
				reviewLog,
			}),
		});
		expect(failure.exitCode).toBe(2);
		expect(JSON.parse(failure.stdout).errorType).toBe("review-definition-invalid");
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("review log lists entries and filters by review key", async () => {
		const reviewLog = new FakeReviewLogGateway({
			entries: [
				{ key: "reviews/dignified-python-tripwire/2026-06-20T18-42-11-123Z.md" },
				{ key: "reviews/typescript-style/2026-06-20T18-43-11-123Z.md" },
			],
		});
		const all = await runRoaster(["review", "log"], {
			context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource() }, reviewLog }),
		});
		expect(all.exitCode).toBe(0);
		expect(all.stdout).toContain("Roaster review logs: 2");
		expect(all.stdout).toContain("reviews/typescript-style/2026-06-20T18-43-11-123Z.md");
		expect(all.stdout).toContain(
			"brmem get reviews/dignified-python-tripwire/2026-06-20T18-42-11-123Z.md --namespace roaster",
		);

		const filtered = await runRoaster(["review", "log", REVIEW_KEY, "--format", "json"], {
			context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource() }, reviewLog }),
		});
		expect(filtered.exitCode).toBe(0);
		const data = JSON.parse(filtered.stdout).data;
		expect(data.count).toBe(1);
		expect(data.reviewKey).toBe(REVIEW_KEY);
		expect(data.entries[0].entryKey).toBe(
			"reviews/dignified-python-tripwire/2026-06-20T18-42-11-123Z.md",
		);
		expect(data.entries[0].entryLocator).toContain("refs/brmem/ns/roaster/");
		expect(data.entries[0].ranAt).toBe("2026-06-20T18:42:11.123Z");
	});

	test("review log reports an informative empty result", async () => {
		const run = await runRoaster(["review", "log"], {
			context: contextWithCatalog({ sources: { [REVIEW_KEY]: sampleSource() } }),
		});
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("No roaster review logs found for this branch.");
	});
});

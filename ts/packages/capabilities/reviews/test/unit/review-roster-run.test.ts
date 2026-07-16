import { describe, expect, test } from "vitest";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { createReviewsRuntime } from "../../src/core/context.ts";
import {
	createFindingsReview,
	createRevisionRangeLocalDiff,
	type DiffFile,
	type ReviewFinding,
	type ReviewInputCoverage,
	type ReviewRosterProgressEvent,
} from "../../src/core/models.ts";
import { runReviewRoster } from "../../src/operations/review-roster-run.ts";
import { FakeLocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway } from "../../src/gateways/review-log.ts";
import { FakeReviewRunnerGateway } from "../../src/gateways/review-runner.ts";
import { fakeReviewsContext } from "../support/fake-reviews-context.ts";

const RANGE = "stack-base..stack-head";
const FINDING: ReviewFinding = {
	path: "src/app.ts",
	line: 3,
	severity: "warning",
	summary: "Repeated finding",
	details: "Preserve this text verbatim.",
};
const COVERAGE: ReviewInputCoverage = {
	fullDiffEstimatedTokens: 20,
	promptDiffTokenCap: 10,
	promptDiffFileTokenCap: 8,
	changedPathCount: 2,
	includedFileCount: 1,
	omittedFileCount: 1,
	omittedFiles: [
		{
			path: "src/large.ts",
			changeKind: "modified",
			byteSize: 1_000,
			estimatedTokens: 250,
			addedLines: 20,
			removedLines: 2,
			reason: "diff-budget-exhausted",
		},
	],
};

function source(name: string, include = "**/*.ts"): string {
	return `---\ndescription: Review ${name}.\nmodel_profile: fast\napplies_to:\n  include:\n    - '${include}'\n---\n\nFlag issues.\n`;
}

function file(path: string): DiffFile {
	const rawText = `diff --git a/${path} b/${path}\n+changed\n`;
	return {
		path,
		oldPath: null,
		changeKind: "modified",
		rawText,
		isBinary: false,
		addedLines: 1,
		removedLines: 0,
		hunkCount: 1,
		byteSize: rawText.length,
		estimatedTokens: 5,
	};
}

describe("runReviewRoster", () => {
	test.each(["   ", " --stat", "-c core.fsmonitor=true"])(
		"rejects unsafe revision range %j before loading dependencies",
		async (revisionRange) => {
			const localDiff = new FakeLocalDiffGateway();
			const result = await runReviewRoster(
				createReviewsRuntime(fakeReviewsContext({ localDiff })),
				{ revisionRange, roster: [{ reviewKey: "first", selected: true }] },
			);
			expect(result).toMatchObject({ ok: false, error: { code: "review-roster-invalid" } });
			expect(localDiff.requestedSelections()).toEqual([]);
		},
	);

	test("loads one range diff, follows confirmed order, attributes duplicates, and writes no logs", async () => {
		const tsFile = file("src/app.ts");
		const diff = createRevisionRangeLocalDiff({
			revisionRange: RANGE,
			diffText: tsFile.rawText,
			files: [tsFile],
		});
		const localDiff = new FakeLocalDiffGateway({ defaultDiff: { ok: true, value: diff } });
		const reviewRunner = new FakeReviewRunnerGateway({
			resultsByReviewName: {
				second: {
					ok: true,
					value: {
						payload: createFindingsReview([FINDING, FINDING]),
						usage: null,
						inputCoverage: COVERAGE,
					},
				},
				third: {
					ok: true,
					value: {
						payload: createFindingsReview([FINDING]),
						usage: null,
						inputCoverage: null,
					},
				},
			},
		});
		const reviewLog = new FakeReviewLogGateway();
		const events: ReviewRosterProgressEvent[] = [];
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				clock: createManualClock(Date.parse("2026-07-16T15:30:00.000Z")).clock,
				localDiff,
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: {
						first: source("first"),
						second: source("second"),
						third: source("third"),
					},
					reviewKeys: ["first", "second", "third"],
				}),
				reviewRunner,
				reviewLog,
			}),
		);

		const result = await runReviewRoster(
			ctx,
			{
				revisionRange: RANGE,
				roster: [
					{ reviewKey: "second", selected: true },
					{ reviewKey: "first", selected: false },
					{ reviewKey: "third", selected: true },
				],
			},
			{
				onProgress: (event) => {
					events.push(event);
					throw new Error("presentation failed");
				},
			},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error.message);
		expect(localDiff.requestedSelections()).toEqual([
			{ type: "revision-range", revisionRange: RANGE },
		]);
		expect(reviewRunner.calls().map((call) => call.request.reviewDefinition.name)).toEqual([
			"second",
			"third",
		]);
		expect(result.value).toMatchObject({
			revisionRange: RANGE,
			ranAt: "2026-07-16T15:30:00.000Z",
			entries: [
				{ reviewKey: "second", state: "completed", inputCoverage: COVERAGE },
				{ reviewKey: "first", state: "toggled-off" },
				{ reviewKey: "third", state: "completed" },
			],
		});
		expect(result.value.findings.map((finding) => finding.occurrence)).toEqual([0, 1, 0]);
		expect(result.value.findings[0]).toMatchObject({ reviewKey: "second", ...FINDING });
		expect(events).toEqual([
			{ type: "review-started", reviewKey: "second", position: 0 },
			{
				type: "review-completed",
				reviewKey: "second",
				position: 0,
				findingCount: 2,
				inputCoverage: COVERAGE,
			},
			{ type: "review-started", reviewKey: "third", position: 2 },
			{
				type: "review-completed",
				reviewKey: "third",
				position: 2,
				findingCount: 1,
				inputCoverage: null,
			},
		]);
		expect(reviewLog.writtenEntries()).toEqual([]);
	});

	test("continues after definition, model-resolution, and runner failures", async () => {
		const tsFile = file("src/app.ts");
		const reviewRunner = new FakeReviewRunnerGateway({
			resultsByReviewName: {
				runner: { ok: false, error: { code: "review-execution-failed", message: "runner failed" } },
			},
		});
		const ctx = createReviewsRuntime(
			fakeReviewsContext({
				localDiff: new FakeLocalDiffGateway({
					defaultDiff: {
						ok: true,
						value: createRevisionRangeLocalDiff({
							revisionRange: RANGE,
							diffText: tsFile.rawText,
							files: [tsFile],
						}),
					},
				}),
				reviewCatalog: new FakeReviewCatalogGateway({
					reviewSourcesByKey: {
						malformed: "not frontmatter",
						model: source("model").replace("fast", "unknown"),
						runner: source("runner"),
						later: source("later"),
					},
					reviewKeys: ["malformed", "model", "runner", "later"],
				}),
				reviewRunner,
			}),
		);

		const result = await runReviewRoster(ctx, {
			revisionRange: RANGE,
			roster: [
				{ reviewKey: "malformed", selected: false },
				{ reviewKey: "model", selected: true },
				{ reviewKey: "runner", selected: true },
				{ reviewKey: "later", selected: true },
			],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error.message);
		expect(
			result.value.entries.map((entry) => (entry.state === "failed" ? entry.stage : entry.state)),
		).toEqual(["definition", "model-resolution", "runner", "completed"]);
		expect(reviewRunner.calls().map((call) => call.request.reviewDefinition.name)).toEqual([
			"runner",
			"later",
		]);
	});

	test("shared config, diff, and catalog failures start no runner", async () => {
		const cases = [
			{
				name: "config",
				context: {
					gitGateway: new InMemoryGitGateway({
						repoRoot: {
							type: "failure",
							error: { code: "git-failed", message: "no repository" },
						},
					}),
				},
			},
			{
				name: "diff",
				context: {
					localDiff: new FakeLocalDiffGateway({
						defaultDiff: {
							ok: false,
							error: { code: "git-diff-failed", message: "bad range" },
						},
					}),
				},
			},
			{
				name: "catalog",
				context: {
					reviewCatalog: new FakeReviewCatalogGateway({
						listReviewKeysFailure: { code: "reviews-dir-missing", message: "no catalog" },
					}),
				},
			},
		] as const;

		for (const failureCase of cases) {
			const reviewRunner = new FakeReviewRunnerGateway();
			const ctx = createReviewsRuntime(
				fakeReviewsContext({ ...failureCase.context, reviewRunner }),
			);
			const result = await runReviewRoster(ctx, {
				revisionRange: RANGE,
				roster: [{ reviewKey: "first", selected: true }],
			});

			expect(result.ok, failureCase.name).toBe(false);
			expect(reviewRunner.calls(), failureCase.name).toEqual([]);
		}
	});

	test("rejects incomplete, duplicate, unknown, and non-applicable rosters before execution", async () => {
		const tsFile = file("src/app.ts");
		for (const roster of [
			[{ reviewKey: "first", selected: true }],
			[
				{ reviewKey: "first", selected: true },
				{ reviewKey: "first", selected: false },
			],
			[
				{ reviewKey: "first", selected: true },
				{ reviewKey: "missing", selected: true },
			],
			[
				{ reviewKey: "first", selected: true },
				{ reviewKey: "docs", selected: true },
			],
		]) {
			const reviewRunner = new FakeReviewRunnerGateway();
			const ctx = createReviewsRuntime(
				fakeReviewsContext({
					localDiff: new FakeLocalDiffGateway({
						defaultDiff: {
							ok: true,
							value: createRevisionRangeLocalDiff({
								revisionRange: RANGE,
								diffText: tsFile.rawText,
								files: [tsFile],
							}),
						},
					}),
					reviewCatalog: new FakeReviewCatalogGateway({
						reviewSourcesByKey: {
							first: source("first"),
							second: source("second"),
							docs: source("docs", "**/*.md"),
						},
						reviewKeys: ["first", "second", "docs"],
					}),
					reviewRunner,
				}),
			);
			const result = await runReviewRoster(ctx, { revisionRange: RANGE, roster });
			expect(result).toMatchObject({ ok: false, error: { code: "review-roster-invalid" } });
			expect(reviewRunner.calls()).toEqual([]);
		}
	});
});

import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { PRDiscussionComment, PRReview, PRReviewThread } from "../../src/gateways.ts";
import { normalizePayloadBytes } from "../support/golden.ts";
import { InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";
import { fixedClock, runScenario, type ScenarioRun } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

interface FixtureArtifact {
	relative_path: string;
	text: string;
}

interface StackFeedbackPrepCase {
	name: string;
	args: string[];
	payload_env: "session" | "root-only" | null;
	expected_exit_code: number;
	expected_envelope_text: string;
	artifacts?: FixtureArtifact[];
}

interface StackFeedbackPrepFixture {
	clock_iso: string;
	session_id: string;
	gateway: {
		reviews: Record<string, PRReview[]>;
		review_threads: Record<string, PRReviewThread[]>;
		discussion_comments: Record<string, PRDiscussionComment[]>;
	};
	cases: StackFeedbackPrepCase[];
}

interface StackFeedbackPlanCase {
	name: string;
	extra_args: string[];
	payload_json_template: string;
	payload_env: "session" | "root-only" | null;
	expected_exit_code: number;
	expected_envelope_text: string;
	artifacts?: FixtureArtifact[];
}

interface StackFeedbackPlanFixture {
	clock_iso: string;
	session_id: string;
	cases: StackFeedbackPlanCase[];
}

const FIXTURE_DIR = new URL("../fixtures/stack-orchestration/", import.meta.url);
const prepFixture = JSON.parse(await readFile(new URL("stack-feedback-prep.json", FIXTURE_DIR), "utf8")) as StackFeedbackPrepFixture;
const planFixture = JSON.parse(await readFile(new URL("stack-feedback-plan.json", FIXTURE_DIR), "utf8")) as StackFeedbackPlanFixture;

const makeTempDir = useTempDirs();

async function makePayloadRoot(): Promise<string> {
	return join(await makeTempDir("pr-address-stack-feedback-"), "payload-root");
}

async function makeScratchDir(): Promise<string> {
	return makeTempDir("pr-address-stack-feedback-input-");
}

function fixtureGithubGateway(): InMemoryPrAddressGitHubGateway {
	return new InMemoryPrAddressGitHubGateway({
		reviews: numberKeyed(prepFixture.gateway.reviews),
		reviewThreads: numberKeyed(prepFixture.gateway.review_threads),
		discussionComments: numberKeyed(prepFixture.gateway.discussion_comments),
	});
}

function numberKeyed<T>(record: Record<string, T>): Map<number, T> {
	return new Map(Object.entries(record).map(([key, value]) => [Number(key), value]));
}

function withFullStdout(args: readonly string[]): string[] {
	return args.includes("--stdout-mode") ? [...args] : [...args, "--stdout-mode", "full"];
}

function payloadEnv(mode: "session" | "root-only" | null, root: string | null, sessionId: string): NodeJS.ProcessEnv {
	if (mode === null || root === null) return { PATH: "/fake/bin" };
	if (mode === "session") return { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: sessionId };
	return { ASDL_PAYLOAD_ROOT: root };
}

async function expectArtifacts(root: string, artifacts: readonly FixtureArtifact[]): Promise<void> {
	for (const artifact of artifacts) {
		const actualText = await readFile(join(root, artifact.relative_path), "utf8");
		const expectedText = artifact.text.replaceAll("{ROOT}", root);
		expect(normalizePayloadBytes(actualText), artifact.relative_path).toBe(normalizePayloadBytes(expectedText));
	}
}

function expectNestedCompactEnvelope(actualText: string, expectedLegacyText: string): void {
	const actual = JSON.parse(actualText) as { data: Record<string, unknown> };
	const expected = JSON.parse(expectedLegacyText) as { data: Record<string, unknown> };
	const { operation, counts, artifacts, details: _legacyDuplicateDetails, ...expectedDetails } = expected.data;
	const actualArtifacts = actual.data.artifacts as { full_output?: { descriptor?: string }; produced?: unknown };
	const expectedArtifacts = artifacts as { produced?: unknown } | undefined;
	expect(actual.data.operation).toBe(operation);
	expect(actual.data.counts).toEqual(counts);
	expect(actualArtifacts.full_output?.descriptor).toMatch(/^pr-address-command-.*-output$/);
	expect(stripPayloadBytes(actualArtifacts.produced ?? [])).toEqual(stripPayloadBytes(expectedArtifacts?.produced ?? []));
	expect(stripPayloadBytes(actual.data.details)).toEqual(stripPayloadBytes(expectedDetails));
}

function stripPayloadBytes(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripPayloadBytes);
	if (typeof value !== "object" || value === null) return value;
	const result: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (key === "payload_bytes") result[key] = 0;
		else result[key] = stripPayloadBytes(item);
	}
	return result;
}

describe("stack-feedback-prep parity with the Python CLI", () => {
	for (const prepCase of prepFixture.cases) {
		test(`matches the Python envelope for ${prepCase.name}`, async () => {
			const root = prepCase.payload_env === null ? null : await makePayloadRoot();
			const run = runScenario(["exec", ...withFullStdout(prepCase.args)], {
				github: fixtureGithubGateway(),
				env: payloadEnv(prepCase.payload_env, root, prepFixture.session_id),
				payloadClock: fixedClock(prepFixture.clock_iso),
			});

			expect(await run.exit).toBe(prepCase.expected_exit_code);
			const expectedEnvelope = root === null ? prepCase.expected_envelope_text : prepCase.expected_envelope_text.replaceAll("{ROOT}", root);
			if (prepCase.name.includes("compact") && prepCase.expected_exit_code === 0) expectNestedCompactEnvelope(run.stdout.join(""), expectedEnvelope);
			else expect(normalizePayloadBytes(run.stdout.join(""))).toBe(normalizePayloadBytes(expectedEnvelope));
			if (prepCase.artifacts !== undefined && root !== null) await expectArtifacts(root, prepCase.artifacts);
		});
	}

	test("reports the stack summary reference size from the real artifact", async () => {
		const root = await makePayloadRoot();
		const run = runScenario(["exec", "stack-feedback-prep", "--stack-json", stackInputJson(), "--format", "json", "--stdout-mode", "full"], {
			github: fixtureGithubGateway(),
			env: payloadEnv("session", root, prepFixture.session_id),
			payloadClock: fixedClock(prepFixture.clock_iso),
		});

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as { data: { stack_summary_reference: { payload_path: string; payload_bytes: number } } };
		const reference = envelope.data.stack_summary_reference;
		expect(reference.payload_bytes).toBe((await stat(reference.payload_path)).size);
	});

	test("concurrent fetch failures resolve to the first failure in input order", async () => {
		const root = await makePayloadRoot();
		const github = new InMemoryPrAddressGitHubGateway({
			reviews: numberKeyed(prepFixture.gateway.reviews),
			reviewThreads: numberKeyed(prepFixture.gateway.review_threads),
			discussionComments: numberKeyed(prepFixture.gateway.discussion_comments),
			discussionCommentsFailurePrNumbers: new Set([101]),
			reviewsFailurePrNumbers: new Set([102]),
		});
		const run = runScenario(["exec", "stack-feedback-prep", "--stack-json", stackInputJson(), "--format", "json"], {
			github,
			env: payloadEnv("session", root, prepFixture.session_id),
			payloadClock: fixedClock(prepFixture.clock_iso),
		});

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("pr_gateway_failure");
		// PR 101 fails on its third gateway call while PR 102 fails on its
		// first; input order, not completion order, decides the reported
		// failure.
		expect(envelope.message).toBe("Failed to fetch discussion comments for PR 101: gh auth failed");
	});

	test("rejects unknown options without invoking the gateway", async () => {
		const run = runScenario(["exec", "stack-feedback-prep", "--bogus", "--format", "json"], {
			github: fixtureGithubGateway(),
			env: { PATH: "/fake/bin" },
			payloadClock: fixedClock(prepFixture.clock_iso),
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown option '--bogus'\n");
		// PINNED CLINKR SEMANTICS: unknown options are a raw commander usage
		// error, never a machine envelope — click parity.
	});
});

describe("stack-feedback-prep stack-reference input", () => {
	function runPrep(args: readonly string[], root: string, stdin = ""): ScenarioRun {
		return runScenario(["exec", "stack-feedback-prep", ...args, "--format", "json"], {
			github: fixtureGithubGateway(),
			env: payloadEnv("session", root, prepFixture.session_id),
			payloadClock: fixedClock(prepFixture.clock_iso),
			stdin,
		});
	}

	function errorEnvelope(run: ScenarioRun): { error_type: string; message: string } {
		return JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
	}

	test("reads the same stack from --stack-reference without reading stdin", async () => {
		const rootFromStdin = await makePayloadRoot();
		const stdinRun = runPrep(["--stdout-mode", "compact"], rootFromStdin, stackInputJson());
		expect(await stdinRun.exit).toBe(0);
		const stdinEnvelope = JSON.parse(stdinRun.stdout.join("")) as { data: { details: { summary: unknown; stack: unknown } } };

		const scratch = await makeScratchDir();
		const stackPath = join(scratch, "stack.json");
		await writeFile(stackPath, stackInputJson(), "utf8");
		const rootFromReference = await makePayloadRoot();
		const referenceRun = runPrep(["--stack-reference", stackPath, "--stdout-mode", "compact"], rootFromReference, "this is not json and must not be read");

		expect(await referenceRun.exit).toBe(0);
		const referenceEnvelope = JSON.parse(referenceRun.stdout.join("")) as { data: { details: { summary: unknown; stack: Array<{ pr_number: number; branch: string; counts: unknown }> } } };
		expect(referenceEnvelope.data.details.summary).toEqual(stdinEnvelope.data.details.summary);
		expect(referenceEnvelope.data.details.stack.map((item) => ({ pr_number: item.pr_number, branch: item.branch, counts: item.counts }))).toEqual(
			(stdinEnvelope.data.details.stack as Array<{ pr_number: number; branch: string; counts: unknown }>).map((item) => ({ pr_number: item.pr_number, branch: item.branch, counts: item.counts })),
		);
	});

	test("rejects --stack-reference combined with --stack-json", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const stackPath = join(scratch, "stack.json");
		await writeFile(stackPath, stackInputJson(), "utf8");

		const run = runPrep(["--stack-reference", stackPath, "--stack-json", stackInputJson()], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix --stack-json with --stack-reference");
	});

	test("rejects missing and malformed --stack-reference artifacts", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();

		const missingRun = runPrep(["--stack-reference", join(scratch, "missing.json")], root);
		expect(await missingRun.exit).toBe(2);
		expect(errorEnvelope(missingRun).message).toContain("must point to an existing file");

		const malformedPath = join(scratch, "malformed.json");
		await writeFile(malformedPath, "{", "utf8");
		const malformedRun = runPrep(["--stack-reference", malformedPath], root);
		expect(await malformedRun.exit).toBe(2);
		expect(errorEnvelope(malformedRun).error_type).toBe("invalid_json");
	});

	test("rejects a --stack-reference artifact with the wrong shape", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const stackPath = join(scratch, "wrong.json");
		await writeFile(stackPath, JSON.stringify({ branch_prs: [] }), "utf8");

		const run = runPrep(["--stack-reference", stackPath], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("Invalid stack-feedback-prep --stack-reference");
	});

	test("combines --stack-reference with --include-resolved", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const stackPath = join(scratch, "stack.json");
		await writeFile(stackPath, stackInputJson(), "utf8");

		const run = runPrep(["--stack-reference", stackPath, "--include-resolved", "--stdout-mode", "compact"], root);

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as { data: { details: { include_resolved: boolean } } };
		expect(envelope.data.details.include_resolved).toBe(true);
	});
});

describe("stack-feedback-plan session-only inputs", () => {
	const validPlanCase = requiredPlanCase("valid-full");

	function runPlan(args: readonly string[], root: string): ScenarioRun {
		return runScenario(["exec", "stack-feedback-plan", ...withFullStdout(args), "--format", "json"], {
			env: payloadEnv("session", root, planFixture.session_id),
			payloadClock: fixedClock(planFixture.clock_iso),
		});
	}

	function planTemplate(): { prep: unknown; classifications: unknown } {
		return JSON.parse(validPlanCase.payload_json_template) as { prep: unknown; classifications: unknown };
	}

	function errorEnvelope(run: ScenarioRun): { error_type: string; message: string } {
		return JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
	}

	for (const removedOptionArgs of [["--payload-json", "{}"], ["--payload-file", "payload.json"], ["--prep-reference", "prep.json"]]) {
		test(`rejects removed option ${removedOptionArgs[0]}`, async () => {
			const root = await makePayloadRoot();
			const run = runPlan(removedOptionArgs, root);

			expect(await run.exit).toBe(2);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toContain(`unknown option '${removedOptionArgs[0]}'`);
		});
	}

	test("rejects non-empty stdin", async () => {
		const root = await makePayloadRoot();
		const run = runScenario(["exec", "stack-feedback-plan", "--format", "json", "--stdout-mode", "full"], {
			env: payloadEnv("session", root, planFixture.session_id),
			payloadClock: fixedClock(planFixture.clock_iso),
			stdin: validPlanCase.payload_json_template,
		});

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("stack-feedback-plan");
		expect(envelope.message).toContain("no longer accepts JSON payloads on stdin");
		expect(envelope.message).toContain("payload-session artifacts");
	});

	async function seedStackSession(root: string, classificationsToValidate: "all" | "first-only" = "all"): Promise<void> {
		const prepRun = runScenario(["exec", "stack-feedback-prep", "--stack-json", stackInputJson(), "--format", "json", "--stdout-mode", "full"], {
			github: fixtureGithubGateway(),
			env: payloadEnv("session", root, planFixture.session_id),
			payloadClock: fixedClock(prepFixture.clock_iso),
		});
		expect(await prepRun.exit).toBe(0);
		const prepEnvelope = JSON.parse(prepRun.stdout.join("")) as { data: { stack: Array<{ pr_number: number; manifest: unknown }> } };
		const classifications = (planTemplate().classifications as Array<{ pr_number: number; classification: unknown }>).filter(
			(_item, index) => classificationsToValidate === "all" || index === 0,
		);
		for (const item of classifications) {
			const prepItem = prepEnvelope.data.stack.find((candidate) => candidate.pr_number === item.pr_number);
			if (prepItem === undefined) throw new Error(`missing prep item for PR ${item.pr_number}`);
			const validateRun = runScenario(
				[
					"exec",
					"validate-feedback-classification",
					"--pr-number",
					String(item.pr_number),
					"--classification-json",
					JSON.stringify(item.classification),
					"--format",
					"json",
				],
				{ env: payloadEnv("session", root, planFixture.session_id), payloadClock: fixedClock(planFixture.clock_iso) },
			);
			expect(await validateRun.exit).toBe(0);
		}
	}

	test("resolves latest stack prep and per-PR classifications from the session", async () => {
		const root = await makePayloadRoot();
		await seedStackSession(root);

		const run = runPlan([], root);

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as {
			data: {
				valid: boolean;
				resolved_inputs: {
					prep: { descriptor: string; sequence: number };
					classifications: Array<{ pr_number: number; reference: { descriptor: string; sequence: number } }>;
				};
				stack_plan_reference: { descriptor: string; sequence: number };
			};
		};
		expect(envelope.data.valid).toBe(true);
		expect(envelope.data.resolved_inputs.prep).toMatchObject({ descriptor: "pr-address-stack-prep", sequence: 7 });
		expect(envelope.data.resolved_inputs.classifications).toEqual([
			expect.objectContaining({ pr_number: 101, reference: expect.objectContaining({ descriptor: "pr-address-pr-101-classification", sequence: 8 }) }),
			expect.objectContaining({ pr_number: 102, reference: expect.objectContaining({ descriptor: "pr-address-pr-102-classification", sequence: 10 }) }),
		]);
		expect(envelope.data.stack_plan_reference).toMatchObject({ descriptor: "pr-address-stack-plan", sequence: 12 });
	});

	test("implicit stack planning reports the missing per-PR classification descriptor", async () => {
		const root = await makePayloadRoot();
		await seedStackSession(root, "first-only");

		const run = runPlan([], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("payload_lookup_failed");
		expect(envelope.message).toContain("pr-address-pr-102-classification");
	});
});

describe("stack feedback usage-error guards", () => {
	// PINNED CLINKR SEMANTICS: bogus --stdout-mode values are strict-enum
	// commander usage errors handled in TypeScript; the legacy CLI is reserved
	// for genuinely unknown operation names and is never invoked here.
	for (const usageErrorArgs of [
		["stack-feedback-prep", "--stdout-mode", "bogus"],
		["stack-feedback-plan", "--stdout-mode", "bogus"],
	]) {
		test(`rejects ${usageErrorArgs.join(" ")} without the legacy CLI`, async () => {
			const run = runScenario(["exec", ...usageErrorArgs]);

			expect(await run.exit).toBe(2);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toBe(
				"error: option '--stdout-mode <value>' argument 'bogus' is invalid. Allowed choices are full, compact.\n",
			);
		});
	}
});

function requiredPlanCase(name: string): StackFeedbackPlanCase {
	const planCase = planFixture.cases.find((candidate) => candidate.name === name);
	if (planCase === undefined) throw new Error(`Missing stack-feedback-plan fixture case: ${name}`);
	return planCase;
}

function stackInputJson(): string {
	return JSON.stringify({
		stack: [
			{ pr_number: 101, branch: "branch-one", title: "First", url: "u1" },
			{ pr_number: 102, branch: "branch-two", title: "Second", url: "u2" },
		],
	});
}

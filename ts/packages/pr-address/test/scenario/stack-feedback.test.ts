import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { PayloadClock } from "../../src/payload-store.ts";
import type { LegacyPrAddressGateway } from "../../src/legacy-python.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "../../src/gateways.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";
import { fakePrAddressContext, InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";

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

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makePayloadRoot(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-stack-feedback-"));
	tempDirs.push(dir);
	return join(dir, "payload-root");
}

async function makeScratchDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-stack-feedback-input-"));
	tempDirs.push(dir);
	return dir;
}

function fixedClock(iso: string): PayloadClock {
	const instant = new Date(iso);
	return () => instant;
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

function payloadEnv(mode: "session" | "root-only" | null, root: string | null, sessionId: string): NodeJS.ProcessEnv {
	if (mode === null || root === null) return { PATH: "/fake/bin" };
	if (mode === "session") return { ASDL_PAYLOAD_ROOT: root, ASDL_PAYLOAD_SESSION_ID: sessionId };
	return { ASDL_PAYLOAD_ROOT: root };
}

/**
 * Artifacts that embed the absolute payload root have root-length-dependent
 * byte sizes, so embedded `payload_bytes` values cannot be byte-compared
 * across machines. Callers normalize them and separately assert one reference
 * against the real file size.
 */
function normalizePayloadBytes(text: string): string {
	return text.replace(/"payload_bytes": \d+/g, '"payload_bytes": 0');
}

interface ManagedRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

function runManaged(args: readonly string[], options: { github?: PrAddressGitHubGateway | undefined; env: NodeJS.ProcessEnv; clockIso: string; stdin?: string | undefined }): ManagedRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy: LegacyPrAddressGateway = {
		run: async () => {
			throw new Error("unexpected legacy fallback");
		},
	};
	return {
		exit: runCli(args, {
			context: fakePrAddressContext({ legacy, ...(options.github === undefined ? {} : { github: options.github }), payloadClock: fixedClock(options.clockIso) }),
			cwd: "/repo",
			env: options.env,
			stdin: async () => options.stdin ?? "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

async function expectArtifacts(root: string, artifacts: readonly FixtureArtifact[]): Promise<void> {
	for (const artifact of artifacts) {
		const actualText = await readFile(join(root, artifact.relative_path), "utf8");
		const expectedText = artifact.text.replaceAll("{ROOT}", root);
		expect(normalizePayloadBytes(actualText), artifact.relative_path).toBe(normalizePayloadBytes(expectedText));
	}
}

describe("stack-feedback-prep parity with the Python CLI", () => {
	for (const prepCase of prepFixture.cases) {
		test(`matches the Python envelope for ${prepCase.name}`, async () => {
			const root = prepCase.payload_env === null ? null : await makePayloadRoot();
			const run = runManaged(["exec", ...prepCase.args], {
				github: fixtureGithubGateway(),
				env: payloadEnv(prepCase.payload_env, root, prepFixture.session_id),
				clockIso: prepFixture.clock_iso,
			});

			expect(await run.exit).toBe(prepCase.expected_exit_code);
			const expectedEnvelope = root === null ? prepCase.expected_envelope_text : prepCase.expected_envelope_text.replaceAll("{ROOT}", root);
			expect(normalizePayloadBytes(run.stdout.join(""))).toBe(normalizePayloadBytes(expectedEnvelope));
			if (prepCase.artifacts !== undefined && root !== null) await expectArtifacts(root, prepCase.artifacts);
		});
	}

	test("reports the stack summary reference size from the real artifact", async () => {
		const root = await makePayloadRoot();
		const run = runManaged(["exec", "stack-feedback-prep", "--stack-json", stackInputJson(), "--format", "json"], {
			github: fixtureGithubGateway(),
			env: payloadEnv("session", root, prepFixture.session_id),
			clockIso: prepFixture.clock_iso,
		});

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as { data: { stack_summary_reference: { payload_path: string; payload_bytes: number } } };
		const reference = envelope.data.stack_summary_reference;
		expect(reference.payload_bytes).toBe((await stat(reference.payload_path)).size);
	});

	test("rejects unknown options without invoking the gateway", async () => {
		const run = runManaged(["exec", "stack-feedback-prep", "--bogus", "--format", "json"], {
			github: fixtureGithubGateway(),
			env: { PATH: "/fake/bin" },
			clockIso: prepFixture.clock_iso,
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown option '--bogus'\n");
		// PINNED CLINKR SEMANTICS: unknown options are a raw commander usage
		// error, never a machine envelope — click parity.
	});
});

describe("stack-feedback-prep stack-reference input", () => {
	function runPrep(args: readonly string[], root: string, stdin = ""): ManagedRun {
		return runManaged(["exec", "stack-feedback-prep", ...args, "--format", "json"], {
			github: fixtureGithubGateway(),
			env: payloadEnv("session", root, prepFixture.session_id),
			clockIso: prepFixture.clock_iso,
			stdin,
		});
	}

	function errorEnvelope(run: ManagedRun): { error_type: string; message: string } {
		return JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
	}

	test("reads the same stack from --stack-reference without reading stdin", async () => {
		const rootFromStdin = await makePayloadRoot();
		const stdinRun = runPrep(["--stdout-mode", "compact"], rootFromStdin, stackInputJson());
		expect(await stdinRun.exit).toBe(0);
		const stdinEnvelope = JSON.parse(stdinRun.stdout.join("")) as { data: { summary: unknown; stack: unknown } };

		const scratch = await makeScratchDir();
		const stackPath = join(scratch, "stack.json");
		await writeFile(stackPath, stackInputJson(), "utf8");
		const rootFromReference = await makePayloadRoot();
		const referenceRun = runPrep(["--stack-reference", stackPath, "--stdout-mode", "compact"], rootFromReference, "this is not json and must not be read");

		expect(await referenceRun.exit).toBe(0);
		const referenceEnvelope = JSON.parse(referenceRun.stdout.join("")) as { data: { summary: unknown; stack: Array<{ pr_number: number; branch: string; counts: unknown }> } };
		expect(referenceEnvelope.data.summary).toEqual(stdinEnvelope.data.summary);
		expect(referenceEnvelope.data.stack.map((item) => ({ pr_number: item.pr_number, branch: item.branch, counts: item.counts }))).toEqual(
			(stdinEnvelope.data.stack as Array<{ pr_number: number; branch: string; counts: unknown }>).map((item) => ({ pr_number: item.pr_number, branch: item.branch, counts: item.counts })),
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
		expect(envelope.message).toContain("stack-feedback-prep --stack-reference must reference a stack JSON payload");
	});

	test("combines --stack-reference with --include-resolved", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const stackPath = join(scratch, "stack.json");
		await writeFile(stackPath, stackInputJson(), "utf8");

		const run = runPrep(["--stack-reference", stackPath, "--include-resolved", "--stdout-mode", "compact"], root);

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as { data: { include_resolved: boolean } };
		expect(envelope.data.include_resolved).toBe(true);
	});
});

describe("stack-feedback-plan parity with the Python CLI", () => {
	for (const planCase of planFixture.cases) {
		test(`matches the Python envelope for ${planCase.name}`, async () => {
			const root = planCase.payload_env === null ? null : await makePayloadRoot();
			const run = runManaged(["exec", "stack-feedback-plan", "--payload-json", planCase.payload_json_template, ...planCase.extra_args, "--format", "json"], {
				env: payloadEnv(planCase.payload_env, root, planFixture.session_id),
				clockIso: planFixture.clock_iso,
			});

			expect(await run.exit).toBe(planCase.expected_exit_code);
			const expectedEnvelope = root === null ? planCase.expected_envelope_text : planCase.expected_envelope_text.replaceAll("{ROOT}", root);
			expect(run.stdout.join("")).toBe(expectedEnvelope);
			if (planCase.artifacts !== undefined && root !== null) await expectArtifacts(root, planCase.artifacts);
		});
	}

	test("reports invalid_json for malformed plan payloads", async () => {
		const root = await makePayloadRoot();
		const run = runManaged(["exec", "stack-feedback-plan", "--payload-json", "{", "--format", "json"], {
			env: payloadEnv("session", root, planFixture.session_id),
			clockIso: planFixture.clock_iso,
		});

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string };
		expect(envelope.error_type).toBe("invalid_json");
	});
});

describe("stack-feedback-plan reference and file inputs", () => {
	const validPlanCase = requiredPlanCase("valid-full");

	function runPlan(args: readonly string[], root: string): ManagedRun {
		return runManaged(["exec", "stack-feedback-plan", ...args, "--format", "json"], {
			env: payloadEnv("session", root, planFixture.session_id),
			clockIso: planFixture.clock_iso,
		});
	}

	function planTemplate(): { prep: unknown; classifications: unknown } {
		return JSON.parse(validPlanCase.payload_json_template) as { prep: unknown; classifications: unknown };
	}

	function errorEnvelope(run: ManagedRun): { error_type: string; message: string } {
		return JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
	}

	test("builds the plan from --prep-reference plus a classifications-only payload", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const template = planTemplate();
		const prepPath = join(scratch, "stack-prep.json");
		await writeFile(prepPath, JSON.stringify(template.prep), "utf8");

		const run = runPlan(["--prep-reference", prepPath, "--payload-json", JSON.stringify({ classifications: template.classifications })], root);

		expect(await run.exit).toBe(validPlanCase.expected_exit_code);
		expect(run.stdout.join("")).toBe(validPlanCase.expected_envelope_text.replaceAll("{ROOT}", root));
	});

	test("accepts --payload-file for the full plan payload", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const payloadPath = join(scratch, "plan-payload.json");
		await writeFile(payloadPath, validPlanCase.payload_json_template, "utf8");

		const run = runPlan(["--payload-file", payloadPath], root);

		expect(await run.exit).toBe(validPlanCase.expected_exit_code);
		expect(run.stdout.join("")).toBe(validPlanCase.expected_envelope_text.replaceAll("{ROOT}", root));
	});

	test("rejects --prep-reference combined with an embedded prep key", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const prepPath = join(scratch, "stack-prep.json");
		await writeFile(prepPath, JSON.stringify(planTemplate().prep), "utf8");

		const run = runPlan(["--prep-reference", prepPath, "--payload-json", validPlanCase.payload_json_template], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix an embedded prep payload key with --prep-reference");
	});

	test("rejects --payload-json combined with --payload-file", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const payloadPath = join(scratch, "plan-payload.json");
		await writeFile(payloadPath, validPlanCase.payload_json_template, "utf8");

		const run = runPlan(["--payload-json", validPlanCase.payload_json_template, "--payload-file", payloadPath], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("only one");
	});

	test("requires a prep source when neither the payload key nor --prep-reference is given", async () => {
		const root = await makePayloadRoot();

		const run = runPlan(["--payload-json", JSON.stringify({ classifications: planTemplate().classifications })], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("requires a prep input");
	});

	test("rejects a missing --prep-reference file", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();

		const run = runPlan(["--prep-reference", join(scratch, "missing.json"), "--payload-json", JSON.stringify({ classifications: [] })], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("must point to an existing file");
	});

	test("rejects malformed --prep-reference JSON", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const prepPath = join(scratch, "broken.json");
		await writeFile(prepPath, "{", "utf8");

		const run = runPlan(["--prep-reference", prepPath, "--payload-json", JSON.stringify({ classifications: [] })], root);

		expect(await run.exit).toBe(2);
		expect(errorEnvelope(run).error_type).toBe("invalid_json");
	});

	test("rejects a --prep-reference artifact with the wrong shape", async () => {
		const root = await makePayloadRoot();
		const scratch = await makeScratchDir();
		const prepPath = join(scratch, "stack-plan.json");
		await writeFile(prepPath, JSON.stringify({ valid: true, batches: [], validation: { all_valid: true, per_pr: [] } }), "utf8");

		const run = runPlan(["--prep-reference", prepPath, "--payload-json", JSON.stringify({ classifications: [] })], root);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("Invalid stack-feedback-plan --prep-reference");
		expect(envelope.message).toContain("payload_session_id");
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
			const stdout: string[] = [];
			const stderr: string[] = [];
			const legacy = new InMemoryLegacyPrAddressGateway([0]);
			const exit = await runCli(["exec", ...usageErrorArgs], {
				context: fakePrAddressContext({ legacy }),
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				stdin: async () => "",
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
			});

			expect(exit).toBe(2);
			expect(stdout.join("")).toBe("");
			expect(stderr.join("")).toBe(
				"error: option '--stdout-mode <value>' argument 'bogus' is invalid. Allowed choices are full, compact.\n",
			);
			expect(legacy.calls).toEqual([]);
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

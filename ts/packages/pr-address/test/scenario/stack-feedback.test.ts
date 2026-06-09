import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { PayloadClock } from "../../src/payload-store.ts";
import type { LegacyPrAddressGateway } from "../../src/legacy-python.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PrAddressGitHubGateway } from "../../src/gateways.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";
import { InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";

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

function runManaged(args: readonly string[], options: { github?: PrAddressGitHubGateway | undefined; env: NodeJS.ProcessEnv; clockIso: string }): ManagedRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy: LegacyPrAddressGateway = {
		run: async () => {
			throw new Error("unexpected legacy fallback");
		},
	};
	return {
		exit: runCli(args, {
			context: { legacy, github: options.github, payloadClock: fixedClock(options.clockIso) },
			cwd: "/repo",
			env: options.env,
			stdin: async () => "",
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

	test("fails with missing_gateway when the GitHub gateway is absent", async () => {
		const root = await makePayloadRoot();
		const run = runManaged(["exec", "stack-feedback-prep", "--stack-json", stackInputJson(), "--format", "json"], {
			env: payloadEnv("session", root, prepFixture.session_id),
			clockIso: prepFixture.clock_iso,
		});

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { exit_code: number; error_type: string };
		expect(envelope.error_type).toBe("missing_gateway");
	});

	test("rejects unknown options without invoking the gateway", async () => {
		const run = runManaged(["exec", "stack-feedback-prep", "--bogus", "--format", "json"], {
			github: fixtureGithubGateway(),
			env: { PATH: "/fake/bin" },
			clockIso: prepFixture.clock_iso,
		});

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("--bogus");
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

describe("stack feedback fallback guards", () => {
	// --json-schema routes are TypeScript-owned now (see json-schema-routes.test.ts);
	// only click usage-error shapes still delegate to the legacy CLI.
	for (const fallbackArgs of [
		["stack-feedback-prep", "--stdout-mode", "bogus"],
		["stack-feedback-plan", "--stdout-mode", "bogus"],
	]) {
		test(`delegates ${fallbackArgs.join(" ")} to the legacy CLI`, async () => {
			const stdout: string[] = [];
			const legacy = new InMemoryLegacyPrAddressGateway([0]);
			const exit = await runCli(["exec", ...fallbackArgs], {
				context: { legacy },
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				stdin: async () => "",
				stdout: (text) => stdout.push(text),
				stderr: () => {},
			});

			expect(exit).toBe(0);
			expect(legacy.calls.map((call) => call.args)).toEqual([["exec", ...fallbackArgs]]);
		});
	}
});

function stackInputJson(): string {
	return JSON.stringify({
		stack: [
			{ pr_number: 101, branch: "branch-one", title: "First", url: "u1" },
			{ pr_number: 102, branch: "branch-two", title: "Second", url: "u2" },
		],
	});
}

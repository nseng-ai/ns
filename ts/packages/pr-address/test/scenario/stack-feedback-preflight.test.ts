import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { PayloadClock } from "../../src/payload-store.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";
import {
	discussionComment,
	InMemoryPrAddressGitHubGateway,
	prSummary,
	review,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";

const CLOCK_ISO = "2026-06-12T12:00:00.000Z";
const SESSION_ID = "stack-preflight-test";
const tempDirs: string[] = [];

interface ManagedRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	legacy: InMemoryLegacyPrAddressGateway;
}

interface Envelope<T = unknown> {
	exit_code: number;
	data?: T;
	message?: string;
	error_type?: string;
}

interface PayloadReference {
	payload_path: string;
	session_id: string;
	descriptor: string;
	role: string;
}

interface CompactPreflightData {
	payload_session_id: string;
	mapping_summary: { requested: number; matched: number; missing: number };
	stack_reference: PayloadReference;
	stack_summary_reference: PayloadReference;
	summary: { prs: number; reviews: number; unresolved_review_threads: number; discussion_comments: number };
	stack: Array<{ pr_number: number; branch: string; counts: { reviews: number; review_threads: number; unresolved_review_threads: number; discussion_comments: number } }>;
	zero_feedback_prs: Array<{ pr_number: number; branch: string }>;
}

interface FullPreflightData {
	payload_session_id: string;
	mapping_summary: { requested: number; matched: number; missing: number };
	stack_reference: PayloadReference;
	stack_summary_reference: PayloadReference;
	stack: Array<{ pr_number: number; branch: string; manifest: unknown }>;
}

interface MissingMappingData {
	branch_prs: Array<{ branch: string; pr_number: number }>;
	missing_branches: string[];
	summary: { requested: number; matched: number; missing: number };
}

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function fixedClock(): PayloadClock {
	const instant = new Date(CLOCK_ISO);
	return () => instant;
}

async function makePayloadRoot(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-stack-preflight-"));
	tempDirs.push(dir);
	return join(dir, "payload-root");
}

function runPreflight(args: readonly string[], options: { github?: InMemoryPrAddressGitHubGateway | undefined; stdin?: string | undefined; root: string }): ManagedRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy = new InMemoryLegacyPrAddressGateway([0]);
	return {
		exit: runCli(["exec", "stack-feedback-preflight", ...args, "--format", "json"], {
			context: { legacy, ...(options.github === undefined ? {} : { github: options.github }), payloadClock: fixedClock() },
			cwd: "/repo",
			env: { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: options.root, ASDL_PAYLOAD_SESSION_ID: SESSION_ID },
			stdin: async () => options.stdin ?? "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

function parseEnvelope<T>(run: ManagedRun): Envelope<T> {
	return JSON.parse(run.stdout.join("")) as Envelope<T>;
}

function feedbackGithub(): InMemoryPrAddressGitHubGateway {
	return new InMemoryPrAddressGitHubGateway({
		prs: [
			prSummary({ number: 20, head_ref_name: "feature-a", base_ref_name: "main", title: "A", url: "https://github.example/pr/20" }),
			prSummary({ number: 21, head_ref_name: "feature-b", base_ref_name: "feature-a", title: "B", url: "https://github.example/pr/21" }),
			prSummary({ number: 22, head_ref_name: "feature-empty", base_ref_name: "feature-b", title: "Empty", url: "https://github.example/pr/22" }),
		],
		reviews: new Map([[20, [review({ id: "PRR_20" })]]]),
		reviewThreads: new Map([[21, [reviewThread({ id: "PRRT_21" })]]]),
		discussionComments: new Map([[21, [discussionComment({ id: 210 })]]]),
	});
}

async function payloadFiles(root: string): Promise<string[]> {
	return await readdir(join(root, "sessions", SESSION_ID, "payloads"));
}

describe("pr-address exec stack-feedback-preflight", () => {
	test("maps branches, freezes the stack, runs prep, and emits a compact feedback-bearing split", async () => {
		const root = await makePayloadRoot();
		const run = runPreflight(["--stdout-mode", "compact"], {
			root,
			github: feedbackGithub(),
			stdin: JSON.stringify({ branches: ["feature-a", "feature-b", "feature-empty"] }),
		});

		expect(await run.exit).toBe(0);
		expect(run.legacy.calls).toEqual([]);
		const envelope = parseEnvelope<CompactPreflightData>(run);
		expect(envelope.exit_code).toBe(0);
		expect(envelope.data?.payload_session_id).toBe(SESSION_ID);
		expect(envelope.data?.mapping_summary).toEqual({ requested: 3, matched: 3, missing: 0 });
		expect(envelope.data?.summary).toMatchObject({ prs: 3, reviews: 1, unresolved_review_threads: 1, discussion_comments: 1 });
		expect(envelope.data?.stack.map((entry) => ({ pr_number: entry.pr_number, branch: entry.branch }))).toEqual([
			{ pr_number: 20, branch: "feature-a" },
			{ pr_number: 21, branch: "feature-b" },
		]);
		expect(envelope.data?.zero_feedback_prs).toEqual([{ pr_number: 22, branch: "feature-empty" }]);

		const stackReference = envelope.data?.stack_reference;
		expect(stackReference?.descriptor).toBe("pr-address-stack-feedback-preflight");
		const frozenStack = JSON.parse(await readFile(stackReference?.payload_path ?? "", "utf8")) as unknown;
		expect(frozenStack).toEqual({
			stack: [
				{ pr_number: 20, branch: "feature-a", title: "A", url: "https://github.example/pr/20", head_ref_name: "feature-a", base_ref_name: "main" },
				{ pr_number: 21, branch: "feature-b", title: "B", url: "https://github.example/pr/21", head_ref_name: "feature-b", base_ref_name: "feature-a" },
				{ pr_number: 22, branch: "feature-empty", title: "Empty", url: "https://github.example/pr/22", head_ref_name: "feature-empty", base_ref_name: "feature-b" },
			],
		});
	});

	test("full mode carries unfiltered prep data plus mapping and stack references", async () => {
		const root = await makePayloadRoot();
		const run = runPreflight([], {
			root,
			github: feedbackGithub(),
			stdin: JSON.stringify({ branches: ["feature-a", "feature-empty"] }),
		});

		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope<FullPreflightData>(run);
		expect(envelope.data?.mapping_summary).toEqual({ requested: 2, matched: 2, missing: 0 });
		expect(envelope.data?.stack.map((entry) => entry.pr_number)).toEqual([20, 22]);
		expect(envelope.data?.stack.every((entry) => entry.manifest !== undefined)).toBe(true);
		expect(envelope.data?.stack_reference.descriptor).toBe("pr-address-stack-feedback-preflight");
		expect(envelope.data?.stack_summary_reference.descriptor).toBe("pr-address-stack-feedback-prep");
	});

	test("returns exit 1 for missing PR coverage before writing artifacts", async () => {
		const root = await makePayloadRoot();
		const run = runPreflight(["--stdout-mode", "compact"], {
			root,
			github: feedbackGithub(),
			stdin: JSON.stringify({ branches: ["feature-a", "missing-branch"] }),
		});

		expect(await run.exit).toBe(1);
		const envelope = parseEnvelope<MissingMappingData>(run);
		expect(envelope.message).toBe("No open PR found for branches: missing-branch");
		expect(envelope.data?.missing_branches).toEqual(["missing-branch"]);
		expect(envelope.data?.summary).toEqual({ requested: 2, matched: 1, missing: 1 });
		expect(await payloadFiles(root)).toEqual([]);
	});

	test("zero-feedback stacks still exit 0 with every PR in zero_feedback_prs", async () => {
		const root = await makePayloadRoot();
		const github = new InMemoryPrAddressGitHubGateway({ prs: [prSummary({ number: 30, head_ref_name: "feature-empty" })] });
		const run = runPreflight(["--stdout-mode", "compact"], {
			root,
			github,
			stdin: JSON.stringify({ branches: ["feature-empty"] }),
		});

		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope<CompactPreflightData>(run);
		expect(envelope.data?.summary).toMatchObject({ prs: 1, reviews: 0, unresolved_review_threads: 0, discussion_comments: 0 });
		expect(envelope.data?.stack).toEqual([]);
		expect(envelope.data?.zero_feedback_prs).toEqual([{ pr_number: 30, branch: "feature-empty" }]);
	});

	test("rejects empty, blank, duplicate, and malformed inputs", async () => {
		const cases = [
			{ stdin: JSON.stringify({ branches: [] }), errorType: "invalid_request", message: "stack-feedback-preflight requires at least one branch." },
			{ stdin: JSON.stringify({ branches: ["feature-a", "  "] }), errorType: "invalid_request", message: "stack-feedback-preflight requires every branch to be non-empty." },
			{ stdin: JSON.stringify({ branches: ["feature-a", "feature-a"] }), errorType: "invalid_request", message: "stack-feedback-preflight branches contain duplicates: feature-a" },
			{ stdin: "{not-json", errorType: "invalid_json", message: "Invalid stack-feedback-preflight branches JSON payload" },
		];

		for (const item of cases) {
			const root = await makePayloadRoot();
			const run = runPreflight([], { root, github: feedbackGithub(), stdin: item.stdin });
			expect(await run.exit).toBe(2);
			const envelope = parseEnvelope(run);
			expect(envelope.error_type).toBe(item.errorType);
			expect(envelope.message).toContain(item.message);
		}
	});

	test("maps gh listing failures to pr_gateway_failure", async () => {
		const root = await makePayloadRoot();
		const github = new InMemoryPrAddressGitHubGateway({ listOpenPrsFailure: { stderr: "gh: network down", stdout: "", returncode: 1 } });
		const run = runPreflight([], { root, github, stdin: JSON.stringify({ branches: ["feature-a"] }) });

		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("pr_gateway_failure");
		expect(envelope.message).toBe("Failed to list open PRs: gh: network down");
	});

	test("breaks shared-head-branch ties by choosing the lowest PR number", async () => {
		const root = await makePayloadRoot();
		const github = new InMemoryPrAddressGitHubGateway({
			prs: [prSummary({ number: 44, head_ref_name: "shared" }), prSummary({ number: 40, head_ref_name: "shared" })],
		});
		const run = runPreflight(["--stdout-mode", "compact"], { root, github, stdin: JSON.stringify({ branches: ["shared"] }) });

		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope<CompactPreflightData>(run);
		expect(envelope.data?.zero_feedback_prs).toEqual([{ pr_number: 40, branch: "shared" }]);
	});

	test("accepts branch input via --branches-json", async () => {
		const root = await makePayloadRoot();
		const run = runPreflight(["--branches-json", JSON.stringify({ branches: ["feature-a"] }), "--stdout-mode", "compact"], {
			root,
			github: feedbackGithub(),
		});

		expect(await run.exit).toBe(0);
		expect(parseEnvelope<CompactPreflightData>(run).data?.mapping_summary).toEqual({ requested: 1, matched: 1, missing: 0 });
	});
});

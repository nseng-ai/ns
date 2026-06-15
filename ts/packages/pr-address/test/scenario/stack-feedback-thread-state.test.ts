import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadResult, type PayloadReference } from "../../src/payload-store.ts";
import { stackArtifactDescriptor } from "../../src/session-artifacts.ts";
import { InMemoryPrAddressGitHubGateway, prSummary, reviewThread } from "../support/in-memory-pr-address-gateways.ts";
import { fixedClock, runScenario, type ScenarioRun } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const newTempDir = useTempDirs();
const SESSION_ID = "stack-thread-state-test";

interface Envelope<T = unknown> {
	exit_code: number;
	data?: T;
	message?: string;
	error_type?: string;
}

interface ThreadStateData {
	harness_session_id: string;
	include_resolved: true;
	stack_thread_state_reference: PayloadReference;
	summary: { prs: number; review_threads: number; unresolved_review_threads: number; resolved_review_threads: number };
	stack: Array<{
		pr_number: number;
		branch: string;
		review_threads?: Array<{ thread_id: string; is_resolved: boolean; comment_count: number }>;
		counts: { review_threads: number; unresolved_review_threads: number; resolved_review_threads: number };
	}>;
}

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

async function makePayloadRoot(): Promise<string> {
	return join(await newTempDir("pr-address-thread-state-"), "payload-root");
}

async function seedStack(root: string, stack: unknown): Promise<PayloadReference> {
	const store = expectOk(await PayloadStore.open({ root, sessionId: SESSION_ID, clock: fixedClock("2026-06-12T12:00:00.000Z") }));
	return expectOk(await store.writeJsonArtifact({ descriptor: "pr-address-stack-feedback-preflight", role: "summary", payload: stack }));
}

interface RunThreadStateOptions {
	root: string;
	stackReference: PayloadReference;
	args?: readonly string[] | undefined;
	github?: InMemoryPrAddressGitHubGateway | undefined;
}

function runThreadState(options: RunThreadStateOptions): ScenarioRun {
	const args = options.args ?? [];
	const github = options.github ?? threadStateGithub();
	return runScenario(["exec", "stack-feedback-thread-state", "--stack-reference", options.stackReference.payload_path, ...args, "--format", "json"], {
		github,
		payloadClock: fixedClock("2026-06-12T12:00:00.000Z"),
		env: { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: options.root, HARNESS_SESSION_ID: SESSION_ID },
	});
}

function parseEnvelope<T>(run: ScenarioRun): Envelope<T> {
	return JSON.parse(run.stdout.join("")) as Envelope<T>;
}

function stackInput(overrides: Record<string, unknown> = {}): { stack: Array<Record<string, unknown>> } {
	return {
		stack: [
			{
				pr_number: 20,
				branch: "feature-a",
				title: "A",
				url: "https://github.example/pr/20",
				head_ref_name: "feature-a",
				base_ref_name: "main",
				...overrides,
			},
		],
	};
}

function threadStateGithub(): InMemoryPrAddressGitHubGateway {
	return new InMemoryPrAddressGitHubGateway({
		prs: [prSummary({ number: 20, head_ref_name: "feature-a" })],
		reviewThreads: new Map([
			[
				20,
				[
					reviewThread({ id: "PRRT_open", is_resolved: false }),
					reviewThread({ id: "PRRT_done", is_resolved: true }),
				],
			],
		]),
	});
}

async function payloadFiles(root: string): Promise<string[]> {
	return await readdir(join(root, "sessions", SESSION_ID, "payloads"));
}

describe("pr-address exec stack-feedback-thread-state", () => {
	test("full mode writes a stack thread-state artifact with resolved and unresolved threads", async () => {
		const root = await makePayloadRoot();
		const stackReference = await seedStack(root, stackInput());
		const run = runThreadState({ root, stackReference, args: ["--stdout-mode", "full"] });

		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope<ThreadStateData>(run);
		expect(envelope.data?.include_resolved).toBe(true);
		expect(envelope.data?.summary).toEqual({ prs: 1, review_threads: 2, unresolved_review_threads: 1, resolved_review_threads: 1 });
		expect(envelope.data?.stack[0]?.review_threads?.map((thread) => ({ thread_id: thread.thread_id, is_resolved: thread.is_resolved }))).toEqual([
			{ thread_id: "PRRT_open", is_resolved: false },
			{ thread_id: "PRRT_done", is_resolved: true },
		]);
		expect(envelope.data?.stack_thread_state_reference.descriptor).toBe("pr-address-stack-thread-state");
		const artifact = JSON.parse(await readFile(envelope.data?.stack_thread_state_reference.payload_path ?? "", "utf8")) as ThreadStateData;
		expect(artifact.stack_thread_state_reference).toBeNull();
		expect(artifact.stack[0]?.review_threads?.length).toBe(2);
	});

	test("compact mode returns summary and produced artifact reference", async () => {
		const root = await makePayloadRoot();
		const stackReference = await seedStack(root, stackInput());
		const run = runThreadState({ root, stackReference, args: ["--stdout-mode", "compact"] });

		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope<Record<string, unknown>>(run);
		expect(envelope.data).toMatchObject({ operation: "stack-feedback-thread-state" });
		expect(envelope.data).toMatchObject({ counts: { prs: 1, review_threads: 2, unresolved_review_threads: 1, resolved_review_threads: 1 } });
		expect(JSON.stringify(envelope.data)).toContain("stack-thread-state");
	});

	test("gateway failure for thread fetch maps to pr_gateway_failure and names the PR", async () => {
		const root = await makePayloadRoot();
		const stackReference = await seedStack(root, stackInput());
		const github = new InMemoryPrAddressGitHubGateway({ reviewThreadsFailurePrNumbers: new Set([20]) });
		const run = runThreadState({ root, stackReference, args: ["--stdout-mode", "full"], github });

		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("pr_gateway_failure");
		expect(envelope.message).toContain("Failed to fetch review threads for PR 20");
	});

	test("invalid stack inputs fail with stack-prep-style validation", async () => {
		const baseEntry = stackInput().stack[0];
		if (baseEntry === undefined) throw new Error("Expected stack fixture entry.");
		const cases = [
			{ stack: { stack: [] }, message: "stack-feedback-thread-state requires at least one stack PR." },
			{ stack: { stack: [baseEntry, { ...baseEntry }] }, message: "stack-feedback-thread-state stack contains duplicate PR numbers: (20,)" },
			{ stack: stackInput({ branch: "  " }), message: "stack-feedback-thread-state requires every stack PR branch to be non-empty." },
			{ stack: { stack: [baseEntry, { ...baseEntry, pr_number: 21 }] }, message: "stack-feedback-thread-state stack contains duplicate branches: ('feature-a',)" },
		];
		for (const item of cases) {
			const root = await makePayloadRoot();
			const stackReference = await seedStack(root, item.stack);
			const run = runThreadState({ root, stackReference, args: ["--stdout-mode", "full"] });
			expect(await run.exit).toBe(2);
			expect(parseEnvelope(run).message).toBe(item.message);
		}
	});

	test("missing HARNESS_SESSION_ID in compact/artifact mode fails before artifact writes", async () => {
		const root = await makePayloadRoot();
		const stackReference = await seedStack(root, stackInput());
		const run = runScenario(["exec", "stack-feedback-thread-state", "--stack-reference", stackReference.payload_path, "--format", "json", "--stdout-mode", "compact"], {
			env: { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: root },
			github: threadStateGithub(),
		});

		expect(await run.exit).toBe(2);
		const envelope = parseEnvelope(run);
		expect(envelope.error_type).toBe("harness_session_required");
		expect(envelope.message).toContain("HARNESS_SESSION_ID");
		expect(await payloadFiles(root)).toHaveLength(1);
	});
});

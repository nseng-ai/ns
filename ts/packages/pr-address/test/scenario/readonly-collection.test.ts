import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { discussionComment, InMemoryPrAddressGitHubGateway, review, reviewThread } from "../support/in-memory-pr-address-gateways.ts";

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

interface Envelope {
	data: Record<string, unknown>;
}

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function runWithGithub(args: readonly string[], github: InMemoryPrAddressGitHubGateway, env: NodeJS.ProcessEnv = { PATH: "/fake/bin" }): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			context: { github },
			cwd: "/repo",
			env,
			stdin: async () => "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

describe("read-only GitHub-backed operations", () => {
	test("looks up a PR for a branch", async () => {
		const github = new InMemoryPrAddressGitHubGateway({
			prsByBranch: {
				feature: {
					number: 42,
					title: "Add feature",
					url: "https://github.com/acme/repo/pull/42",
					head_ref_name: "feature",
					base_ref_name: "main",
					state: "OPEN",
				},
			},
		});
		const run = runWithGithub(["exec", "get-pr-for-branch", "feature", "--format", "json"], github);

		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run.stdout.join(""));
		expect(envelope.data).toMatchObject({ found: true, number: 42, head_ref_name: "feature", base_ref_name: "main", state: "OPEN" });
	});

	test("reports PR lookup miss as found false", async () => {
		const run = runWithGithub(["exec", "get-pr-for-branch", "missing", "--format", "json"], new InMemoryPrAddressGitHubGateway());

		expect(await run.exit).toBe(0);
		const envelope = parseEnvelope(run.stdout.join(""));
		expect(envelope.data).toEqual({ found: false, error: "no PR found", returncode: 1 });
	});

	test("fetches reviews, review threads, and discussion comments", async () => {
		const github = new InMemoryPrAddressGitHubGateway({
			reviews: { 42: [review({ id: "PRR_1" }), review({ id: "PRR_2", author: "approver", state: "APPROVED", body: "LGTM" })] },
			reviewThreads: { 42: [reviewThread({ id: "open", is_resolved: false }), reviewThread({ id: "resolved", is_resolved: true })] },
			discussionComments: { 42: [discussionComment({ id: 99, author: "Graphite Automations" })] },
		});

		const reviewsRun = runWithGithub(["exec", "get-reviews", "42", "--format", "json"], github);
		expect(await reviewsRun.exit).toBe(0);
		expect(parseEnvelope(reviewsRun.stdout.join("")).data.count).toBe(2);

		const threadsRun = runWithGithub(["exec", "get-review-comments", "42", "--include-resolved", "--format", "json"], github);
		expect(await threadsRun.exit).toBe(0);
		expect((parseEnvelope(threadsRun.stdout.join("")).data.threads as Array<{ id: string }>).map((thread) => thread.id)).toEqual(["open", "resolved"]);

		const discussionsRun = runWithGithub(["exec", "get-discussion-comments", "42", "--format", "json"], github);
		expect(await discussionsRun.exit).toBe(0);
		expect((parseEnvelope(discussionsRun.stdout.join("")).data.comments as Array<{ author: string }>)[0]?.author).toBe("Graphite Automations");

	});

	test("get-feedback manages inline and payload modes", async () => {
		const github = new InMemoryPrAddressGitHubGateway({
			reviews: {
				42: [
					review({ id: "empty-approved", state: "APPROVED", body: "   " }),
					review({ id: "changes", state: "CHANGES_REQUESTED", body: "" }),
				],
			},
			reviewThreads: { 42: [reviewThread({ id: "PRRT_1" })] },
			discussionComments: { 42: [discussionComment({ id: 7 })] },
		});

		const inlineRun = runWithGithub(["exec", "get-feedback", "42", "--payload-mode", "inline", "--format", "json"], github);
		expect(await inlineRun.exit).toBe(0);
		const inlineData = parseEnvelope(inlineRun.stdout.join("")).data;
		expect(inlineData.payload_mode).toBe("inline");
		expect((inlineData.reviews as Array<{ id: string }>).map((item) => item.id)).toEqual(["changes"]);

		const tempDir = await mkdtemp(join(tmpdir(), "pr-address-readonly-collection-"));
		tempDirs.push(tempDir);
		const root = join(tempDir, "payload-root");
		const payloadRun = runWithGithub(["exec", "get-feedback", "42", "--format", "json"], github, {
			PATH: "/fake/bin",
			ASDL_PAYLOAD_ROOT: root,
			ASDL_PAYLOAD_SESSION_ID: "sess-readonly",
		});
		expect(await payloadRun.exit).toBe(0);
		const payloadData = parseEnvelope(payloadRun.stdout.join("")).data;
		expect(payloadData.payload_mode).toBe("payload");
		const reference = payloadData.payload_reference as { payload_path: string; descriptor: string; role: string };
		expect(reference.descriptor).toBe("pr-address-get-feedback-pr-42");
		expect(reference.role).toBe("raw");
		const artifactEnvelope = JSON.parse(await readFile(reference.payload_path, "utf8")) as { exit_code: number; data: { payload_mode: string } };
		expect(artifactEnvelope.exit_code).toBe(0);
		expect(artifactEnvelope.data.payload_mode).toBe("inline");
	});
});

function parseEnvelope(text: string): Envelope {
	return JSON.parse(text) as Envelope;
}

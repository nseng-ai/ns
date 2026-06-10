import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";
import { discussionComment, InMemoryPrAddressGitHubGateway, review, reviewThread } from "../support/in-memory-pr-address-gateways.ts";

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	legacy: InMemoryLegacyPrAddressGateway;
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
	const legacy = new InMemoryLegacyPrAddressGateway([0]);
	return {
		exit: runCli(args, {
			context: { legacy, github },
			cwd: "/repo",
			env,
			stdin: async () => "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

describe("read-only GitHub-backed operations", () => {
	test("get-feedback manages inline and payload modes without legacy fallback", async () => {
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
		expect(inlineRun.legacy.calls).toEqual([]);

		const tempDir = await mkdtemp(join(tmpdir(), "pr-address-readonly-collection-"));
		tempDirs.push(tempDir);
		const root = join(tempDir, "payload-root");
		const payloadRun = runWithGithub(["exec", "get-feedback", "42", "--format", "json"], github, {
			PATH: "/fake/bin",
			ASDL_PAYLOAD_ROOT: root,
			ASDL_PAYLOAD_SESSION_ID: "sess-readonly",
		});
		expect(await payloadRun.exit).toBe(0);
		expect(payloadRun.legacy.calls).toEqual([]);
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

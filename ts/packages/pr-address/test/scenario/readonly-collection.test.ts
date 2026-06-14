import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { discussionComment, InMemoryPrAddressGitHubGateway, review, reviewThread } from "../support/in-memory-pr-address-gateways.ts";
import { runScenario, type ScenarioRun } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

interface Envelope {
	data: Record<string, unknown>;
}

const makeTempDir = useTempDirs();

function runWithGithub(args: readonly string[], github: InMemoryPrAddressGitHubGateway, env: NodeJS.ProcessEnv = { PATH: "/fake/bin" }): ScenarioRun {
	return runScenario(args, { github, env });
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

		const tempDir = await makeTempDir("pr-address-readonly-collection-");
		const root = join(tempDir, "payload-root");
		const payloadRun = runWithGithub(["exec", "get-feedback", "42", "--format", "json"], github, {
			PATH: "/fake/bin",
			ASDL_PAYLOAD_ROOT: root,
			HARNESS_SESSION_ID: "sess-readonly",
		});
		expect(await payloadRun.exit).toBe(0);
		const payloadData = parseEnvelope(payloadRun.stdout.join("")).data;
		expect(payloadData.payload_mode).toBe("payload");
		const reference = payloadData.payload_reference as { payload_path: string; descriptor: string; role: string };
		expect(reference.descriptor).toBe("pr-address-pr-42-feedback");
		expect(reference.role).toBe("raw");
		const artifactEnvelope = JSON.parse(await readFile(reference.payload_path, "utf8")) as { exit_code: number; data: { payload_mode: string } };
		expect(artifactEnvelope.exit_code).toBe(0);
		expect(artifactEnvelope.data.payload_mode).toBe("inline");
	});
});

function parseEnvelope(text: string): Envelope {
	return JSON.parse(text) as Envelope;
}

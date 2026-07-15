import { describe, expect, test } from "vitest";

import type { ObjectiveRunnerPublicationCommandContext } from "../../src/ns/publication-context.ts";
import { createObjectiveExecPublicationBindNsCommand } from "../../src/ns/commands/exec-publication-bind.ts";
import type { PublicationAuthorizationStore } from "../../src/publication/authorization-store.ts";
import { createFakeObjectiveNsApi, runObjectiveCommand } from "../support/ns-command-harness.ts";

const SHA = "1".repeat(40);

class RecordingAuthorizationStore implements PublicationAuthorizationStore {
	readonly bindings: Array<{ path: string; content: string }> = [];

	async bind(path: string, content: string) {
		this.bindings.push({ path, content });
		return { ok: true as const, value: undefined };
	}
	async read(): ReturnType<PublicationAuthorizationStore["read"]> {
		throw new Error("unexpected read");
	}
	async replace(): ReturnType<PublicationAuthorizationStore["replace"]> {
		throw new Error("unexpected replace");
	}
}

describe("ns objective exec publication-bind scenario", () => {
	test("binds typed @file attestation without invoking an external command", async () => {
		const store = new RecordingAuthorizationStore();
		const command = createObjectiveExecPublicationBindNsCommand(async () => context(store));
		const api = createFakeObjectiveNsApi({ outputFormat: "json" });

		const exit = await runObjectiveCommand(
			command,
			{
				attestation: "@/scratch/attestation.json",
				authorization: "@/scratch/authorization.json",
			},
			{ api },
		);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				type: "bound",
				authorizationPath: "/scratch/authorization.json",
				target: { pullRequestNumber: 42, branch: "feature/publication" },
			},
		});
		expect(store.bindings).toHaveLength(1);
		expect(JSON.parse(store.bindings[0]?.content ?? "")).toMatchObject({
			invocationId: "run-1",
			lastPublishedHead: SHA,
		});
		expect(api.execCalls).toEqual([]);
	});
});

function context(store: PublicationAuthorizationStore): ObjectiveRunnerPublicationCommandContext {
	const attestation = {
		version: 1,
		invocationId: "run-1",
		objectiveSlug: "objective-runner-external-writes",
		isPolicyAttested: true,
		isLaunchConfirmed: true,
		target: {
			repository: "nseng-ai/ns",
			pullRequestNumber: 42,
			pullRequestUrl: "https://github.com/nseng-ai/ns/pull/42",
			branch: "feature/publication",
			headBranch: "feature/publication",
		},
		launchHead: SHA,
		remoteHead: SHA,
	};
	return {
		cwd: "/repo",
		repoRoot: "/repo",
		trunkBranch: "main",
		commands: {
			exec: async () => {
				throw new Error("unexpected external command");
			},
		},
		facts: {
			readPublicationTarget: async () => ({
				type: "found",
				value: {
					repository: "nseng-ai/ns",
					branch: "feature/publication",
					isTrunk: false,
					localHead: SHA,
					isWorktreeClean: true,
					pullRequest: {
						number: 42,
						url: "https://github.com/nseng-ai/ns/pull/42",
						headBranch: "feature/publication",
						headSha: SHA,
					},
				},
			}),
			readPublicationCommits: async () => {
				throw new Error("unexpected commit read");
			},
		},
		publisher: {
			publishBoundBranch: async () => {
				throw new Error("unexpected publication");
			},
		},
		authorizations: store,
		readTextFile: async () => ({ ok: true, content: JSON.stringify(attestation) }),
	};
}

import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";
import {
	discussionComment,
	InMemoryPrAddressGitGateway,
	InMemoryPrAddressGitHubGateway,
	review,
	reviewThread,
} from "../support/in-memory-pr-address-gateways.ts";

const REPO_CONTEXT_MESSAGE = "pr-address must run inside the target git repository (gh resolves the repo from the current directory).";

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	legacy: InMemoryLegacyPrAddressGateway;
}

interface MachineEnvelope {
	exit_code: number;
	error_type?: string;
	message?: string;
}

interface RunOptions {
	github?: InMemoryPrAddressGitHubGateway | undefined;
	git?: InMemoryPrAddressGitGateway | undefined;
	stdin?: string | undefined;
}

function run(args: readonly string[], options: RunOptions = {}): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy = new InMemoryLegacyPrAddressGateway([0]);
	return {
		exit: runCli(args, {
			context: {
				legacy,
				...(options.github === undefined ? {} : { github: options.github }),
				...(options.git === undefined ? {} : { git: options.git }),
			},
			cwd: "/tmp/not-a-repo",
			env: { PATH: "/fake/bin" },
			stdin: async () => options.stdin ?? "",
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

function feedbackGithub(): InMemoryPrAddressGitHubGateway {
	return new InMemoryPrAddressGitHubGateway({
		reviews: { 42: [review({ id: "changes", state: "CHANGES_REQUESTED", body: "" })] },
		reviewThreads: { 42: [reviewThread({ id: "PRRT_1" })] },
		discussionComments: { 42: [discussionComment({ id: 7 })] },
	});
}

function outsideGit(): InMemoryPrAddressGitGateway {
	return new InMemoryPrAddressGitGateway({ isInsideWorkTree: false });
}

describe("repo-context precondition for GitHub-hitting operations", () => {
	test("a flagged operation outside a work tree fails fast with repo_context_required", async () => {
		const repoRun = run(["exec", "get-feedback", "42", "--format", "json"], { github: feedbackGithub(), git: outsideGit() });
		expect(await repoRun.exit).toBe(2);
		const envelope = JSON.parse(repoRun.stdout.join("")) as MachineEnvelope;
		expect(envelope.exit_code).toBe(2);
		expect(envelope.error_type).toBe("repo_context_required");
		expect(envelope.message).toBe(REPO_CONTEXT_MESSAGE);
		expect(repoRun.legacy.calls).toEqual([]);
	});

	test("human format reports the repo-context failure on stderr", async () => {
		const repoRun = run(["exec", "get-feedback", "42"], { github: feedbackGithub(), git: outsideGit() });
		expect(await repoRun.exit).toBe(2);
		expect(repoRun.stdout.join("")).toBe("");
		expect(repoRun.stderr.join("")).toBe(`error: ${REPO_CONTEXT_MESSAGE}\n`);
	});

	test("a flagged operation inside a work tree proceeds normally", async () => {
		const repoRun = run(["exec", "get-feedback", "42", "--payload-mode", "inline", "--format", "json"], {
			github: feedbackGithub(),
			git: new InMemoryPrAddressGitGateway({ isInsideWorkTree: true }),
		});
		expect(await repoRun.exit).toBe(0);
		const envelope = JSON.parse(repoRun.stdout.join("")) as MachineEnvelope & { data: { pr_number: number } };
		expect(envelope.data.pr_number).toBe(42);
	});

	test("a mutation operation outside a work tree fails before any GitHub side effect", async () => {
		const github = feedbackGithub();
		const repoRun = run(["exec", "resolve-thread-with-reply", "PRRT_1", "explained", "addressed in review", "--format", "json"], {
			github,
			git: outsideGit(),
		});
		expect(await repoRun.exit).toBe(2);
		const envelope = JSON.parse(repoRun.stdout.join("")) as MachineEnvelope;
		expect(envelope.error_type).toBe("repo_context_required");
		expect(github.resolvedThreadIds).toEqual([]);
		expect(github.threadReplies).toEqual([]);
	});

	test("an unflagged pure-local operation is unaffected outside a work tree", async () => {
		const repoRun = run(["exec", "validate-feedback-classification", "--format", "json"], { git: outsideGit() });
		expect(await repoRun.exit).toBe(2);
		const envelope = JSON.parse(repoRun.stdout.join("")) as MachineEnvelope;
		expect(envelope.error_type).not.toBe("repo_context_required");
	});

	test("a flagged operation proceeds when the context has no git gateway (fail-open)", async () => {
		const repoRun = run(["exec", "get-feedback", "42", "--payload-mode", "inline", "--format", "json"], { github: feedbackGithub() });
		expect(await repoRun.exit).toBe(0);
	});

	test("a flagged operation proceeds when the repo-context probe itself fails (fail-open)", async () => {
		const repoRun = run(["exec", "get-feedback", "42", "--payload-mode", "inline", "--format", "json"], {
			github: feedbackGithub(),
			git: new InMemoryPrAddressGitGateway({ repoContextFailure: { stderr: "git exploded", stdout: "", returncode: 1 } }),
		});
		expect(await repoRun.exit).toBe(0);
	});

	test("--json-schema is served before the repo-context check", async () => {
		const repoRun = run(["exec", "get-feedback", "--json-schema"], { git: outsideGit() });
		expect(await repoRun.exit).toBe(0);
		const document = JSON.parse(repoRun.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});
});

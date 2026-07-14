import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	commandSucceeded,
	runCommand,
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { createFlowBranchPublicationClient } from "@nseng-ai/flow/api";

const TEST_TIMEOUT_MS = 60_000;
const FEATURE_BRANCH = "feature/demo";

interface PullRequestState {
	body: string;
}

class EnvironmentCommandExecApi implements CommandExecApi {
	private readonly env: NodeJS.ProcessEnv;

	constructor(env: NodeJS.ProcessEnv) {
		this.env = { ...env };
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		return await runCommand(command, args, { ...options, env: this.env });
	}
}

describe("Flow publication real adapters", () => {
	test(
		"pushes exactly the verified commit to a disposable bare remote and preserves PR prose",
		async () => {
			const root = await mkdtemp(join(tmpdir(), "ns-flow-publication-"));
			try {
				const repository = join(root, "repository");
				const remote = join(root, "remote.git");
				const bin = join(root, "bin");
				const statePath = join(root, "pull-request.json");
				await mkdir(repository);
				await mkdir(bin);
				await writeFile(statePath, `${JSON.stringify({ body: "Human-owned prose" })}\n`);
				await writeGitHubShim(bin);
				const env = {
					...process.env,
					PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
					NS_FLOW_TEST_REMOTE: remote,
					NS_FLOW_TEST_PR_STATE: statePath,
				};
				const commands = new EnvironmentCommandExecApi(env);

				await required(commands, repository, "git", ["init", "--bare", remote]);
				await required(commands, repository, "git", ["init", "-b", FEATURE_BRANCH]);
				await required(commands, repository, "git", ["config", "user.name", "Flow Test"]);
				await required(commands, repository, "git", [
					"config",
					"user.email",
					"flow-test@example.com",
				]);
				await writeFile(join(repository, "evidence.txt"), "old\n");
				await required(commands, repository, "git", ["add", "evidence.txt"]);
				await required(commands, repository, "git", ["commit", "-m", "old"]);
				const oldHead = (
					await required(commands, repository, "git", ["rev-parse", "HEAD"])
				).stdout.trim();
				await required(commands, repository, "git", ["remote", "add", "origin", remote]);
				await required(commands, repository, "git", [
					"push",
					"origin",
					`${oldHead}:refs/heads/${FEATURE_BRANCH}`,
				]);
				await writeFile(join(repository, "evidence.txt"), "new\n");
				await required(commands, repository, "git", ["add", "evidence.txt"]);
				await required(commands, repository, "git", ["commit", "-m", "new"]);
				const newHead = (
					await required(commands, repository, "git", ["rev-parse", "HEAD"])
				).stdout.trim();

				const client = createFlowBranchPublicationClient({ cwd: repository, commands });
				const resolved = await client.resolveCurrentBranchTarget({ trunkBranch: "main" });
				expect(resolved).toMatchObject({
					type: "resolved",
					localHeadOid: newHead,
					target: { branch: FEATURE_BRANCH, pullRequest: { headOid: oldHead } },
				});
				if (resolved.type !== "resolved") throw new Error(resolved.error.message);

				expect(
					await client.publishBoundBranch({
						target: resolved.target,
						expectedHeadOid: newHead,
						objectiveSlug: "demo-objective",
						managedBody: "## Objective Runner\n\nVerified publication evidence",
					}),
				).toMatchObject({ type: "published", headOid: newHead });
				const remoteHead = (
					await required(commands, repository, "git", [
						"--git-dir",
						remote,
						"rev-parse",
						`refs/heads/${FEATURE_BRANCH}`,
					])
				).stdout.trim();
				expect(remoteHead).toBe(newHead);
				const state = JSON.parse(await readFile(statePath, "utf8")) as PullRequestState;
				expect(state.body).toBe(
					"Human-owned prose\n\n<!-- ns-objective-runner:begin objective=demo-objective -->\n" +
						"## Objective Runner\n\nVerified publication evidence\n" +
						"<!-- ns-objective-runner:end -->",
				);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		},
		TEST_TIMEOUT_MS,
	);
});

async function required(
	commands: CommandExecApi,
	cwd: string,
	command: string,
	args: string[],
): Promise<ExecResult> {
	const result = await commands.exec(command, args, { cwd, timeout: TEST_TIMEOUT_MS });
	if (commandSucceeded(result)) return result;
	throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
}

async function writeGitHubShim(bin: string): Promise<void> {
	const path = join(bin, "gh");
	await writeFile(
		path,
		`#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const remote = process.env.NS_FLOW_TEST_REMOTE;
const statePath = process.env.NS_FLOW_TEST_PR_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const head = spawnSync("git", ["--git-dir", remote, "rev-parse", "refs/heads/${FEATURE_BRANCH}"], { encoding: "utf8" });
if (head.status !== 0) {
  process.stderr.write(head.stderr);
  process.exit(head.status || 1);
}
if (args[0] === "pr" && args[1] === "view") {
  process.stdout.write(JSON.stringify({
    number: 12,
    url: "https://github.com/acme/project/pull/12",
    body: state.body,
    headRefName: "${FEATURE_BRANCH}",
    headRefOid: head.stdout.trim(),
  }) + "\\n");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "edit") {
  const bodyPath = args[args.indexOf("--body-file") + 1];
  state.body = readFileSync(bodyPath, "utf8");
  writeFileSync(statePath, JSON.stringify(state) + "\\n");
  process.exit(0);
}
process.stderr.write("unexpected gh command: " + args.join(" ") + "\\n");
process.exit(2);
`,
	);
	await chmod(path, 0o755);
}

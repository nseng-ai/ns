import { afterEach, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCli } from "../../src/cli.ts";
import type { CommandExecApi, ExecOptions, ExecResult } from "@sdl/exec";
import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@sdl/capability-kit/git/testing";
import { createTempDirTracker } from "@sdl/test-kit";
import { encodeBranchForPlanPath } from "@sdl/plans";
import {
	InMemoryBranchMemoryGateway,
	type InMemoryBrmemGatewayState,
} from "@sdl/branch-context/testing";
import {
	InMemoryGraphiteBranchGateway,
	type InMemoryGraphiteGatewayState,
} from "@sdl/graphite/testing";

export const SOURCE_BRANCH = "feature/source-plan";
export const PLAN_SLUG = "branch-scoped-plan";
export const PLAN_KEY = `${PLAN_SLUG}.md`;
export const LEGACY_PLAN_KEY = "plan.md";
export const START_POINT = "0123456789abcdef0123456789abcdef01234567";
export const PLAN_STORE_REPO_KEY = "gh--owner--repo";

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class RecordingCommands implements CommandExecApi {
	readonly execCalls: ExecCall[] = [];

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		return {
			stdout: "",
			stderr: `unexpected exec: ${command} ${args.join(" ")}`,
			code: 99,
			killed: false,
		};
	}

	assertDone(): void {
		expect(this.execCalls).toEqual([]);
	}
}

export interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	commands: RecordingCommands;
	git: InMemoryGitGateway;
	brmem: InMemoryBranchMemoryGateway;
	graphite: InMemoryGraphiteBranchGateway;
}

export interface RunWithFakesOptions {
	cwd: string;
	planStoreRoot?: string;
	git?: InMemoryGitGatewayState;
	brmem?: InMemoryBrmemGatewayState;
	graphite?: InMemoryGraphiteGatewayState;
}

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

export function makeTempDir(prefix = "branch-context-cli-"): Promise<string> {
	return tempDirs.makeTempDir(prefix);
}

export async function writeSavedPlan(
	planStoreRoot: string,
	params: {
		slug?: string;
		branch?: string;
		content?: string;
	} = {},
): Promise<string> {
	const slug = params.slug ?? PLAN_SLUG;
	const branch = params.branch ?? SOURCE_BRANCH;
	const planDirectory = join(planStoreRoot, PLAN_STORE_REPO_KEY, encodeBranchForPlanPath(branch));
	await mkdir(planDirectory, { recursive: true });
	const filePath = join(planDirectory, `${slug}.md`);
	await writeFile(filePath, params.content ?? "# Saved Plan\n", "utf8");
	return filePath;
}

export function runWithFakes(args: readonly string[], options: RunWithFakesOptions): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const commands = new RecordingCommands();
	const git = new InMemoryGitGateway({
		repoRoot: options.cwd,
		optionalRepoRoot: options.cwd,
		currentBranch: SOURCE_BRANCH,
		...options.git,
	});
	const brmem = new InMemoryBranchMemoryGateway(options.brmem);
	const graphite = new InMemoryGraphiteBranchGateway(options.graphite);
	return {
		stdout,
		stderr,
		commands,
		git,
		brmem,
		graphite,
		exit: runCli(args, {
			context: { commands, git, brmem, graphite },
			cwd: options.cwd,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			...(options.planStoreRoot === undefined ? {} : { planStoreRoot: options.planStoreRoot }),
		}),
	};
}

export function jsonFailure(message: string): string {
	return `${JSON.stringify({ status: "failure", exitCode: 2, errorType: "branch-context-error", message }, null, 2)}\n`;
}

export function jsonSuccess(data: Record<string, unknown>): string {
	return `${JSON.stringify({ status: "ok", exitCode: 0, data }, null, 2)}\n`;
}

export function parseJson(run: CliRun): Record<string, unknown> {
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (!isRecord(value)) {
		throw new Error("Expected JSON object output.");
	}
	return value;
}

export function expectNoGitOrBrmemCalls(run: CliRun): void {
	expect(run.git.repoRootCalls).toEqual([]);
	expect(run.git.optionalRepoRootCalls).toEqual([]);
	expect(run.git.currentBranchCalls).toEqual([]);
	expect(run.git.trunkBranchCalls).toEqual([]);
	expect(run.git.originUrlCalls).toEqual([]);
	expect(run.git.headCommitCalls).toEqual([]);
	expect(run.git.validateBranchRefCalls).toEqual([]);
	expect(run.git.localBranchPresenceCalls).toEqual([]);
	expect(run.git.createBranchAtHeadCalls).toEqual([]);
	expect(run.brmem.attachmentPresenceCalls).toEqual([]);
	expect(run.brmem.attachPlanCalls).toEqual([]);
	expect(run.brmem.listAttachedPlansCalls).toEqual([]);
	expect(run.brmem.getAttachedPlanCalls).toEqual([]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

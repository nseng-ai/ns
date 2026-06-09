import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildImplPlannedBranchPrompt,
	loadAttachedPlan,
	loadPlannedBranchPlan,
	normalizeRequestedAttachedPlanKey,
	parseBrmemGetContent,
	parseBrmemListEntries,
	selectAttachedPlanKey,
	type AttachedPlanEntry,
	type PlannedBranchBrmemGateway,
	type PlannedBranchGitGateway,
} from "@asdl/planned-branch";
import { PLAN_BRANCH_NAMESPACE } from "@asdl/planned-branch";
import { buildPlanFileName, buildRepoPlanStoreKey, encodeBranchForPlanPath, type ExecOptions, type PlanCommandExecApi } from "@asdl/plans";
import type { ExecResult } from "../src/command-runtime.ts";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_BRANCH = `planned-branches/${PLAN_SLUG}`;
const PLAN_KEY = `${PLAN_SLUG}.md`;
const PLAN_REF = `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${PLAN_BRANCH.replaceAll("/", "---")}:${PLAN_KEY}`;
const PLAN_CONTENT = "# Attached Plan\n\n- Preserve all Markdown.\n- Then implement.\n";
const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: Partial<ExecResult>;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

class FakePi implements PlanCommandExecApi {
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if ("error" in expected) {
			throw expected.error;
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function gitRootStep(root: string = ROOT): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${root}\n` });
}

function gitCurrentBranchStep(branch: string = PLAN_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${branch}\n`, ...result });
}

function gitDefaultBranchStep(result: Partial<ExecResult> = { stdout: "origin/master\n" }): ScriptedExec {
	return step("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], result);
}

function brmemListStep(branch: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function brmemGetStep(branch: string, key: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["get", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function listEnvelope(
	branch: string,
	entries: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>,
): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: PLAN_BRANCH_NAMESPACE,
			key: null,
			branch,
			base: false,
			entries: entries.map((entry) => {
				const entryBranch = entry.branch ?? branch;
				return {
					namespace: entry.namespace ?? PLAN_BRANCH_NAMESPACE,
					key: entry.key,
					branch: entryBranch,
					ref_name: entry.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${entryBranch.replaceAll("/", "---")}:${entry.key}`,
				};
			}),
		},
	});
}

function getEnvelope(input: { key: string; branch: string; content: string; refName?: string; namespace?: string }): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: input.namespace ?? PLAN_BRANCH_NAMESPACE,
			key: input.key,
			branch: input.branch,
			content: input.content,
			ref_name: input.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			target: input.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			at: null,
		},
	});
}

function successfulLoadScript(input: {
	branch?: string;
	key?: string;
	entries?: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>;
	content?: string;
	refName?: string;
	defaultBranchResult?: Partial<ExecResult>;
} = {}): ScriptedExec[] {
	const branch = input.branch ?? PLAN_BRANCH;
	const key = input.key ?? PLAN_KEY;
	const entries = input.entries ?? (input.refName === undefined ? [{ key }] : [{ key, refName: input.refName }]);
	const content = input.content ?? PLAN_CONTENT;
	const getStdout = input.refName === undefined ? getEnvelope({ branch, key, content }) : getEnvelope({ branch, key, content, refName: input.refName });
	return [
		gitRootStep(),
		gitCurrentBranchStep(branch),
		gitDefaultBranchStep(input.defaultBranchResult ?? { stdout: "origin/master\n" }),
		brmemListStep(branch, { stdout: listEnvelope(branch, entries) }),
		brmemGetStep(branch, key, { stdout: getStdout }),
	];
}

function attachedPlanEntry(key: string, branch: string = PLAN_BRANCH): AttachedPlanEntry {
	return {
		namespace: PLAN_BRANCH_NAMESPACE,
		key,
		branch,
		refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`,
	};
}

function fakeGitGateway(branch: string = PLAN_BRANCH): PlannedBranchGitGateway {
	return {
		async repoRoot() {
			return { ok: true, value: ROOT };
		},
		async optionalRepoRoot() {
			return { type: "found", value: ROOT };
		},
		async sourceBranch() {
			return { ok: true, value: branch };
		},
		async implementationBranch() {
			return { ok: true, value: branch };
		},
		async defaultBranch() {
			return { type: "found", value: "main" };
		},
		async originUrl() {
			return { type: "found", value: "git@github.com:asdl/asdl-tools.git" };
		},
		async headCommit() {
			return { ok: true, value: "1111111111111111111111111111111111111111" };
		},
		async validateBranchRef() {
			return { ok: true };
		},
		async localBranchPresence() {
			return { type: "absent", refName: `refs/heads/${branch}` };
		},
		async createBranchAtHead() {
			return { ok: true };
		},
	};
}

function emptyBrmemGateway(): PlannedBranchBrmemGateway {
	return {
		async attachmentPresence() {
			return { type: "absent" };
		},
		async attachPlan() {
			return { ok: false, error: { code: "unexpected", message: "attachPlan should not be called" } };
		},
		async listAttachedPlans() {
			return { ok: true, value: [] };
		},
		async getAttachedPlan() {
			return { ok: false, error: { code: "unexpected", message: "getAttachedPlan should not be called" } };
		},
	};
}

describe("loadAttachedPlan", () => {
	test("loads the branch-segment attached plan and preserves full content", async () => {
		const pi = new FakePi(successfulLoadScript({ refName: PLAN_REF }));

		const plan = await loadAttachedPlan(pi, {}, { cwd: ROOT });

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["symbolic-ref", "--short", "HEAD"] },
			{ command: "git", args: ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"] },
			{ command: "brmem", args: ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_BRANCH, "--format", "json"] },
			{ command: "brmem", args: ["get", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_BRANCH, "--format", "json"] },
		]);
		expect(plan).toEqual({
			branch: PLAN_BRANCH,
			namespace: PLAN_BRANCH_NAMESPACE,
			selectedKey: PLAN_KEY,
			refName: PLAN_REF,
			content: PLAN_CONTENT,
			byteCount: new TextEncoder().encode(PLAN_CONTENT).length,
			availableKeys: [PLAN_KEY],
			source: "attached",
		});
	});

	test("loads a requested slug or exact key", async () => {
		const slugPi = new FakePi(successfulLoadScript());
		const slugPlan = await loadAttachedPlan(slugPi, { requestedKey: PLAN_SLUG }, { cwd: ROOT });
		slugPi.assertDone();
		expect(slugPlan.selectedKey).toBe(PLAN_KEY);

		const exactPi = new FakePi(successfulLoadScript());
		const exactPlan = await loadAttachedPlan(exactPi, { requestedKey: PLAN_KEY }, { cwd: ROOT });
		exactPi.assertDone();
		expect(exactPlan.selectedKey).toBe(PLAN_KEY);
	});

	test("falls back to the only entry when branch segment does not match", async () => {
		const branch = "planned-branches/different-segment";
		const pi = new FakePi(successfulLoadScript({ branch, key: PLAN_KEY, entries: [{ key: PLAN_KEY }] }));

		const plan = await loadAttachedPlan(pi, {}, { cwd: ROOT });

		pi.assertDone();
		expect(plan.branch).toBe(branch);
		expect(plan.selectedKey).toBe(PLAN_KEY);
	});

	test("reports multiple entry ambiguity with available keys", () => {
		expect(() =>
			selectAttachedPlanKey({
				branch: "planned-branches/no-match",
				entries: [attachedPlanEntry("beta.md"), attachedPlanEntry("alpha.md")],
			}),
		).toThrow(/Multiple attached plans[\s\S]*- alpha\.md[\s\S]*- beta\.md[\s\S]*planned-branch exec load-plan <key>/);
	});

	test("reports missing requested key with available keys", () => {
		expect(() =>
			selectAttachedPlanKey({
				branch: PLAN_BRANCH,
				requestedKey: "missing",
				entries: [attachedPlanEntry("alpha.md"), attachedPlanEntry("beta.md")],
			}),
		).toThrow(/Requested attached plan key `missing\.md`[\s\S]*- alpha\.md[\s\S]*- beta\.md/);
	});

	test("rejects invalid requested keys before command selection", () => {
		expect(() => normalizeRequestedAttachedPlanKey("   ")).toThrow("empty");
		expect(() => normalizeRequestedAttachedPlanKey("/abs.md")).toThrow("must not start");
		expect(() => normalizeRequestedAttachedPlanKey("../escape")).toThrow("must not contain");
	});

	test("reports no entries with recovery guidance", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			gitDefaultBranchStep(),
			brmemListStep(PLAN_BRANCH, { stdout: listEnvelope(PLAN_BRANCH, []) }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT })).rejects.toThrow(/No planned-branch entries[\s\S]*planned-branch exec write-plan-file[\s\S]*planned-branch exec create/);

		pi.assertDone();
	});

	test("loads saved-plan fallback content with an injected text reader", async () => {
		const planStoreRoot = await mkdtemp(join(tmpdir(), "planned-branch-fallback-"));
		tempDirs.push(planStoreRoot);
		const savedSlug = "saved-plan-fallback-content";
		const fileName = buildPlanFileName(savedSlug);
		const directory = join(planStoreRoot, buildRepoPlanStoreKey(ROOT, "git@github.com:asdl/asdl-tools.git"), encodeBranchForPlanPath(PLAN_BRANCH));
		const filePath = join(directory, fileName);
		await mkdir(directory, { recursive: true });
		await writeFile(filePath, "# Real file should not be read\n", "utf8");
		const fakeContent = "# Injected Saved Plan\n\nUse this reader-supplied content.\n";
		const readPaths: string[] = [];
		const pi = new FakePi();

		const plan = await loadPlannedBranchPlan(pi, {}, {
			cwd: ROOT,
			git: fakeGitGateway(),
			brmem: emptyBrmemGateway(),
			planStoreRoot,
			async readTextFile(path) {
				readPaths.push(path);
				return fakeContent;
			},
		});

		pi.assertDone();
		expect(readPaths).toEqual([filePath]);
		expect(plan).toEqual({
			branch: PLAN_BRANCH,
			namespace: "local-plan-store",
			selectedKey: fileName,
			refName: filePath,
			content: fakeContent,
			byteCount: new TextEncoder().encode(fakeContent).length,
			availableKeys: [fileName],
			source: "saved",
			sourceFile: filePath,
		});
	});

	test("refuses detached HEAD before Branch Memory reads", async () => {
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep("", { code: 1, stderr: "fatal: ref HEAD is not a symbolic ref" })]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT })).rejects.toThrow("detached HEAD");

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("refuses trunk branches before Branch Memory reads", async () => {
		for (const branch of ["main", "master", "develop"]) {
			const pi = new FakePi([
				gitRootStep(),
				gitCurrentBranchStep(branch),
				gitDefaultBranchStep({ stdout: branch === "develop" ? "origin/develop\n" : "origin/main\n" }),
			]);

			await expect(loadAttachedPlan(pi, {}, { cwd: ROOT })).rejects.toThrow(
				`Refusing to implement directly on trunk (\`${branch}\`). Check out a feature branch first.`,
			);

			pi.assertDone();
			expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
		}
	});

	test("continues when default branch lookup fails on a feature branch", async () => {
		const pi = new FakePi(successfulLoadScript({ defaultBranchResult: { code: 1, stderr: "no origin" } }));

		const plan = await loadAttachedPlan(pi, {}, { cwd: ROOT });

		pi.assertDone();
		expect(plan.selectedKey).toBe(PLAN_KEY);
	});

	test("formats brmem list process failures", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			gitDefaultBranchStep(),
			brmemListStep(PLAN_BRANCH, { code: 2, stderr: "list failed" }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT })).rejects.toThrow(/brmem list failed[\s\S]*Command: brmem list/);

		pi.assertDone();
	});

	test("reports unavailable brmem list without attempting get", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			gitDefaultBranchStep(),
			brmemListStep(PLAN_BRANCH, { code: 127, stderr: "brmem: command not found" }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT })).rejects.toThrow("No brmem command available");

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "get")).toBe(false);
	});

	test("formats brmem get process failures", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			gitDefaultBranchStep(),
			brmemListStep(PLAN_BRANCH, { stdout: listEnvelope(PLAN_BRANCH, [{ key: PLAN_KEY }]) }),
			brmemGetStep(PLAN_BRANCH, PLAN_KEY, { code: 2, stderr: "get failed" }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT })).rejects.toThrow(/brmem get failed[\s\S]*Command: brmem get/);

		pi.assertDone();
	});
});

describe("attached-plan JSON parsers", () => {
	test("rejects malformed list JSON, missing entries, and mismatched entries", () => {
		expect(() => parseBrmemListEntries("{", { namespace: PLAN_BRANCH_NAMESPACE, branch: PLAN_BRANCH })).toThrow(
			"Malformed brmem list JSON",
		);
		expect(() => parseBrmemListEntries(JSON.stringify({ exit_code: 0, data: {} }), { namespace: PLAN_BRANCH_NAMESPACE, branch: PLAN_BRANCH })).toThrow(
			"expected data.entries array",
		);
		expect(() =>
			parseBrmemListEntries(listEnvelope(PLAN_BRANCH, [{ key: PLAN_KEY, namespace: "other" }]), {
				namespace: PLAN_BRANCH_NAMESPACE,
				branch: PLAN_BRANCH,
			}),
		).toThrow("expected canonical entry");
	});

	test("rejects malformed get JSON, missing content, and mismatched data", () => {
		expect(() => parseBrmemGetContent("{", { namespace: PLAN_BRANCH_NAMESPACE, branch: PLAN_BRANCH, key: PLAN_KEY })).toThrow(
			"Malformed brmem get JSON",
		);
		expect(() =>
			parseBrmemGetContent(JSON.stringify({ exit_code: 0, data: { namespace: PLAN_BRANCH_NAMESPACE, key: PLAN_KEY, branch: PLAN_BRANCH } }), {
				namespace: PLAN_BRANCH_NAMESPACE,
				branch: PLAN_BRANCH,
				key: PLAN_KEY,
			}),
		).toThrow("expected string fields");
		expect(() =>
			parseBrmemGetContent(getEnvelope({ key: "other.md", branch: PLAN_BRANCH, content: PLAN_CONTENT }), {
				namespace: PLAN_BRANCH_NAMESPACE,
				branch: PLAN_BRANCH,
				key: PLAN_KEY,
			}),
		).toThrow("expected requested data");
	});
});

describe("buildImplPlannedBranchPrompt", () => {
	test("includes evidence and untruncated plan content", () => {
		const prompt = buildImplPlannedBranchPrompt({
			branch: PLAN_BRANCH,
			namespace: PLAN_BRANCH_NAMESPACE,
			selectedKey: PLAN_KEY,
			refName: PLAN_REF,
			content: PLAN_CONTENT,
			byteCount: new TextEncoder().encode(PLAN_CONTENT).length,
			availableKeys: [PLAN_KEY],
			source: "attached",
		});

		expect(prompt).toContain("The attached planned-branch plan has been loaded by the planning-layer reader.");
		expect(prompt).toContain(`Branch: ${PLAN_BRANCH}`);
		expect(prompt).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(prompt).toContain(`Selected key: ${PLAN_KEY}`);
		expect(prompt).toContain(`Ref: ${PLAN_REF}`);
		expect(prompt).toContain(`Bytes: ${new TextEncoder().encode(PLAN_CONTENT).length}`);
		expect(prompt).toContain("Create an implementation checklist");
		expect(prompt).toContain("Do not call `brmem put`, `brmem copy`, `brmem delete`");
		expect(prompt).toContain(`----- BEGIN ATTACHED PLAN -----\n${PLAN_CONTENT}\n----- END ATTACHED PLAN -----`);
	});
});

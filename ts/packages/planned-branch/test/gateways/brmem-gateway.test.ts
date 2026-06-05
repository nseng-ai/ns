import { describe, expect, test } from "bun:test";

import { RealPlannedBranchBrmemGateway, parseBrmemGetContent, parseBrmemListEntries, parseBrmemPutData } from "../../src/brmem-gateway.ts";
import { PLAN_BRANCH_NAMESPACE } from "../../src/constants.ts";
import type { ExecResult } from "../../src/command-runtime.ts";
import type { ExecOptions, PlanCommandExecApi } from "../../src/plan-persistence.ts";
import { InMemoryPlannedBranchBrmemGateway } from "../support/in-memory-brmem-gateway.ts";

const ROOT = "/no-such-planned-branch-repo";
const BRANCH = "planned-branches/branch-scoped-plan";
const KEY = "branch-scoped-plan.md";
const CONTENT = "# Plan\n";
const COMMIT = "0123456789abcdef";
const SOURCE_FILE = "/tmp/branch-scoped-plan.md";
const REF = `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/planned-branches---branch-scoped-plan:${KEY}`;

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

class ScriptedCommands implements PlanCommandExecApi {
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: readonly ScriptedExec[]) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if ("error" in expected) throw expected.error;
		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
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

function errorStep(command: string, args: string[], error: Error): ScriptedExec {
	return { command, args, error };
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function envelope(data: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({ exit_code: 0, data, ...overrides });
}

function validPutData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		namespace: PLAN_BRANCH_NAMESPACE,
		key: KEY,
		branch: BRANCH,
		ref_name: REF,
		commit: COMMIT,
		source_file: SOURCE_FILE,
		...overrides,
	};
}

function validListData(entryOverrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		entries: [
			{
				namespace: PLAN_BRANCH_NAMESPACE,
				key: KEY,
				branch: BRANCH,
				ref_name: REF,
				...entryOverrides,
			},
		],
	};
}

function validGetData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		namespace: PLAN_BRANCH_NAMESPACE,
		key: KEY,
		branch: BRANCH,
		content: CONTENT,
		ref_name: REF,
		...overrides,
	};
}

describe("in-memory planned-branch brmem gateway", () => {
	test("returns configured entries and records narrow logs", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway({ entries: [{ branch: BRANCH, key: KEY, content: CONTENT, sourceFile: SOURCE_FILE }] });

		expect(await brmem.attachmentPresence({ cwd: ROOT, branch: BRANCH, key: KEY })).toMatchObject({ type: "present" });
		expect(await brmem.listAttachedPlans({ cwd: ROOT, branch: BRANCH })).toEqual({
			ok: true,
			value: [{ namespace: PLAN_BRANCH_NAMESPACE, key: KEY, branch: BRANCH, refName: REF }],
		});
		expect(await brmem.getAttachedPlan({ cwd: ROOT, branch: BRANCH, key: KEY })).toEqual({ ok: true, value: { content: CONTENT, refName: REF } });
		expect(brmem.attachmentPresenceCalls).toEqual([{ cwd: ROOT, branch: BRANCH, key: KEY }]);
		expect(brmem.listAttachedPlansCalls).toEqual([{ cwd: ROOT, branch: BRANCH }]);
		expect(brmem.getAttachedPlanCalls).toEqual([{ cwd: ROOT, branch: BRANCH, key: KEY }]);
	});

	test("models attach as state without overwriting existing entries", async () => {
		const brmem = new InMemoryPlannedBranchBrmemGateway();

		expect(await brmem.attachmentPresence({ cwd: ROOT, branch: BRANCH, key: KEY })).toEqual({ type: "absent" });
		expect(await brmem.attachPlan({ cwd: ROOT, branch: BRANCH, key: KEY, sourceFile: SOURCE_FILE })).toEqual({
			ok: true,
			value: { namespace: PLAN_BRANCH_NAMESPACE, key: KEY, branch: BRANCH, refName: REF, commit: "abc123", sourceFile: SOURCE_FILE },
		});
		expect(await brmem.attachmentPresence({ cwd: ROOT, branch: BRANCH, key: KEY })).toMatchObject({ type: "present" });
		expect(await brmem.attachPlan({ cwd: ROOT, branch: BRANCH, key: KEY, sourceFile: SOURCE_FILE })).toMatchObject({ ok: false });
		expect(brmem.attachPlanCalls).toEqual([
			{ cwd: ROOT, branch: BRANCH, key: KEY, sourceFile: SOURCE_FILE },
			{ cwd: ROOT, branch: BRANCH, key: KEY, sourceFile: SOURCE_FILE },
		]);
	});
});

describe("real planned-branch brmem gateway command protocol", () => {
	test("maps attachment presence check exit codes", async () => {
		const commands = new ScriptedCommands([
			step("brmem", ["check", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"]),
			step("brmem", ["check", "missing.md", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], { code: 1 }),
		]);
		const brmem = new RealPlannedBranchBrmemGateway(commands);

		expect(await brmem.attachmentPresence({ cwd: ROOT, branch: BRANCH, key: KEY })).toEqual({
			type: "present",
			displayCommand: `brmem check ${KEY} --namespace ${PLAN_BRANCH_NAMESPACE} --branch ${BRANCH} --format json`,
		});
		expect(await brmem.attachmentPresence({ cwd: ROOT, branch: BRANCH, key: "missing.md" })).toEqual({ type: "absent" });
		commands.assertDone();
		expect(commands.execCalls.every((call) => call.options?.cwd === ROOT && call.options.timeout === 30_000)).toBe(true);
	});

	test("maps killed and unexpected check failures", async () => {
		const commands = new ScriptedCommands([
			step("brmem", ["check", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], { code: 124, killed: true }),
			step("brmem", ["check", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], { code: 2, stderr: "bad" }),
		]);
		const brmem = new RealPlannedBranchBrmemGateway(commands);

		expect(await brmem.attachmentPresence({ cwd: ROOT, branch: BRANCH, key: KEY })).toMatchObject({ type: "error", error: { code: "brmem_check_killed" } });
		expect(await brmem.attachmentPresence({ cwd: ROOT, branch: BRANCH, key: KEY })).toMatchObject({ type: "error", error: { code: "brmem_check_failed" } });
		commands.assertDone();
	});

	test("sends exact put, list, and get commands", async () => {
		const commands = new ScriptedCommands([
			step("brmem", ["put", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--file", SOURCE_FILE, "--format", "json"], {
				stdout: envelope(validPutData()),
			}),
			step("brmem", ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], { stdout: envelope(validListData()) }),
			step("brmem", ["get", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], { stdout: envelope(validGetData()) }),
		]);
		const brmem = new RealPlannedBranchBrmemGateway(commands);

		expect(await brmem.attachPlan({ cwd: ROOT, branch: BRANCH, key: KEY, sourceFile: SOURCE_FILE })).toEqual({
			ok: true,
			value: { namespace: PLAN_BRANCH_NAMESPACE, key: KEY, branch: BRANCH, refName: REF, commit: COMMIT, sourceFile: SOURCE_FILE },
		});
		expect(await brmem.listAttachedPlans({ cwd: ROOT, branch: BRANCH })).toEqual({
			ok: true,
			value: [{ namespace: PLAN_BRANCH_NAMESPACE, key: KEY, branch: BRANCH, refName: REF }],
		});
		expect(await brmem.getAttachedPlan({ cwd: ROOT, branch: BRANCH, key: KEY })).toEqual({ ok: true, value: { content: CONTENT, refName: REF } });
		commands.assertDone();
		expect(commands.execCalls.map((call) => call.args)).toEqual([
			["put", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--file", SOURCE_FILE, "--format", "json"],
			["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"],
			["get", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"],
		]);
		expect(commands.execCalls.every((call) => call.options?.timeout === 30_000)).toBe(true);
	});
});

describe("real planned-branch brmem gateway failure and parsing", () => {
	test("reports unavailable command candidates", async () => {
		const commands = new ScriptedCommands([errorStep("brmem", ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], new Error("ENOENT"))]);
		const brmem = new RealPlannedBranchBrmemGateway(commands);

		expect(await brmem.listAttachedPlans({ cwd: ROOT, branch: BRANCH })).toMatchObject({
			ok: false,
			error: { code: "brmem_unavailable" },
		});
		commands.assertDone();
	});

	test("returns typed errors for command failures and malformed output", async () => {
		const commands = new ScriptedCommands([
			step("brmem", ["put", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--file", SOURCE_FILE, "--format", "json"], { code: 2 }),
			step("brmem", ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], { stdout: "{" }),
			step("brmem", ["get", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], { stdout: "{" }),
		]);
		const brmem = new RealPlannedBranchBrmemGateway(commands);

		expect(await brmem.attachPlan({ cwd: ROOT, branch: BRANCH, key: KEY, sourceFile: SOURCE_FILE })).toMatchObject({ ok: false, error: { code: "brmem_put_failed" } });
		expect(await brmem.listAttachedPlans({ cwd: ROOT, branch: BRANCH })).toMatchObject({ ok: false, error: { code: "brmem_malformed_list" } });
		expect(await brmem.getAttachedPlan({ cwd: ROOT, branch: BRANCH, key: KEY })).toMatchObject({ ok: false, error: { code: "brmem_malformed_get" } });
		commands.assertDone();
	});

	test("rejects mismatched put, list, and get responses", async () => {
		const commands = new ScriptedCommands([
			step("brmem", ["put", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--file", SOURCE_FILE, "--format", "json"], {
				stdout: envelope(validPutData({ key: "other.md" })),
			}),
			step("brmem", ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], {
				stdout: envelope(validListData({ branch: "other" })),
			}),
			step("brmem", ["get", KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", BRANCH, "--format", "json"], {
				stdout: envelope(validGetData({ namespace: "other" })),
			}),
		]);
		const brmem = new RealPlannedBranchBrmemGateway(commands);

		expect(await brmem.attachPlan({ cwd: ROOT, branch: BRANCH, key: KEY, sourceFile: SOURCE_FILE })).toMatchObject({
			ok: false,
			error: { code: "brmem_unexpected_put_data" },
		});
		expect(await brmem.listAttachedPlans({ cwd: ROOT, branch: BRANCH })).toMatchObject({ ok: false, error: { code: "brmem_malformed_list" } });
		expect(await brmem.getAttachedPlan({ cwd: ROOT, branch: BRANCH, key: KEY })).toMatchObject({ ok: false, error: { code: "brmem_malformed_get" } });
		commands.assertDone();
	});
});

describe("Branch Memory machine envelope parsing", () => {
	test("keeps valid put, list, and get parser behavior", () => {
		expect(parseBrmemPutData(envelope(validPutData()))).toEqual({
			namespace: PLAN_BRANCH_NAMESPACE,
			key: KEY,
			branch: BRANCH,
			refName: REF,
			commit: COMMIT,
			sourceFile: SOURCE_FILE,
		});
		expect(parseBrmemListEntries(envelope(validListData()), { namespace: PLAN_BRANCH_NAMESPACE, branch: BRANCH })).toEqual([
			{ namespace: PLAN_BRANCH_NAMESPACE, key: KEY, branch: BRANCH, refName: REF },
		]);
		expect(parseBrmemGetContent(envelope(validGetData()), { namespace: PLAN_BRANCH_NAMESPACE, branch: BRANCH, key: KEY })).toEqual({ content: CONTENT, refName: REF });
	});
});

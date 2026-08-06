import { parseArtifactId } from "@nseng-ai/gitplane";
import {
	NodeGitCommandExecutor,
	RealArtifactGateway,
	type GitCommandExecutor,
} from "@nseng-ai/gitplane/cli";
import { afterEach, describe, expect, test, vi } from "vitest";

const runtime = vi.hoisted(() => {
	const fs = {
		link: vi.fn(),
		lstat: vi.fn(),
		mkdir: vi.fn(),
		open: vi.fn(),
		readdir: vi.fn(),
		readFile: vi.fn(),
		rm: vi.fn(),
		rmdir: vi.fn(),
		unlink: vi.fn(),
	};
	const execFile = vi.fn();
	return { fs, execFile };
});

vi.mock("node:fs/promises", () => runtime.fs);
vi.mock("node:child_process", () => {
	const custom = Symbol.for("nodejs.util.promisify.custom");
	const execFile = Object.assign(runtime.execFile, {
		[custom]: runtime.execFile,
	});
	return { execFile };
});

interface Invocation {
	readonly args: readonly string[];
	readonly input?: string;
}

type ScriptStep =
	| {
			readonly args: readonly string[];
			readonly input?: string;
			readonly stdout?: Buffer;
			readonly stderr?: Buffer;
	  }
	| { readonly args: readonly string[]; readonly input?: string; readonly error: unknown };

class ScriptedGit implements GitCommandExecutor {
	private readonly remaining: ScriptStep[];
	private readonly recorded: Invocation[] = [];

	constructor(steps: readonly ScriptStep[]) {
		this.remaining = [...steps];
	}

	get invocations(): readonly Invocation[] {
		return this.recorded.map((invocation) => ({
			args: [...invocation.args],
			...(invocation.input === undefined ? {} : { input: invocation.input }),
		}));
	}

	async execute(
		args: readonly string[],
		options?: { readonly input?: string },
	): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> {
		const input = options?.input;
		this.recorded.push({ args: [...args], ...(input === undefined ? {} : { input }) });
		const step = this.remaining.shift();
		if (step === undefined) throw new Error(`Unexpected git call: ${args.join(" ")}`);
		expect(args).toEqual(step.args);
		expect(input).toBe(step.input);
		if ("error" in step) throw step.error;
		return {
			stdout: step.stdout ?? Buffer.alloc(0),
			stderr: step.stderr ?? Buffer.alloc(0),
		};
	}

	assertComplete(): void {
		expect(this.remaining).toEqual([]);
	}
}

function gatewayFor(steps: readonly ScriptStep[]): {
	readonly gateway: RealArtifactGateway;
	readonly git: ScriptedGit;
} {
	const git = new ScriptedGit(steps);
	return { gateway: new RealArtifactGateway({ cwd: "/repo", git }), git };
}

function fileFacts(): { isSymbolicLink(): boolean; isFile(): boolean; isDirectory(): boolean } {
	return { isSymbolicLink: () => false, isFile: () => true, isDirectory: () => false };
}

function directoryFacts(): {
	isSymbolicLink(): boolean;
	isFile(): boolean;
	isDirectory(): boolean;
} {
	return { isSymbolicLink: () => false, isFile: () => false, isDirectory: () => true };
}

function symlinkFacts(): { isSymbolicLink(): boolean; isFile(): boolean; isDirectory(): boolean } {
	return { isSymbolicLink: () => true, isFile: () => false, isDirectory: () => false };
}

function specialFacts(): { isSymbolicLink(): boolean; isFile(): boolean; isDirectory(): boolean } {
	return { isSymbolicLink: () => false, isFile: () => false, isDirectory: () => false };
}

function codedError(code: string, message = code): Error & { readonly code: string } {
	return Object.assign(new Error(message), { code });
}

function batchRecord(object: string, bytes: Buffer): Buffer {
	return Buffer.concat([Buffer.from(`${object} blob ${bytes.length}\n`), bytes, Buffer.from("\n")]);
}

const parsedArtifactId = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsedArtifactId.ok) throw new Error("Test artifact ID must be valid.");
const artifactId = parsedArtifactId.artifactId;
function artifactRequest(directory = "artifact") {
	return { directory, artifactId, marker: '{"gpId":"01jxyz8y3jqazj7jrx53w9b3dn"}\n' };
}

function resetFileSystemDefaults(): void {
	runtime.fs.link.mockResolvedValue(undefined);
	runtime.fs.lstat.mockResolvedValue(directoryFacts());
	runtime.fs.mkdir.mockResolvedValue(undefined);
	runtime.fs.open.mockRejectedValue(new Error("Unscripted open"));
	runtime.fs.readdir.mockResolvedValue([]);
	runtime.fs.readFile.mockResolvedValue(Buffer.alloc(0));
	runtime.fs.rm.mockResolvedValue(undefined);
	runtime.fs.rmdir.mockResolvedValue(undefined);
	runtime.fs.unlink.mockResolvedValue(undefined);
}

afterEach(() => {
	vi.clearAllMocks();
	resetFileSystemDefaults();
});

resetFileSystemDefaults();

describe("Git-backed behavior", () => {
	test("constructs resolve, facts, ancestry, and diff commands and parses their results", async () => {
		const { gateway, git } = gatewayFor([
			{
				args: ["rev-parse", "--verify", "--quiet", "topic^{commit}"],
				stdout: Buffer.from("  abc123\n"),
			},
			{
				args: ["show", "-s", "--format=%H%x00%P", "abc123"],
				stdout: Buffer.from("abc123\0parent-a parent-b\n"),
			},
			{ args: ["merge-base", "--is-ancestor", "parent-a", "abc123"] },
			{
				args: ["diff", "--name-only", "-z", "parent-a", "abc123"],
				stdout: Buffer.from("a.txt\0nested/b.txt\0"),
			},
		]);

		expect(await gateway.resolveCommit({ commitish: "topic" })).toEqual({
			ok: true,
			value: { type: "found", value: "abc123" },
		});
		expect(await gateway.readCommitFacts({ commit: "abc123" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: { commit: "abc123", parents: ["parent-a", "parent-b"], isMerge: true },
			},
		});
		expect(await gateway.isAncestor({ ancestor: "parent-a", descendant: "abc123" })).toEqual({
			ok: true,
			value: { type: "found", value: true },
		});
		expect(await gateway.diffCommits({ fromCommit: "parent-a", toCommit: "abc123" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: {
					fromCommit: "parent-a",
					toCommit: "abc123",
					changedPaths: ["a.txt", "nested/b.txt"],
				},
			},
		});
		git.assertComplete();
	});

	test("parses root and single-parent commit facts plus an empty diff", async () => {
		const { gateway } = gatewayFor([
			{
				args: ["show", "-s", "--format=%H%x00%P", "root"],
				stdout: Buffer.from("root\0\n"),
			},
			{
				args: ["show", "-s", "--format=%H%x00%P", "child"],
				stdout: Buffer.from("child\0root"),
			},
			{ args: ["diff", "--name-only", "-z", "root", "root"] },
		]);
		expect(await gateway.readCommitFacts({ commit: "root" })).toEqual({
			ok: true,
			value: { type: "found", value: { commit: "root", parents: [], isMerge: false } },
		});
		expect(await gateway.readCommitFacts({ commit: "child" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: { commit: "child", parents: ["root"], isMerge: false },
			},
		});
		expect(await gateway.diffCommits({ fromCommit: "root", toCommit: "root" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: { fromCommit: "root", toCommit: "root", changedPaths: [] },
			},
		});
	});

	test("normalizes git failures including non-Errors and ancestry exit status", async () => {
		const { gateway } = gatewayFor([
			{ args: ["rev-parse", "--verify", "--quiet", "bad^{commit}"], error: "not a commit" },
			{ args: ["merge-base", "--is-ancestor", "new", "old"], error: { code: 1 } },
			{ args: ["rev-parse", "--is-shallow-repository"], stdout: Buffer.from("false\n") },
			{ args: ["merge-base", "--is-ancestor", "a", "b"], error: { code: "1" } },
			{ args: ["diff", "--name-only", "-z", "a", "b"], error: new Error("diff failed") },
		]);
		expect(await gateway.resolveCommit({ commitish: "bad" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "not a commit" },
		});
		expect(await gateway.isAncestor({ ancestor: "new", descendant: "old" })).toEqual({
			ok: true,
			value: { type: "found", value: false },
		});
		expect(await gateway.isAncestor({ ancestor: "a", descendant: "b" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "[object Object]" },
		});
		expect(await gateway.diffCommits({ fromCommit: "a", toCommit: "b" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "diff failed" },
		});
	});

	test("classifies missing commits by probe exit status without inspecting diagnostics", async () => {
		const missing = "0".repeat(40);
		const existing = "a".repeat(40);
		const primaryFailure = () =>
			Object.assign(new Error("fatal message may be localized or unrelated"), { code: 128 });
		const missingProbe = () => Object.assign(new Error("quiet probe"), { code: 1 });
		const completeRepository = () => ({
			args: ["rev-parse", "--is-shallow-repository"],
			stdout: Buffer.from("false\n"),
		});
		const { gateway, git } = gatewayFor([
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: missingProbe(),
			},
			{
				args: ["show", "-s", "--format=%H%x00%P", missing],
				error: primaryFailure(),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: missingProbe(),
			},
			completeRepository(),
			{
				args: ["merge-base", "--is-ancestor", missing, existing],
				error: primaryFailure(),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: missingProbe(),
			},
			completeRepository(),
			{
				args: ["ls-tree", "-rz", "-r", "-t", missing, "--", "root"],
				error: primaryFailure(),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: missingProbe(),
			},
			completeRepository(),
			{
				args: ["diff", "--name-only", "-z", existing, missing],
				error: primaryFailure(),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${existing}^{commit}`],
				stdout: Buffer.from(`${existing}\n`),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: missingProbe(),
			},
			completeRepository(),
		]);
		for (const observation of [
			await gateway.resolveCommit({ commitish: missing }),
			await gateway.readCommitFacts({ commit: missing }),
			await gateway.isAncestor({ ancestor: missing, descendant: existing }),
			await gateway.inventoryCommitTree({ commit: missing, artifactRoot: "root" }),
			await gateway.diffCommits({ fromCommit: existing, toCommit: missing }),
		]) {
			expect(observation).toEqual({
				ok: true,
				value: { type: "unavailable", reason: "missing-object" },
			});
		}
		git.assertComplete();
	});

	test("classifies negative ancestry conservatively in shallow repositories", async () => {
		const { gateway, git } = gatewayFor([
			{ args: ["merge-base", "--is-ancestor", "new", "old"], error: { code: 1 } },
			{ args: ["rev-parse", "--is-shallow-repository"], stdout: Buffer.from("true\n") },
		]);
		expect(await gateway.isAncestor({ ancestor: "new", descendant: "old" })).toEqual({
			ok: true,
			value: { type: "unavailable", reason: "incomplete-history" },
		});
		git.assertComplete();
	});

	test("classifies missing required commits as incomplete history in shallow repositories", async () => {
		const missing = "0".repeat(40);
		const existing = "a".repeat(40);
		const primaryFailure = () =>
			Object.assign(new Error("fatal message may be localized or unrelated"), { code: 128 });
		const missingProbe = () => Object.assign(new Error("quiet probe"), { code: 1 });
		const shallowRepository = () => ({
			args: ["rev-parse", "--is-shallow-repository"],
			stdout: Buffer.from("true\n"),
		});
		const { gateway, git } = gatewayFor([
			{
				args: ["show", "-s", "--format=%H%x00%P", missing],
				error: primaryFailure(),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: missingProbe(),
			},
			shallowRepository(),
			{
				args: ["merge-base", "--is-ancestor", missing, existing],
				error: primaryFailure(),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: missingProbe(),
			},
			shallowRepository(),
		]);
		for (const observation of [
			await gateway.readCommitFacts({ commit: missing }),
			await gateway.isAncestor({ ancestor: missing, descendant: existing }),
		]) {
			expect(observation).toEqual({
				ok: true,
				value: { type: "unavailable", reason: "incomplete-history" },
			});
		}
		git.assertComplete();
	});

	test("keeps unresolved commitish input missing-object even in shallow repositories", async () => {
		const { gateway, git } = gatewayFor([
			{
				args: ["rev-parse", "--verify", "--quiet", "unknown^{commit}"],
				error: Object.assign(new Error("quiet probe"), { code: 1 }),
			},
		]);
		expect(await gateway.resolveCommit({ commitish: "unknown" })).toEqual({
			ok: true,
			value: { type: "unavailable", reason: "missing-object" },
		});
		git.assertComplete();
	});

	test("turns shallow-state probe failures into operational errors, never false ancestry", async () => {
		const { gateway, git } = gatewayFor([
			{ args: ["merge-base", "--is-ancestor", "new", "old"], error: { code: 1 } },
			{
				args: ["rev-parse", "--is-shallow-repository"],
				error: Object.assign(new Error("probe blew up"), { code: 128 }),
			},
			{ args: ["merge-base", "--is-ancestor", "new", "old"], error: { code: 1 } },
			{ args: ["rev-parse", "--is-shallow-repository"], stdout: Buffer.from("maybe\n") },
		]);
		expect(await gateway.isAncestor({ ancestor: "new", descendant: "old" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "probe blew up" },
		});
		expect(await gateway.isAncestor({ ancestor: "new", descendant: "old" })).toEqual({
			ok: false,
			error: {
				code: "source-error",
				message: "Unexpected git rev-parse --is-shallow-repository output.",
			},
		});
		git.assertComplete();
	});

	test("preserves the primary failure when the shallow-state probe fails during classification", async () => {
		const missing = "0".repeat(40);
		const { gateway, git } = gatewayFor([
			{
				args: ["show", "-s", "--format=%H%x00%P", missing],
				error: Object.assign(new Error("primary fatal failure"), { code: 128 }),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${missing}^{commit}`],
				error: Object.assign(new Error("quiet probe"), { code: 1 }),
			},
			{
				args: ["rev-parse", "--is-shallow-repository"],
				error: Object.assign(new Error("probe blew up"), { code: 128 }),
			},
		]);
		expect(await gateway.readCommitFacts({ commit: missing })).toEqual({
			ok: false,
			error: { code: "source-error", message: "primary fatal failure" },
		});
		git.assertComplete();
	});

	test("keeps fatal Git failures operational when commit probes succeed", async () => {
		const commit = "a".repeat(40);
		const { gateway, git } = gatewayFor([
			{
				args: ["show", "-s", "--format=%H%x00%P", commit],
				error: Object.assign(new Error("repository access failed"), { code: 128 }),
			},
			{
				args: ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`],
				stdout: Buffer.from(`${commit}\n`),
			},
		]);
		expect(await gateway.readCommitFacts({ commit })).toEqual({
			ok: false,
			error: { code: "source-error", message: "repository access failed" },
		});
		git.assertComplete();
	});

	test("maps every commit-tree kind and excludes descendants of marker directories", async () => {
		const output = [
			"040000 tree aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/dir",
			"100644 blob bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\troot/plain",
			"100755 blob cccccccccccccccccccccccccccccccccccccccc\troot/executable",
			"120000 blob dddddddddddddddddddddddddddddddddddddddd\troot/link",
			"160000 commit eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\troot/submodule",
			"100600 blob ffffffffffffffffffffffffffffffffffffffff\troot/special",
			"040000 tree aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/blocked/gitplane-artifact.json",
			"100644 blob bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\troot/blocked/gitplane-artifact.json/hidden",
		].join("\0");
		const { gateway } = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "commit", "--", "root"],
				stdout: Buffer.from(`${output}\0`),
			},
		]);
		expect(await gateway.inventoryCommitTree({ commit: "commit", artifactRoot: "root" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: [
					{ path: "root/dir", kind: "directory" },
					{ path: "root/plain", kind: "regular-file" },
					{ path: "root/executable", kind: "regular-file" },
					{ path: "root/link", kind: "symlink" },
					{ path: "root/submodule", kind: "submodule" },
					{ path: "root/special", kind: "special" },
					{ path: "root/blocked/gitplane-artifact.json", kind: "directory" },
				],
			},
		});
	});

	test("rejects unsafe commit pathspecs before executing git", async () => {
		const { gateway, git } = gatewayFor([]);
		for (const artifactRoot of ["../escape", "safe/../escape", "/absolute"]) {
			expect(await gateway.inventoryCommitTree({ commit: "c", artifactRoot })).toEqual({
				ok: false,
				error: { code: "source-error", message: "Path escapes invocation directory." },
			});
		}
		expect(git.invocations).toEqual([]);
	});

	test("reports malformed ls-tree records and executor failures", async () => {
		const { gateway } = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "c", "--", "root"],
				stdout: Buffer.from("malformed\0"),
			},
			{
				args: ["ls-tree", "-rz", "-r", "-t", "c", "--", "other"],
				error: new Error("ls-tree failed"),
			},
		]);
		expect(await gateway.inventoryCommitTree({ commit: "c", artifactRoot: "root" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "Unexpected git ls-tree output." },
		});
		expect(await gateway.inventoryCommitTree({ commit: "c", artifactRoot: "other" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "ls-tree failed" },
		});
	});

	test("reads multiple binary blobs in one batch and preserves tree order", async () => {
		const first = Buffer.from([0x00, 0x0a, 0xff]);
		const second = Buffer.alloc(0);
		const inventory = [
			"040000 tree aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/dir",
			"100644 blob bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\troot/a.bin",
			"120000 blob cccccccccccccccccccccccccccccccccccccccc\troot/link",
			"100755 blob dddddddddddddddddddddddddddddddddddddddd\troot/dir/empty",
		].join("\0");
		const { gateway, git } = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "commit", "--", "root"],
				stdout: Buffer.from(`${inventory}\0`),
			},
			{
				args: ["cat-file", "--batch"],
				input: "commit:root/a.bin\ncommit:root/dir/empty\n",
				stdout: Buffer.concat([
					batchRecord("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", first),
					batchRecord("dddddddddddddddddddddddddddddddddddddddd", second),
				]),
			},
		]);
		expect(await gateway.readCommitTreeCandidate({ commit: "commit", path: "root" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: {
					path: "root",
					entries: [
						{ path: "dir", kind: "directory" },
						{ path: "a.bin", kind: "regular-file", bytes: first },
						{ path: "link", kind: "symlink" },
						{ path: "dir/empty", kind: "regular-file", bytes: second },
					],
				},
			},
		});
		git.assertComplete();
	});

	test("does not invoke cat-file when a candidate has no regular files", async () => {
		const record = "040000 tree aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/dir\0";
		const { gateway, git } = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "commit", "--", "root"],
				stdout: Buffer.from(record),
			},
		]);
		expect(await gateway.readCommitTreeCandidate({ commit: "commit", path: "root" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: { path: "root", entries: [{ path: "dir", kind: "directory" }] },
			},
		});
		expect(git.invocations).toHaveLength(1);
	});

	test("reads newline paths with git show while ordinary paths remain batched", async () => {
		const ordinary = Buffer.from("ordinary");
		const newline = Buffer.from([0x00, 0x0a, 0xff]);
		const inventory = [
			"100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/plain",
			"100644 blob bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\troot/line\nbreak",
		].join("\0");
		const { gateway, git } = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "c", "--", "root"],
				stdout: Buffer.from(`${inventory}\0`),
			},
			{
				args: ["cat-file", "--batch"],
				input: "c:root/plain\n",
				stdout: batchRecord("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ordinary),
			},
			{ args: ["show", "c:root/line\nbreak"], stdout: newline },
		]);
		expect(await gateway.readCommitTreeCandidate({ commit: "c", path: "root" })).toEqual({
			ok: true,
			value: {
				type: "found",
				value: {
					path: "root",
					entries: [
						{ path: "plain", kind: "regular-file", bytes: ordinary },
						{ path: "line\nbreak", kind: "regular-file", bytes: newline },
					],
				},
			},
		});
		git.assertComplete();
	});

	test("turns malformed or truncated batch records into source errors", async () => {
		const tree = "100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/file\0";
		for (const output of [
			Buffer.from("no newline"),
			Buffer.from("object blob nope\n"),
			Buffer.from("object blob 4\nabc"),
			Buffer.from("object blob 3\nabcx"),
		]) {
			const { gateway } = gatewayFor([
				{
					args: ["ls-tree", "-rz", "-r", "-t", "c", "--", "root"],
					stdout: Buffer.from(tree),
				},
				{ args: ["cat-file", "--batch"], input: "c:root/file\n", stdout: output },
			]);
			expect(await gateway.readCommitTreeCandidate({ commit: "c", path: "root" })).toEqual({
				ok: false,
				error: { code: "source-error", message: "Unable to read c:root/file." },
			});
		}
	});

	test("propagates inventory, batch, and newline fallback failures", async () => {
		const inventoryFailure = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "c", "--", "root"],
				error: new Error("inventory unavailable"),
			},
		]);
		expect(
			await inventoryFailure.gateway.readCommitTreeCandidate({ commit: "c", path: "root" }),
		).toEqual({
			ok: false,
			error: { code: "source-error", message: "inventory unavailable" },
		});

		const tree = "100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/file\0";
		const batchFailure = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "c", "--", "root"],
				stdout: Buffer.from(tree),
			},
			{ args: ["cat-file", "--batch"], input: "c:root/file\n", error: new Error("batch failed") },
		]);
		expect(
			await batchFailure.gateway.readCommitTreeCandidate({ commit: "c", path: "root" }),
		).toEqual({
			ok: false,
			error: { code: "source-error", message: "batch failed" },
		});

		const newlineTree = "100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\troot/line\nbreak\0";
		const fallbackFailure = gatewayFor([
			{
				args: ["ls-tree", "-rz", "-r", "-t", "c", "--", "root"],
				stdout: Buffer.from(newlineTree),
			},
			{ args: ["show", "c:root/line\nbreak"], error: new Error("show failed") },
		]);
		expect(
			await fallbackFailure.gateway.readCommitTreeCandidate({ commit: "c", path: "root" }),
		).toEqual({
			ok: false,
			error: { code: "source-error", message: "show failed" },
		});
	});
});

describe("filesystem-backed behavior", () => {
	test("creates a marker atomically with exact filesystem ordering and a hook", async () => {
		const operations: string[] = [];
		const handle = {
			writeFile: vi.fn(async (marker: string, encoding: string) => {
				operations.push(`write:${encoding}:${marker}`);
			}),
			sync: vi.fn(async () => {
				operations.push("sync");
			}),
			close: vi.fn(async () => {
				operations.push("close");
			}),
		};
		runtime.fs.lstat.mockImplementation(async (target: string) => {
			operations.push(`lstat:${target}`);
			return directoryFacts();
		});
		runtime.fs.mkdir.mockImplementation(async (target: string) => {
			operations.push(`mkdir:${target}`);
		});
		runtime.fs.open.mockImplementation(async (target: string, flags: string) => {
			operations.push(`open:${target}:${flags}`);
			return handle;
		});
		runtime.fs.link.mockImplementation(async (source: string, target: string) => {
			operations.push(`link:${source}:${target}`);
		});
		runtime.fs.unlink.mockImplementation(async (target: string) => {
			operations.push(`unlink:${target}`);
		});
		const gateway = new RealArtifactGateway({
			cwd: "/repo/./",
			hooks: {
				beforePublish: async (temporaryPath) => {
					operations.push(`hook:${temporaryPath}`);
				},
			},
		});
		const temporaryPath = `/repo/artifact/.gitplane-artifact.json.${process.pid}.tmp`;
		expect(await gateway.createArtifact(artifactRequest())).toEqual({
			type: "created",
			directory: "artifact",
			artifactId,
		});
		expect(operations).toEqual([
			"lstat:/repo",
			"mkdir:/repo/artifact",
			`open:${temporaryPath}:wx`,
			`write:utf8:${artifactRequest().marker}`,
			"sync",
			"close",
			`hook:${temporaryPath}`,
			`link:${temporaryPath}:/repo/artifact/gitplane-artifact.json`,
			`unlink:${temporaryPath}`,
		]);
	});

	test("creates successfully without a hook and ignores temporary unlink failure", async () => {
		const handle = {
			writeFile: vi.fn().mockResolvedValue(undefined),
			sync: vi.fn().mockResolvedValue(undefined),
			close: vi.fn().mockResolvedValue(undefined),
		};
		runtime.fs.open.mockResolvedValue(handle);
		runtime.fs.unlink.mockRejectedValue(new Error("already gone"));
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest()),
		).toMatchObject({
			type: "created",
		});
		expect(runtime.fs.rm).not.toHaveBeenCalled();
	});

	test("rejects escaped create paths without touching the filesystem", async () => {
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest("../escape")),
		).toEqual({
			type: "error",
			error: { code: "source-error", message: "Path escapes invocation directory." },
		});
		expect(runtime.fs.lstat).not.toHaveBeenCalled();
	});

	test("classifies missing and non-directory parents and parent stat errors", async () => {
		runtime.fs.lstat.mockRejectedValueOnce(codedError("ENOENT"));
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest()),
		).toEqual({
			type: "parent-missing",
		});
		runtime.fs.lstat.mockResolvedValueOnce(fileFacts());
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest()),
		).toEqual({
			type: "parent-missing",
		});
		runtime.fs.lstat.mockRejectedValueOnce(codedError("EACCES", "permission denied"));
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest()),
		).toEqual({
			type: "error",
			error: { code: "source-error", message: "permission denied" },
		});
	});

	test("classifies existing targets and unexpected mkdir errors", async () => {
		runtime.fs.mkdir.mockRejectedValueOnce(codedError("EEXIST"));
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest()),
		).toEqual({
			type: "target-exists",
		});
		runtime.fs.mkdir.mockRejectedValueOnce(codedError("EROFS", "read only"));
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest()),
		).toEqual({
			type: "error",
			error: { code: "source-error", message: "read only" },
		});
	});

	test("always closes after write or sync failure and cleans up without masking the primary error", async () => {
		for (const failurePoint of ["write", "sync"] as const) {
			vi.clearAllMocks();
			resetFileSystemDefaults();
			const handle = {
				writeFile: vi.fn().mockResolvedValue(undefined),
				sync: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
			};
			handle[failurePoint === "write" ? "writeFile" : "sync"].mockRejectedValue(
				new Error(`${failurePoint} failed`),
			);
			runtime.fs.open.mockResolvedValue(handle);
			runtime.fs.rm.mockRejectedValue(new Error("rm failed"));
			runtime.fs.rmdir.mockRejectedValue(new Error("rmdir failed"));
			expect(
				await new RealArtifactGateway({ cwd: "/repo" }).createArtifact(artifactRequest()),
			).toEqual({
				type: "error",
				error: { code: "source-error", message: `${failurePoint} failed` },
			});
			expect(handle.close).toHaveBeenCalledOnce();
			expect(runtime.fs.rm).toHaveBeenCalledWith(
				`/repo/artifact/.gitplane-artifact.json.${process.pid}.tmp`,
				{ force: true },
			);
			expect(runtime.fs.rmdir).toHaveBeenCalledWith("/repo/artifact");
		}
	});

	test("reports close, hook, link, and open failures and attempts cleanup", async () => {
		for (const failurePoint of ["open", "close", "hook", "link"] as const) {
			vi.clearAllMocks();
			resetFileSystemDefaults();
			const handle = {
				writeFile: vi.fn().mockResolvedValue(undefined),
				sync: vi.fn().mockResolvedValue(undefined),
				close: vi.fn().mockResolvedValue(undefined),
			};
			const error = new Error(`${failurePoint} failed`);
			if (failurePoint === "open") runtime.fs.open.mockRejectedValue(error);
			else runtime.fs.open.mockResolvedValue(handle);
			if (failurePoint === "close") handle.close.mockRejectedValue(error);
			if (failurePoint === "link") runtime.fs.link.mockRejectedValue(error);
			const gateway = new RealArtifactGateway({
				cwd: "/repo",
				...(failurePoint === "hook"
					? { hooks: { beforePublish: async () => Promise.reject(error) } }
					: {}),
			});
			expect(await gateway.createArtifact(artifactRequest())).toEqual({
				type: "error",
				error: { code: "source-error", message: `${failurePoint} failed` },
			});
			expect(runtime.fs.rm).toHaveBeenCalledOnce();
			expect(runtime.fs.rmdir).toHaveBeenCalledOnce();
		}
	});

	test("sorts working-tree siblings, classifies entries, and avoids symlinks and marker directories", async () => {
		const child = (name: string) => ({ name });
		runtime.fs.readdir.mockImplementation(async (target: string) => {
			if (target === "/repo/root")
				return [child("z-special"), child("dir"), child("a-link"), child("file")];
			if (target === "/repo/root/dir") return [child("nested"), child("gitplane-artifact.json")];
			throw new Error(`Unexpected readdir: ${target}`);
		});
		runtime.fs.lstat.mockImplementation(async (target: string) => {
			if (target.endsWith("a-link")) return symlinkFacts();
			if (target.endsWith("file") || target.endsWith("nested")) return fileFacts();
			if (target.endsWith("z-special")) return specialFacts();
			return directoryFacts();
		});
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).inventoryWorkingTree({
				artifactRoot: "root",
			}),
		).toEqual({
			ok: true,
			value: [
				{ path: "root/a-link", kind: "symlink" },
				{ path: "root/dir", kind: "directory" },
				{ path: "root/dir/gitplane-artifact.json", kind: "directory" },
				{ path: "root/dir/nested", kind: "regular-file" },
				{ path: "root/file", kind: "regular-file" },
				{ path: "root/z-special", kind: "special" },
			],
		});
		expect(runtime.fs.readdir).toHaveBeenCalledTimes(2);
	});

	test("returns working-tree traversal errors including path confinement failures", async () => {
		runtime.fs.readdir.mockRejectedValueOnce(new Error("cannot list"));
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).inventoryWorkingTree({
				artifactRoot: "root",
			}),
		).toEqual({
			ok: false,
			error: { code: "source-error", message: "cannot list" },
		});
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).inventoryWorkingTree({
				artifactRoot: "../escape",
			}),
		).toEqual({
			ok: false,
			error: { code: "source-error", message: "Path escapes invocation directory." },
		});
	});

	test("reads only regular candidate files and preserves binary bytes", async () => {
		const child = (name: string) => ({ name });
		runtime.fs.readdir.mockResolvedValue([child("empty"), child("link"), child("body")]);
		runtime.fs.lstat.mockImplementation(async (target: string) => {
			if (target.endsWith("link")) return symlinkFacts();
			return fileFacts();
		});
		runtime.fs.readFile.mockImplementation(async (target: string) =>
			target.endsWith("body") ? Buffer.from([0x00, 0xff]) : Buffer.alloc(0),
		);
		expect(
			await new RealArtifactGateway({ cwd: "/repo" }).readWorkingTreeCandidate({ path: "root" }),
		).toEqual({
			ok: true,
			value: {
				path: "root",
				entries: [
					{ path: "body", kind: "regular-file", bytes: Buffer.from([0x00, 0xff]) },
					{ path: "empty", kind: "regular-file", bytes: Buffer.alloc(0) },
					{ path: "link", kind: "symlink" },
				],
			},
		});
		expect(runtime.fs.readFile).toHaveBeenCalledTimes(2);
	});

	test("propagates candidate inventory failures without reads and normalizes read failures", async () => {
		runtime.fs.readdir.mockRejectedValueOnce(new Error("inventory failed"));
		const gateway = new RealArtifactGateway({ cwd: "/repo" });
		expect(await gateway.readWorkingTreeCandidate({ path: "root" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "inventory failed" },
		});
		expect(runtime.fs.readFile).not.toHaveBeenCalled();

		runtime.fs.readdir.mockResolvedValueOnce([{ name: "file" }]);
		runtime.fs.lstat.mockResolvedValueOnce(fileFacts());
		runtime.fs.readFile.mockRejectedValueOnce(new Error("read failed"));
		expect(await gateway.readWorkingTreeCandidate({ path: "root" })).toEqual({
			ok: false,
			error: { code: "source-error", message: "read failed" },
		});
	});
});

describe("NodeGitCommandExecutor", () => {
	test("invokes git with exact buffered options and returns buffers unchanged", async () => {
		const stdout = Buffer.from("out");
		const stderr = Buffer.from("err");
		const stdin = { end: vi.fn() };
		const promise = Object.assign(Promise.resolve({ stdout, stderr }), {
			child: { stdin },
		});
		runtime.execFile.mockReturnValueOnce(promise);
		const executor = new NodeGitCommandExecutor("/repo/../repo/work");
		expect(await executor.execute(["status", "--porcelain"])).toEqual({ stdout, stderr });
		expect(runtime.execFile).toHaveBeenCalledWith("git", ["status", "--porcelain"], {
			cwd: "/repo/../repo/work",
			encoding: "buffer",
			maxBuffer: 64 * 1024 * 1024,
		});
		expect(stdin.end).not.toHaveBeenCalled();
	});

	test("ends optional stdin and propagates process rejection", async () => {
		const stdin = { end: vi.fn() };
		const successful = Object.assign(
			Promise.resolve({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
			{ child: { stdin } },
		);
		runtime.execFile.mockReturnValueOnce(successful);
		const executor = new NodeGitCommandExecutor("/repo");
		await executor.execute(["cat-file", "--batch"], { input: "HEAD:file\n" });
		expect(stdin.end).toHaveBeenCalledWith("HEAD:file\n");

		const failed = Object.assign(Promise.reject(new Error("spawn failed")), {
			child: {},
		});
		runtime.execFile.mockReturnValueOnce(failed);
		await expect(executor.execute(["status"])).rejects.toThrow("spawn failed");
	});
});

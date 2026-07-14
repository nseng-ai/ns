import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { createEmptyPreparedProjectHarnessArtifactTransitions } from "@nseng-ai/harness-artifacts/api";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";

import {
	activationRepositoryFailureType,
	applyNsActivation,
	prepareNsActivation,
} from "../../src/activate-ns.ts";
import type { NsActivationContext } from "../../src/activation-context.ts";
import { createLifecycleRecorder } from "../../src/lifecycle-observability.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactActivationGateway,
	InMemoryDeclaredExtensionsGateway,
} from "../../src/testing/index.ts";

function descriptor(
	spec: string,
	instructions: string | undefined,
	consumerDirs: readonly string[],
): DeclaredExtensionDescriptor {
	return {
		spec,
		sourceKind: "local",
		moduleRoot: `/repo/${spec}`,
		descriptorPath: `/repo/${spec}/extension.ts`,
		packageName: `@test/${spec}`,
		version: "1.0.0",
		descriptor: {
			description: spec,
			activation: {
				...(instructions === undefined ? {} : { instructions }),
				consumerDirs,
			},
		},
	};
}

function context(
	options: {
		files?: InMemoryActivationFilesGateway;
		descriptors?: readonly DeclaredExtensionDescriptor[];
		declaredExtensions?: InMemoryDeclaredExtensionsGateway;
		artifacts?: InMemoryArtifactActivationGateway;
	} = {},
): NsActivationContext {
	return {
		git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "main" }),
		files: options.files ?? new InMemoryActivationFilesGateway(),
		declaredExtensions:
			options.declaredExtensions ??
			new InMemoryDeclaredExtensionsGateway({
				result: { descriptors: options.descriptors ?? [], diagnostics: [] },
			}),
		artifacts: options.artifacts ?? new InMemoryArtifactActivationGateway(),
	};
}

const repository = { repoRoot: "/repo", trunkBranch: "main" } as const;

async function prepareActivation(
	context: Parameters<typeof prepareNsActivation>[0],
	options: Parameters<typeof prepareNsActivation>[1],
) {
	const recorder = createLifecycleRecorder();
	recorder.beginPhase("activation-preflight");
	return prepareNsActivation(context, options, recorder);
}

async function applyActivation(
	context: Parameters<typeof applyNsActivation>[0],
	prepared: Parameters<typeof applyNsActivation>[1],
) {
	const recorder = createLifecycleRecorder();
	recorder.beginPhase("activation-apply");
	return applyNsActivation(context, prepared, recorder);
}

describe("ns activation planning and apply", () => {
	it.each([
		[
			{ type: "not-a-git-repo", message: "missing", cwd: "/repo" } as const,
			"ns-init-not-a-git-repo",
		],
		[
			{ type: "trunk-undetectable", message: "missing trunk", repoRoot: "/repo" } as const,
			"ns-init-trunk-undetectable",
		],
		[
			{ type: "error", error: { code: "git-failed", message: "failed" } } as const,
			"ns-init-activation-failed",
		],
	])("selects the capability error type for repository failure $type", (result, expected) => {
		expect(
			activationRepositoryFailureType(result, {
				"not-a-git-repo": "ns-init-not-a-git-repo",
				"trunk-undetectable": "ns-init-trunk-undetectable",
				error: "ns-init-activation-failed",
			}),
		).toBe(expected);
	});

	it("preflights generic files, declaration-ordered instructions, and stable-deduplicated consumer dirs before applying in exact order", async () => {
		const files = new InMemoryActivationFilesGateway({
			files: { "AGENTS.md": "# Customer\n", "CLAUDE.md": "# Claude\n" },
		});
		const descriptors = [
			descriptor("one", "## One\n\nFirst.", [".ns/one", ".ns/shared"]),
			descriptor("two", "## Two\n\nSecond.", [".ns/shared", ".ns/two"]),
		];
		const declaredExtensions = new InMemoryDeclaredExtensionsGateway({
			result: { descriptors, diagnostics: [] },
		});
		const ctx = context({ files, declaredExtensions });
		const prepared = await prepareActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\nextensions = ["one","two"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		expect(files.operations()).toEqual([]);
		expect(declaredExtensions.calls()).toEqual([{ repoRoot: "/repo", specs: ["one", "two"] }]);
		expect(prepared.type).toBe("prepared");
		if (prepared.type !== "prepared") return;
		expect(
			prepared.activation.files["generated-instructions"].content.indexOf("## One"),
		).toBeLessThan(prepared.activation.files["generated-instructions"].content.indexOf("## Two"));
		expect(prepared.activation.consumerDirectories.map((entry) => entry.path)).toEqual([
			".ns/one",
			".ns/shared",
			".ns/two",
		]);

		const applied = await applyActivation(ctx, prepared.activation);
		expect(applied.type).toBe("activated");
		expect(files.operations()).toEqual([
			{ type: "write", path: "ns.toml" },
			{ type: "write", path: ".gitignore" },
			{ type: "write", path: "AGENTS.md" },
			{ type: "write", path: "CLAUDE.md" },
			{ type: "write", path: ".ns/instructions.md" },
			{ type: "ensure-directory", path: ".ns/one" },
			{ type: "ensure-directory", path: ".ns/shared" },
			{ type: "ensure-directory", path: ".ns/two" },
		]);
		expect(files.fileContent(".gitignore")).toBe(".ns/managed-extensions/\n");
		expect(files.fileContent("AGENTS.md")).toContain("# Customer");
		expect(files.fileContent("CLAUDE.md")).toContain("# Claude");
		expect(files.fileContent(".ns/one/.gitkeep")).toBe("");
	});

	it("appends the managed extensions ignore rule exactly once without changing existing content", async () => {
		const original = "# customer rules\nnode_modules/\n.ns/**\n";
		const files = new InMemoryActivationFilesGateway({ files: { ".gitignore": original } });
		const ctx = context({ files });
		const prepared = await prepareActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		expect(prepared.activation.files["managed-extensions-ignore"].change).toBe("appended");
		await applyActivation(ctx, prepared.activation);
		expect(files.fileContent(".gitignore")).toBe(`${original}.ns/managed-extensions/\n`);

		const rerun = await prepareActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "ns-toml",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "unchanged",
			nsTomlExpected: { type: "file", content: 'harnesses = ["pi"]\n' },
		});
		if (rerun.type !== "prepared") throw new Error("expected prepared rerun");
		expect(rerun.activation.files["managed-extensions-ignore"].change).toBe("unchanged");
	});

	it("treats a comment containing the managed extensions rule as absent", async () => {
		const files = new InMemoryActivationFilesGateway({
			files: { ".gitignore": "# .ns/managed-extensions/\n" },
		});
		const prepared = await prepareActivation(context({ files }), {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		expect(prepared.activation.files["managed-extensions-ignore"].content).toBe(
			"# .ns/managed-extensions/\n.ns/managed-extensions/\n",
		);
	});

	it("reports a non-file .gitignore during preflight and performs no operations", async () => {
		const files = new InMemoryActivationFilesGateway({ nonFilePaths: [".gitignore"] });
		const result = await prepareActivation(context({ files }), {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		expect(result).toMatchObject({
			type: "preflight-failed",
			diagnostics: [{ code: "activation-path-not-file", path: ".gitignore" }],
		});
		expect(files.operations()).toEqual([]);
	});

	it("reports .gitignore read errors during preflight and performs no operations", async () => {
		const files = new InMemoryActivationFilesGateway({
			readFailure: { code: "permission-denied", message: "permission denied" },
		});
		const result = await prepareActivation(context({ files }), {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		expect(result.type).toBe("preflight-failed");
		if (result.type !== "preflight-failed") return;
		expect(result.diagnostics).toContainEqual({
			code: "permission-denied",
			message: "permission denied",
			path: ".gitignore",
		});
		expect(files.operations()).toEqual([]);
	});

	it("bare core still writes the pointer and core instructions", async () => {
		const files = new InMemoryActivationFilesGateway();
		const ctx = context({ files });
		const prepared = await prepareActivation(ctx, {
			repository,
			harnesses: ["codex"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["codex"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		await applyActivation(ctx, prepared.activation);
		expect(files.fileContent("AGENTS.md")).toContain("@.ns/instructions.md");
		expect(files.fileContent(".ns/instructions.md")).toContain("# ns instructions");
	});

	it("aggregates descriptor, file, directory, and artifact diagnostics without mutating fake state", async () => {
		const files = new InMemoryActivationFilesGateway({
			files: { "AGENTS.md": "<!-- ns:begin v1 -->\nmissing end\n" },
			nonDirectoryPaths: [".ns/data"],
		});
		const artifacts = new InMemoryArtifactActivationGateway({
			prepareResult: {
				ok: true,
				prepared: {
					modules: [],
					selectedHarnesses: ["pi"],
					skippedCollisions: [],
					artifacts: [],
					reconciliation: createEmptyPreparedProjectHarnessArtifactTransitions({
						type: "strict",
						shouldForce: false,
					}),
					diagnostics: [
						{ code: "module_artifact_skill_entry_missing", message: "missing artifact" },
					],
				},
			},
		});
		const ctx: NsActivationContext = {
			...context({ files, descriptors: [descriptor("bad", undefined, [".ns/data"])], artifacts }),
			declaredExtensions: new InMemoryDeclaredExtensionsGateway({
				result: {
					descriptors: [descriptor("bad", undefined, [".ns/data"])],
					diagnostics: [
						{ severity: "error", code: "descriptor-bad", message: "bad descriptor", spec: "bad" },
					],
				},
			}),
		};
		const result = await prepareActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\nextensions = ["bad"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		expect(result).toMatchObject({ type: "preflight-failed" });
		if (result.type !== "preflight-failed") return;
		expect(result.diagnostics.map((item) => item.code)).toEqual(
			expect.arrayContaining([
				"descriptor-bad",
				"agents-pointer-malformed",
				"consumer-path-not-directory",
				"module_artifact_skill_entry_missing",
			]),
		);
		expect(files.operations()).toEqual([]);
	});

	it.each([
		["ns-toml", "ns.toml"],
		["managed-extensions-ignore", ".gitignore"],
		["agents-instructions", "AGENTS.md"],
		["claude-instructions", "CLAUDE.md"],
		["generated-instructions", ".ns/instructions.md"],
	] as const)("preserves an externally mutated %s activation file", async (file, path) => {
		const originalNsToml = 'harnesses = ["pi"]\n';
		const files = new InMemoryActivationFilesGateway({
			files: {
				"ns.toml": originalNsToml,
				".gitignore": "customer-ignore\n",
				"AGENTS.md": "# Customer agents\n",
				"CLAUDE.md": "# Customer claude\n",
				".ns/instructions.md": "old generated instructions\n",
			},
		});
		const prepared = await prepareActivation(context({ files }), {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n# activation update\n',
			nsTomlChange: "appended",
			nsTomlExpected: { type: "file", content: originalNsToml },
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		files.simulateExternalMutation({ type: "write-file", path, content: `external ${file}\n` });

		const result = await applyActivation(context({ files }), prepared.activation);
		expect(result).toMatchObject({
			type: "apply-failed",
			phase: file,
			error: {
				code: "activation-prepared-state-mismatch",
				details: { type: "content", path },
			},
		});
		expect(files.fileContent(path)).toBe(`external ${file}\n`);
	});

	it("preserves a file created after prepare expected it to be missing", async () => {
		const files = new InMemoryActivationFilesGateway();
		const prepared = await prepareActivation(context({ files }), {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		files.simulateExternalMutation({
			type: "write-file",
			path: "ns.toml",
			content: "customer created\n",
		});

		const result = await applyActivation(context({ files }), prepared.activation);
		expect(result).toMatchObject({
			type: "apply-failed",
			error: { details: { type: "presence", expected: "missing", actual: "present" } },
		});
		expect(files.fileContent("ns.toml")).toBe("customer created\n");
	});

	it("reports activation file kind changes without mutating the replacement", async () => {
		const original = "# Customer\n";
		const files = new InMemoryActivationFilesGateway({ files: { "AGENTS.md": original } });
		const prepared = await prepareActivation(context({ files }), {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		files.simulateExternalMutation({ type: "replace-file-with-non-file", path: "AGENTS.md" });

		const result = await applyActivation(context({ files }), prepared.activation);
		expect(result).toMatchObject({
			type: "apply-failed",
			phase: "agents-instructions",
			error: { details: { type: "kind", path: "AGENTS.md", expected: "file" } },
		});
	});

	it.each([
		{
			name: "consumer directory presence",
			state: {},
			mutation: { type: "create-directory", path: ".ns/data" } as const,
			details: { type: "presence", path: ".ns/data" },
		},
		{
			name: "consumer directory kind",
			state: {},
			mutation: { type: "replace-directory-with-non-directory", path: ".ns/data" } as const,
			details: { type: "kind", path: ".ns/data" },
		},
		{
			name: ".gitkeep presence",
			state: { directories: [".ns/data"] },
			mutation: { type: "write-file", path: ".ns/data/.gitkeep", content: "customer\n" } as const,
			details: { type: "presence", path: ".ns/data/.gitkeep" },
		},
		{
			name: ".gitkeep kind",
			state: { directories: [".ns/data"] },
			mutation: { type: "replace-file-with-non-file", path: ".ns/data/.gitkeep" } as const,
			details: { type: "kind", path: ".ns/data/.gitkeep" },
		},
	] as const)("preserves $name mutations", async ({ state, mutation, details }) => {
		const files = new InMemoryActivationFilesGateway(state);
		const prepared = await prepareActivation(
			context({ files, descriptors: [descriptor("one", undefined, [".ns/data"])] }),
			{
				repository,
				harnesses: ["pi"],
				harnessSource: "explicit",
				nsTomlContent: 'harnesses = ["pi"]\n',
				nsTomlChange: "created",
				nsTomlExpected: { type: "missing" },
			},
		);
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		files.simulateExternalMutation(mutation);

		const result = await applyActivation(context({ files }), prepared.activation);
		expect(result).toMatchObject({
			type: "apply-failed",
			phase: "consumer-directories",
			error: { code: "activation-prepared-state-mismatch", details },
			completed: {
				files: {
					"ns-toml": { change: "created" },
					"generated-instructions": { change: "created" },
				},
			},
		});
	});

	it("stops on apply failure and reports only completed duties", async () => {
		const files = new InMemoryActivationFilesGateway({
			writeFailures: { "CLAUDE.md": { code: "disk-full", message: "disk full" } },
		});
		const ctx = context({ files });
		const prepared = await prepareActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
			nsTomlExpected: { type: "missing" },
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		const result = await applyActivation(ctx, prepared.activation);
		expect(result).toMatchObject({
			type: "apply-failed",
			phase: "claude-instructions",
			completed: {
				files: {
					"ns-toml": { change: "created" },
					"agents-instructions": { change: "created" },
				},
			},
		});
		expect(files.operations()).toEqual([
			{ type: "write", path: "ns.toml" },
			{ type: "write", path: ".gitignore" },
			{ type: "write", path: "AGENTS.md" },
		]);
	});
});

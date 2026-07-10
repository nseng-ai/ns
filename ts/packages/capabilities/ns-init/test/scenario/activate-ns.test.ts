import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";

import { applyNsActivation, prepareNsActivation } from "../../src/activate-ns.ts";
import type { NsActivationContext } from "../../src/activation-context.ts";
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

describe("ns activation planning and apply", () => {
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
		const prepared = await prepareNsActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\nextensions = ["one","two"]\n',
			nsTomlChange: "created",
		});
		expect(files.operations()).toEqual([]);
		expect(declaredExtensions.calls()).toEqual([{ repoRoot: "/repo", specs: ["one", "two"] }]);
		expect(prepared.type).toBe("prepared");
		if (prepared.type !== "prepared") return;
		expect(prepared.activation.instructions.content.indexOf("## One")).toBeLessThan(
			prepared.activation.instructions.content.indexOf("## Two"),
		);
		expect(prepared.activation.consumerDirectories.map((entry) => entry.path)).toEqual([
			".ns/one",
			".ns/shared",
			".ns/two",
		]);

		const applied = await applyNsActivation(ctx, prepared.activation);
		expect(applied.type).toBe("activated");
		expect(files.operations()).toEqual([
			{ type: "write", path: "ns.toml" },
			{ type: "write", path: "AGENTS.md" },
			{ type: "write", path: "CLAUDE.md" },
			{ type: "write", path: ".ns/instructions.md" },
			{ type: "ensure-directory", path: ".ns/one" },
			{ type: "ensure-directory", path: ".ns/shared" },
			{ type: "ensure-directory", path: ".ns/two" },
		]);
		expect(files.fileContent("AGENTS.md")).toContain("# Customer");
		expect(files.fileContent("CLAUDE.md")).toContain("# Claude");
		expect(files.fileContent(".ns/one/.gitkeep")).toBe("");
	});

	it("bare core still writes the pointer and core instructions", async () => {
		const files = new InMemoryActivationFilesGateway();
		const ctx = context({ files });
		const prepared = await prepareNsActivation(ctx, {
			repository,
			harnesses: ["codex"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["codex"]\n',
			nsTomlChange: "created",
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		await applyNsActivation(ctx, prepared.activation);
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
		const result = await prepareNsActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\nextensions = ["bad"]\n',
			nsTomlChange: "created",
		});
		expect(result).toMatchObject({ type: "preflight-failed", completed: {} });
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

	it("stops on apply failure and reports only completed duties", async () => {
		const files = new InMemoryActivationFilesGateway({
			writeFailures: { "CLAUDE.md": { code: "disk-full", message: "disk full" } },
		});
		const ctx = context({ files });
		const prepared = await prepareNsActivation(ctx, {
			repository,
			harnesses: ["pi"],
			harnessSource: "explicit",
			nsTomlContent: 'harnesses = ["pi"]\n',
			nsTomlChange: "created",
		});
		if (prepared.type !== "prepared") throw new Error("expected prepared");
		const result = await applyNsActivation(ctx, prepared.activation);
		expect(result).toMatchObject({
			type: "apply-failed",
			phase: "claude-instructions",
			completed: { nsToml: { change: "created" }, agentsInstructionFile: { change: "created" } },
		});
		expect(files.operations()).toEqual([
			{ type: "write", path: "ns.toml" },
			{ type: "write", path: "AGENTS.md" },
		]);
	});
});

import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";
import { managedNpmProjectRoot } from "@nseng-ai/kernel/extensions/acquisition";

import type { ExtensionUninstallContext } from "../../src/uninstall-extension.ts";
import { uninstallExtension } from "../../src/uninstall-extension.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactActivationGateway,
	InMemoryDeclaredExtensionsGateway,
	InMemoryExtensionUninstallAcquisitionGateway,
} from "../../src/testing/index.ts";

function descriptor(spec: string, instructions = "## Remaining\n"): DeclaredExtensionDescriptor {
	const moduleRoot = resolve("/repo", spec);
	return {
		spec,
		sourceKind: "local",
		moduleRoot,
		descriptorPath: `${moduleRoot}/extension.ts`,
		packageName: "@test/remaining",
		version: "1.0.0",
		descriptor: {
			description: "remaining",
			activation: { instructions, consumerDirs: [".ns/remaining-data"] },
		},
	};
}

function fixture(options: {
	nsToml?: string;
	files?: InMemoryActivationFilesGateway;
	descriptors?: readonly DeclaredExtensionDescriptor[];
	diagnostics?: readonly {
		severity: "error";
		code: string;
		message: string;
		spec: string;
	}[];
	cleanup?: InMemoryExtensionUninstallAcquisitionGateway;
	git?: InMemoryGitGateway;
	artifacts?: InMemoryArtifactActivationGateway;
}): {
	context: ExtensionUninstallContext;
	files: InMemoryActivationFilesGateway;
	declaredExtensions: InMemoryDeclaredExtensionsGateway;
	cleanup: InMemoryExtensionUninstallAcquisitionGateway;
	artifacts: InMemoryArtifactActivationGateway;
} {
	const files =
		options.files ??
		new InMemoryActivationFilesGateway({
			files: options.nsToml === undefined ? {} : { "ns.toml": options.nsToml },
		});
	const declaredExtensions = new InMemoryDeclaredExtensionsGateway({
		result: {
			descriptors: options.descriptors ?? [],
			diagnostics: options.diagnostics ?? [],
		},
	});
	const cleanup = options.cleanup ?? new InMemoryExtensionUninstallAcquisitionGateway();
	const artifacts = options.artifacts ?? new InMemoryArtifactActivationGateway();
	return {
		files,
		declaredExtensions,
		cleanup,
		artifacts,
		context: {
			git:
				options.git ?? new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "main" }),
			files,
			declaredExtensions,
			artifacts,
			uninstallAcquisition: cleanup,
		},
	};
}

const initializedToml = 'harnesses = ["pi"]\n';

describe("uninstallExtension", () => {
	it("matches npm identity across versions, reports removed-source artifacts, then removes bytes", async () => {
		const cleanup = new InMemoryExtensionUninstallAcquisitionGateway({
			installedPackageNames: ["@test/tools"],
		});
		const artifacts = new InMemoryArtifactActivationGateway({
			applyResult: {
				ok: true,
				completed: [
					{
						key: "pi:tools",
						action: "removed",
						artifactId: "@test/tools:tools",
						skillName: "tools",
						harness: "pi",
						targetArtifactPath: "/repo/.pi/skills/tools",
						manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
						writtenFiles: [],
						conflictingFiles: [],
						removedFiles: ["/repo/.pi/skills/tools/SKILL.md"],
						removalReason: "removed-source",
					},
				],
			},
		});
		const { context, files, declaredExtensions } = fixture({
			nsToml: `${initializedToml}extensions = ["npm:@test/tools@1.0.0", "./remaining"]\n`,
			descriptors: [descriptor("./remaining")],
			cleanup,
			artifacts,
		});

		const result = await uninstallExtension(context, {
			cwd: "/repo/subdir",
			source: "npm:@test/tools@2.0.0",
		});

		expect(result).toMatchObject({
			type: "ok",
			data: {
				sourceKind: "npm",
				sourceIdentity: "@test/tools",
				matchedDeclarationSpec: "npm:@test/tools@1.0.0",
				hasRemovedDeclaration: true,
				cleanup: {
					status: "removed",
					path: managedNpmProjectRoot("/repo", "@test/tools"),
				},
				completed: {
					artifacts: [
						{
							action: "removed",
							removalReason: "removed-source",
							removedFiles: [expect.any(String)],
						},
					],
				},
			},
		});
		expect(files.fileContent("ns.toml")).toBe(`${initializedToml}extensions = [ "./remaining"]\n`);
		expect(files.fileContent(".ns/instructions.md")).toContain("Remaining");
		expect(declaredExtensions.calls()).toEqual([{ repoRoot: "/repo", specs: ["./remaining"] }]);
		expect(cleanup.installedPackages()).not.toContain("@test/tools");
	});

	it("normalizes local identity and preserves source bytes and consumer data", async () => {
		const files = new InMemoryActivationFilesGateway({
			files: {
				"ns.toml": `${initializedToml}extensions = ["./extensions/tools"]\n`,
				"extensions/tools/package.json": "source bytes",
				".ns/tools-data/user.txt": "consumer data",
			},
			directories: [".ns/tools-data"],
		});
		const { context, cleanup } = fixture({ files });

		const result = await uninstallExtension(context, {
			cwd: "/repo",
			source: "extensions/../extensions/tools",
		});

		expect(result).toMatchObject({
			type: "ok",
			data: {
				sourceKind: "local",
				sourceIdentity: "/repo/extensions/tools",
				matchedDeclarationSpec: "./extensions/tools",
				cleanup: { status: "not-applicable" },
			},
		});
		expect(files.fileContent("extensions/tools/package.json")).toBe("source bytes");
		expect(files.fileContent(".ns/tools-data/user.txt")).toBe("consumer data");
		expect(files.hasDirectory(".ns/tools-data")).toBe(true);
		expect(cleanup.removals()).toEqual([]);
	});

	it("runs full activation and cleans orphaned npm bytes when no declaration matches", async () => {
		const cleanup = new InMemoryExtensionUninstallAcquisitionGateway({
			installedPackageNames: ["@test/orphan"],
		});
		const original = `${initializedToml}extensions = ["./remaining"]\n`;
		const { context, files, declaredExtensions } = fixture({
			nsToml: original,
			descriptors: [descriptor("./remaining")],
			cleanup,
		});

		const result = await uninstallExtension(context, {
			cwd: "/repo",
			source: "npm:@test/orphan@9.0.0",
		});

		expect(result).toMatchObject({
			type: "ok",
			data: { hasRemovedDeclaration: false, cleanup: { status: "removed" } },
		});
		expect(result).not.toHaveProperty("data.matchedDeclarationSpec");
		expect(files.fileContent("ns.toml")).toBe(original);
		expect(declaredExtensions.calls()).toEqual([{ repoRoot: "/repo", specs: ["./remaining"] }]);
	});

	it.each([
		["npm:", "ns-extension-uninstall-source-invalid"],
		["git:github/acme/tools@main", "ns-extension-uninstall-source-unsupported"],
		["https://example.test/tools.tgz", "ns-extension-uninstall-source-unsupported"],
	])(
		"rejects invalid or unsupported source %s with zero writes and cleanup",
		async (source, errorType) => {
			const { context, files, cleanup } = fixture({ nsToml: initializedToml });
			const result = await uninstallExtension(context, { cwd: "/repo", source });
			expect(result).toMatchObject({ type: "failure", errorType, data: { completed: {} } });
			expect(files.operations()).toEqual([]);
			expect(cleanup.removals()).toEqual([]);
		},
	);

	it("rejects ambiguous duplicate identities before descriptor loading", async () => {
		const { context, files, cleanup, declaredExtensions } = fixture({
			nsToml: `${initializedToml}extensions = ["npm:@test/tools", "npm:@test/tools@1.0.0"]\n`,
		});
		const result = await uninstallExtension(context, {
			cwd: "/repo",
			source: "npm:@test/tools@2.0.0",
		});
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-uninstall-ambiguous-identity",
			data: { matchingSpecs: ["npm:@test/tools", "npm:@test/tools@1.0.0"], completed: {} },
		});
		expect(declaredExtensions.calls()).toEqual([]);
		expect(files.operations()).toEqual([]);
		expect(cleanup.removals()).toEqual([]);
	});

	it("keeps writes and cleanup at zero when a remaining descriptor fails preflight", async () => {
		const { context, files, cleanup } = fixture({
			nsToml: `${initializedToml}extensions = ["./target", "./remaining"]\n`,
			diagnostics: [
				{
					severity: "error",
					code: "extension_descriptor_invalid",
					message: "remaining descriptor invalid",
					spec: "./remaining",
				},
			],
		});
		const result = await uninstallExtension(context, { cwd: "/repo", source: "./target" });
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-uninstall-preflight-failed",
			data: { diagnostics: [{ code: "extension-descriptor-invalid" }], completed: {} },
		});
		expect(files.operations()).toEqual([]);
		expect(cleanup.removals()).toEqual([]);
	});

	it("does not clean managed bytes when activation apply fails", async () => {
		const files = new InMemoryActivationFilesGateway({
			files: { "ns.toml": `${initializedToml}extensions = ["npm:@test/tools"]\n` },
			writeFailures: { "ns.toml": { code: "write_failed", message: "cannot write ns.toml" } },
		});
		const cleanup = new InMemoryExtensionUninstallAcquisitionGateway({
			installedPackageNames: ["@test/tools"],
		});
		const { context } = fixture({ files, cleanup });
		const result = await uninstallExtension(context, {
			cwd: "/repo",
			source: "npm:@test/tools",
		});
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-uninstall-apply-failed",
			data: { completed: {} },
		});
		expect(cleanup.installedPackages()).toContain("@test/tools");
		expect(cleanup.removals()).toEqual([]);
	});

	it("reports cleanup failure after completed activation and a rerun converges", async () => {
		const files = new InMemoryActivationFilesGateway({
			files: { "ns.toml": `${initializedToml}extensions = ["npm:@test/tools"]\n` },
		});
		const failingCleanup = new InMemoryExtensionUninstallAcquisitionGateway({
			installedPackageNames: ["@test/tools"],
			failureByPackageName: {
				"@test/tools": {
					code: "extension_acquisition_npm_remove_failed",
					message: "managed bytes are busy",
					path: managedNpmProjectRoot("/repo", "@test/tools"),
				},
			},
		});
		const firstFixture = fixture({ files, cleanup: failingCleanup });
		const first = await uninstallExtension(firstFixture.context, {
			cwd: "/repo",
			source: "npm:@test/tools",
		});
		expect(first).toMatchObject({
			type: "failure",
			errorType: "ns-extension-uninstall-managed-package-cleanup-failed",
			data: {
				phase: "managed-package-cleanup",
				diagnostic: { code: "extension-acquisition-npm-remove-failed" },
				completed: { files: { "ns-toml": { change: "replaced" } } },
			},
		});
		expect(files.fileContent("ns.toml")).toBe(`${initializedToml}extensions = []\n`);

		const succeedingCleanup = new InMemoryExtensionUninstallAcquisitionGateway({
			installedPackageNames: ["@test/tools"],
		});
		const rerunFixture = fixture({ files, cleanup: succeedingCleanup });
		const rerun = await uninstallExtension(rerunFixture.context, {
			cwd: "/repo",
			source: "npm:@test/tools",
		});
		expect(rerun).toMatchObject({
			type: "ok",
			data: { hasRemovedDeclaration: false, cleanup: { status: "removed" } },
		});
	});

	it.each([
		[undefined, "ns-extension-uninstall-harnesses-missing"],
		['harnesses = ["unknown"]\n', "ns-extension-uninstall-harnesses-invalid"],
		[`${initializedToml}extensions = [42]\n`, "ns-extension-uninstall-config-invalid"],
	])("returns stable config failure for %s", async (nsToml, errorType) => {
		const { context, files, cleanup } = fixture(nsToml === undefined ? {} : { nsToml });
		const result = await uninstallExtension(context, { cwd: "/repo", source: "./target" });
		expect(result).toMatchObject({ type: "failure", errorType, data: { completed: {} } });
		expect(files.operations()).toEqual([]);
		expect(cleanup.removals()).toEqual([]);
	});

	it("returns a stable repository failure", async () => {
		const { context, files, cleanup } = fixture({
			nsToml: initializedToml,
			git: new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } }),
		});
		const result = await uninstallExtension(context, { cwd: "/outside", source: "./target" });
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-uninstall-not-a-git-repo",
			data: { diagnostics: [{ code: "not-a-git-repo" }], completed: {} },
		});
		expect(files.operations()).toEqual([]);
		expect(cleanup.removals()).toEqual([]);
	});
});

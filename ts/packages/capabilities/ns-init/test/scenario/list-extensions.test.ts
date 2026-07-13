import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";

import type { ArtifactProvisioningStatusSummary } from "../../src/artifact-provisioning-status.ts";

import type { ExtensionListContext } from "../../src/list-extensions.ts";
import { listExtensions, renderListExtensionsHuman } from "../../src/list-extensions.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactProvisioningStatusGateway,
	InMemoryDeclaredExtensionsGateway,
} from "../../src/testing/index.ts";

function descriptor(options: {
	spec: string;
	sourceKind?: "local" | "npm";
	packageName?: string;
	version?: string;
	moduleRoot?: string;
}): DeclaredExtensionDescriptor {
	const sourceKind = options.sourceKind ?? "local";
	const packageName = options.packageName ?? "@test/tools";
	const moduleRoot =
		options.moduleRoot ??
		(sourceKind === "local"
			? resolve("/repo", options.spec)
			: `/repo/.ns/managed-extensions/npm/node_modules/${packageName}`);
	return {
		spec: options.spec,
		sourceKind,
		moduleRoot,
		descriptorPath: `${moduleRoot}/extension.ts`,
		packageName,
		version: options.version ?? "1.0.0",
		descriptor: { description: packageName },
	};
}

function fixture(
	options: {
		nsToml?: string;
		git?: InMemoryGitGateway;
		files?: InMemoryActivationFilesGateway;
		descriptors?: readonly DeclaredExtensionDescriptor[];
		diagnostics?: readonly {
			severity: "error";
			code: string;
			message: string;
			spec: string;
			relatedSpecs?: readonly string[];
			path?: string;
		}[];
		artifactSummaries?: readonly ArtifactProvisioningStatusSummary[];
	} = {},
): {
	context: ExtensionListContext;
	files: InMemoryActivationFilesGateway;
	declaredExtensions: InMemoryDeclaredExtensionsGateway;
	artifacts: InMemoryArtifactProvisioningStatusGateway;
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
	const artifacts = new InMemoryArtifactProvisioningStatusGateway(
		options.artifactSummaries === undefined ? {} : { summaries: options.artifactSummaries },
	);
	return {
		files,
		declaredExtensions,
		artifacts,
		context: {
			git: options.git ?? new InMemoryGitGateway({ optionalRepoRoot: "/repo" }),
			files,
			declaredExtensions,
			artifactProvisioningStatus: artifacts,
		},
	};
}

describe("listExtensions", () => {
	it("fails outside git and on repository inspection error", async () => {
		const outside = fixture({
			git: new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } }),
		});
		await expect(listExtensions(outside.context, { cwd: "/work" })).resolves.toMatchObject({
			type: "failure",
			errorType: "ns-extension-list-not-a-git-repo",
			data: { diagnostics: [{ code: "not-a-git-repo", path: "/work" }] },
		});

		const failed = fixture({
			git: new InMemoryGitGateway({
				optionalRepoRoot: {
					type: "failure",
					error: { code: "repo_root_failed", message: "git failed" },
				},
			}),
		});
		await expect(listExtensions(failed.context, { cwd: "/work" })).resolves.toMatchObject({
			type: "failure",
			errorType: "ns-extension-list-repository-failed",
			data: { diagnostics: [{ code: "repo-root-failed", message: "git failed" }] },
		});
	});

	it.each([
		["missing ns.toml", undefined],
		["no extensions setting", 'harnesses = ["pi"]\n'],
		["an empty extension list", 'harnesses = ["pi"]\nextensions = []\n'],
	])("returns an empty successful inventory for %s", async (_label, nsToml) => {
		const { context, declaredExtensions, artifacts } = fixture(
			nsToml === undefined ? {} : { nsToml },
		);
		await expect(listExtensions(context, { cwd: "/repo/subdir" })).resolves.toEqual({
			type: "ok",
			data: { repoRoot: "/repo", configPath: "/repo/ns.toml", extensions: [] },
		});
		expect(declaredExtensions.calls()).toEqual([]);
		expect(artifacts.inspectCalls()).toEqual([]);
	});

	it.each([
		["non-file", new InMemoryActivationFilesGateway({ nonFilePaths: ["ns.toml"] })],
		[
			"unreadable",
			new InMemoryActivationFilesGateway({
				readFailure: { code: "read_failed", message: "cannot read" },
			}),
		],
		[
			"invalid TOML",
			new InMemoryActivationFilesGateway({ files: { "ns.toml": "extensions = [\n" } }),
		],
		[
			"invalid extensions",
			new InMemoryActivationFilesGateway({ files: { "ns.toml": 'extensions = "no"\n' } }),
		],
		[
			"invalid harnesses",
			new InMemoryActivationFilesGateway({
				files: { "ns.toml": 'extensions = ["./ext"]\nharnesses = ["cursor"]\n' },
			}),
		],
	])("fails rather than returning partial inventory for %s config", async (_label, files) => {
		const { context } = fixture({ files });
		await expect(listExtensions(context, { cwd: "/repo" })).resolves.toMatchObject({
			type: "failure",
			errorType: "ns-extension-list-config-invalid",
			data: { diagnostics: [{ code: expect.any(String), path: "/repo/ns.toml" }] },
		});
	});

	it("preserves declaration order and merges resolved and artifact facts", async () => {
		const npm = descriptor({
			spec: "npm:@test/tools",
			sourceKind: "npm",
			packageName: "@test/tools",
			version: "2.0.0",
		});
		const local = descriptor({
			spec: "./extensions/local",
			packageName: "@test/local",
			version: "3.0.0",
		});
		const { context, files, artifacts } = fixture({
			nsToml: 'harnesses = ["pi"]\nextensions = ["npm:@test/tools", "./extensions/local"]\n',
			descriptors: [npm, local],
			artifactSummaries: [
				{
					moduleRoot: npm.moduleRoot,
					artifactStatus: "provisioned",
					artifactCount: 2,
					affectedArtifactCount: 0,
					diagnostics: [],
				},
				{
					moduleRoot: local.moduleRoot,
					artifactStatus: "needs-reconcile",
					artifactCount: 3,
					affectedArtifactCount: 1,
					diagnostics: [{ code: "artifact-stale", message: "one stale artifact" }],
				},
			],
		});

		const result = await listExtensions(context, { cwd: "/repo" });
		expect(result).toEqual({
			type: "ok",
			data: {
				repoRoot: "/repo",
				configPath: "/repo/ns.toml",
				extensions: [
					{
						sourceSpec: npm.spec,
						sourceKind: "npm",
						packageName: "@test/tools",
						packageVersion: "2.0.0",
						moduleRoot: npm.moduleRoot,
						acquisitionStatus: "installed",
						artifactStatus: "provisioned",
						artifactCount: 2,
						affectedArtifactCount: 0,
						diagnostics: [],
					},
					{
						sourceSpec: local.spec,
						sourceKind: "local",
						packageName: "@test/local",
						packageVersion: "3.0.0",
						moduleRoot: local.moduleRoot,
						acquisitionStatus: "installed",
						artifactStatus: "needs-reconcile",
						artifactCount: 3,
						affectedArtifactCount: 1,
						diagnostics: [{ code: "artifact-stale", message: "one stale artifact" }],
					},
				],
			},
		});
		expect(artifacts.inspectCalls()).toHaveLength(1);
		expect(files.operations()).toEqual([]);
	});

	it("keeps missing, invalid, unsupported, malformed, and duplicate declarations as rows", async () => {
		const specs = [
			"npm:@test/missing",
			"./broken",
			"git:https://example.test/ext.git",
			"https://example.test/ext.tgz",
			"npm:",
			"./duplicate",
			"./duplicate/../duplicate",
		];
		const { context, artifacts } = fixture({
			nsToml: `harnesses = ["pi"]\nextensions = ${JSON.stringify(specs)}\n`,
			diagnostics: [
				{
					severity: "error",
					code: "extension_descriptor_package_missing",
					message: "package missing",
					spec: specs[0]!,
				},
				{
					severity: "error",
					code: "extension_descriptor_invalid",
					message: "descriptor invalid",
					spec: specs[1]!,
					path: "/repo/broken/extension.ts",
				},
				{
					severity: "error",
					code: "extension_descriptor_source_unsupported",
					message: "git unsupported",
					spec: specs[2]!,
				},
				{
					severity: "error",
					code: "extension_descriptor_package_missing",
					message: "URI was parsed as a missing local package by descriptor loading",
					spec: specs[3]!,
				},
				{
					severity: "error",
					code: "extension_acquisition_invalid_npm_spec",
					message: "npm invalid",
					spec: specs[4]!,
				},
				{
					severity: "error",
					code: "extension_descriptor_duplicate_identity",
					message: "duplicate",
					spec: specs[5]!,
					relatedSpecs: [specs[6]!],
				},
			],
		});

		const result = await listExtensions(context, { cwd: "/repo" });
		if (result.type !== "ok") throw new Error("expected successful inventory");
		expect(result.data.extensions.map((row) => row.sourceSpec)).toEqual(specs);
		expect(result.data.extensions.map((row) => row.sourceKind)).toEqual([
			"npm",
			"local",
			"git",
			"unsupported",
			"npm",
			"local",
			"local",
		]);
		expect(result.data.extensions.map((row) => row.acquisitionStatus)).toEqual([
			"missing",
			"invalid",
			"invalid",
			"invalid",
			"invalid",
			"invalid",
			"invalid",
		]);
		expect(result.data.extensions.every((row) => row.artifactStatus === "unavailable")).toBe(true);
		expect(result.data.extensions[3]?.diagnostics).toEqual([
			{
				code: "extension-descriptor-source-unsupported",
				message:
					"Extension source must be an npm: spec or an unprefixed local path: https://example.test/ext.tgz.",
			},
		]);
		expect(result.data.extensions[5]?.diagnostics[0]?.code).toBe(
			"extension-descriptor-duplicate-identity",
		);
		expect(result.data.extensions[6]?.diagnostics[0]?.code).toBe(
			"extension-descriptor-duplicate-identity",
		);
		expect(artifacts.inspectCalls()).toEqual([]);
	});

	it.each([
		["none", 0, 0],
		["provisioned", 2, 0],
		["needs-reconcile", 2, 1],
		["conflicted", 2, 1],
		["unavailable", 1, 1],
	] as const)(
		"propagates %s artifact summaries and normalizes diagnostics at the contract edge",
		async (artifactStatus, artifactCount, affectedArtifactCount) => {
			const record = descriptor({ spec: "./extension" });
			const { context } = fixture({
				nsToml: 'harnesses = ["pi"]\nextensions = ["./extension"]\n',
				descriptors: [record],
				artifactSummaries: [
					{
						moduleRoot: record.moduleRoot,
						artifactStatus,
						artifactCount,
						affectedArtifactCount,
						diagnostics: [{ code: "artifact_status_fact", message: "status fact" }],
					},
				],
			});

			const result = await listExtensions(context, { cwd: "/repo" });

			expect(result).toMatchObject({
				type: "ok",
				data: {
					extensions: [
						{
							artifactStatus,
							artifactCount,
							affectedArtifactCount,
							diagnostics: [{ code: "artifact-status-fact", message: "status fact" }],
						},
					],
				},
			});
		},
	);

	it("returns acquisition facts with unavailable artifacts when harnesses are missing", async () => {
		const record = descriptor({ spec: "./extension", packageName: "@test/extension" });
		const { context, artifacts } = fixture({
			nsToml: 'extensions = ["./extension"]\n',
			descriptors: [record],
		});
		const result = await listExtensions(context, { cwd: "/repo" });
		expect(result).toMatchObject({
			type: "ok",
			data: {
				extensions: [
					{
						acquisitionStatus: "installed",
						packageName: "@test/extension",
						artifactStatus: "unavailable",
						diagnostics: [{ code: "harnesses-missing", path: "/repo/ns.toml" }],
					},
				],
			},
		});
		expect(artifacts.inspectCalls()).toEqual([]);
	});

	it("publishes readable empty, table, and diagnostic human output", async () => {
		expect(
			renderListExtensionsHuman({
				repoRoot: "/repo",
				configPath: "/repo/ns.toml",
				extensions: [],
			}),
		).toBe("No extensions declared in ns.toml.");
		const record = descriptor({ spec: "./extension" });
		const result = await listExtensions(
			fixture({
				nsToml: 'extensions = ["./extension"]\n',
				descriptors: [record],
			}).context,
			{ cwd: "/repo" },
		);
		if (result.type !== "ok") throw new Error("expected successful inventory");
		const rendered = renderListExtensionsHuman(result.data);
		expect(rendered).toContain("SOURCE");
		expect(rendered).toContain("./extension");
		expect(rendered).toContain("ARTIFACTS (AFFECTED/OBSERVED)");
		expect(rendered).toContain("unavailable 0/0 (observed may be partial)");
		expect(rendered).toContain("Diagnostics:");
		expect(rendered).toContain("[harnesses-missing]");
	});
});

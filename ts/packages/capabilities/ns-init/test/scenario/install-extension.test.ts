import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import { createEmptyPreparedProjectHarnessArtifactTransitions } from "@nseng-ai/harness-artifacts/api";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";
import { npmPackageRoot } from "@nseng-ai/kernel/extensions/acquisition";

import type { ExtensionInstallContext } from "../../src/install-extension.ts";
import { installExtension } from "../../src/install-extension.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactActivationGateway,
	InMemoryDeclaredExtensionsGateway,
	InMemoryExtensionInstallAcquisitionGateway,
} from "../../src/testing/index.ts";

function descriptor(options: {
	spec: string;
	sourceKind?: "local" | "npm";
	packageName?: string;
	version?: string;
}): DeclaredExtensionDescriptor {
	const sourceKind = options.sourceKind ?? "local";
	const packageName = options.packageName ?? "@test/tools";
	const moduleRoot =
		sourceKind === "npm" ? npmPackageRoot("/repo", packageName) : resolve("/repo", options.spec);
	return {
		spec: options.spec,
		sourceKind,
		moduleRoot,
		descriptorPath: `${moduleRoot}/extension.ts`,
		packageName,
		version: options.version ?? "1.0.0",
		descriptor: { description: "tools" },
	};
}

function fixture(options: {
	nsToml?: string;
	descriptors?: readonly DeclaredExtensionDescriptor[];
	diagnostics?: readonly {
		severity: "error";
		code: string;
		message: string;
		spec: string;
	}[];
	files?: InMemoryActivationFilesGateway;
	acquisition?: InMemoryExtensionInstallAcquisitionGateway;
	artifacts?: InMemoryArtifactActivationGateway;
}): {
	context: ExtensionInstallContext;
	files: InMemoryActivationFilesGateway;
	acquisition: InMemoryExtensionInstallAcquisitionGateway;
} {
	const files =
		options.files ??
		new InMemoryActivationFilesGateway({
			files: options.nsToml === undefined ? {} : { "ns.toml": options.nsToml },
		});
	const acquisition = options.acquisition ?? new InMemoryExtensionInstallAcquisitionGateway();
	return {
		files,
		acquisition,
		context: {
			git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "main" }),
			files,
			acquisition,
			declaredExtensions: new InMemoryDeclaredExtensionsGateway({
				result: {
					descriptors: options.descriptors ?? [],
					diagnostics: options.diagnostics ?? [],
				},
			}),
			artifacts: options.artifacts ?? new InMemoryArtifactActivationGateway(),
		},
	};
}

const initializedToml = 'harnesses = ["pi"]\n';

describe("installExtension", () => {
	it("records and activates a local package in place", async () => {
		const source = "./extensions/tools";
		const { context, files } = fixture({
			nsToml: initializedToml,
			descriptors: [descriptor({ spec: source })],
		});
		const result = await installExtension(context, { cwd: "/repo/subdir", source });
		expect(result).toMatchObject({
			type: "ok",
			data: {
				sourceSpec: source,
				sourceKind: "local",
				moduleRoot: "/repo/extensions/tools",
				isRecorded: true,
				repoRoot: "/repo",
				trunkBranch: "main",
				harnesses: ["pi"],
			},
		});
		expect(files.fileContent("ns.toml")).toBe(
			'harnesses = ["pi"]\nextensions = ["./extensions/tools"]\n',
		);
	});

	it.each([
		["npm:@test/tools", "1.0.0"],
		["npm:@test/tools@2.0.0", "2.0.0"],
	])("ensures and activates npm source %s", async (source, version) => {
		const record = descriptor({
			spec: source,
			sourceKind: "npm",
			packageName: "@test/tools",
			version,
		});
		const { context, acquisition } = fixture({ nsToml: initializedToml, descriptors: [record] });
		const result = await installExtension(context, { cwd: "/repo", source });
		expect(result).toMatchObject({
			type: "ok",
			data: {
				sourceKind: "npm",
				packageName: "@test/tools",
				packageVersion: version,
				moduleRoot: npmPackageRoot("/repo", "@test/tools"),
			},
		});
		expect(acquisition.installedRoots()).toContain(npmPackageRoot("/repo", "@test/tools"));
	});

	it("is idempotent for an exact npm spec without duplicating the declaration", async () => {
		const source = "npm:@test/tools";
		const root = npmPackageRoot("/repo", "@test/tools");
		const acquisition = new InMemoryExtensionInstallAcquisitionGateway({
			installedPackageRoots: [root],
		});
		const { context, files } = fixture({
			nsToml: `${initializedToml}extensions = ["${source}"]\n`,
			descriptors: [descriptor({ spec: source, sourceKind: "npm" })],
			acquisition,
		});
		const result = await installExtension(context, { cwd: "/repo", source });
		expect(result).toMatchObject({ type: "ok", data: { isRecorded: false } });
		expect(files.fileContent("ns.toml")).toBe(`${initializedToml}extensions = ["${source}"]\n`);
		expect(acquisition.installedRoots()).toEqual(new Set([root]));
	});

	it("restores missing npm bytes for an exact recorded declaration", async () => {
		const source = "npm:@test/tools";
		const root = npmPackageRoot("/repo", "@test/tools");
		const acquisition = new InMemoryExtensionInstallAcquisitionGateway();
		const { context } = fixture({
			nsToml: `${initializedToml}extensions = ["${source}"]\n`,
			descriptors: [descriptor({ spec: source, sourceKind: "npm" })],
			acquisition,
		});

		const result = await installExtension(context, { cwd: "/repo", source });

		expect(result).toMatchObject({ type: "ok", data: { isRecorded: false, moduleRoot: root } });
		expect(acquisition.installedRoots()).toContain(root);
		expect(acquisition.calls()).toEqual([{ repoRoot: "/repo", sourceSpec: source }]);
	});

	it.each([
		[undefined, "ns-extension-install-harnesses-missing"],
		['extensions = ["./old"]\n', "ns-extension-install-harnesses-missing"],
		['harnesses = ["unknown"]\n', "ns-extension-install-harnesses-invalid"],
	])(
		"rejects missing or invalid persisted harness config before acquisition",
		async (nsToml, errorType) => {
			const { context, files, acquisition } = fixture(nsToml === undefined ? {} : { nsToml });
			const result = await installExtension(context, { cwd: "/repo", source: "npm:@test/tools" });
			expect(result).toMatchObject({ type: "failure", errorType, data: { completed: {} } });
			expect(acquisition.calls()).toEqual([]);
			expect(files.operations()).toEqual([]);
		},
	);

	it.each(["git:github/acme/tools@main", "https://example.test/tools.tgz"])(
		"rejects unsupported source %s before acquisition",
		async (source) => {
			const { context, files, acquisition } = fixture({ nsToml: initializedToml });
			const result = await installExtension(context, { cwd: "/repo", source });
			expect(result).toMatchObject({
				type: "failure",
				errorType: "ns-extension-install-source-unsupported",
				data: { completed: {} },
			});
			expect(acquisition.calls()).toEqual([]);
			expect(files.operations()).toEqual([]);
		},
	);

	it.each([
		['extensions = ["npm:@test/tools"]\n', "npm:@test/tools@2.0.0"],
		['extensions = ["./extensions/tools"]\n', "extensions/../extensions/tools"],
	])("rejects identity conflicts before acquisition", async (extensions, source) => {
		const { context, files, acquisition } = fixture({ nsToml: initializedToml + extensions });
		const result = await installExtension(context, { cwd: "/repo", source });
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-install-identity-conflict",
			data: { requestedSpec: source, completed: {} },
		});
		expect(acquisition.calls()).toEqual([]);
		expect(files.operations()).toEqual([]);
	});

	it("rejects invalid extension config before acquisition or writes", async () => {
		const { context, files, acquisition } = fixture({
			nsToml: `${initializedToml}extensions = [42]\n`,
		});
		const result = await installExtension(context, {
			cwd: "/repo",
			source: "npm:@test/tools",
		});
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-install-config-invalid",
			data: { completed: {} },
		});
		expect(acquisition.calls()).toEqual([]);
		expect(files.operations()).toEqual([]);
	});

	it("maps acquisition failures without writing project files", async () => {
		const source = "npm:@test/tools";
		const acquisition = new InMemoryExtensionInstallAcquisitionGateway({
			failureBySpec: {
				[source]: {
					code: "extension_acquisition_npm_install_failed",
					message: "npm unavailable",
					spec: source,
				},
			},
		});
		const { context, files } = fixture({ nsToml: initializedToml, acquisition });
		const result = await installExtension(context, { cwd: "/repo", source });
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-install-acquisition-failed",
			data: {
				phase: "acquisition",
				diagnostics: [{ code: "extension-acquisition-npm-install-failed" }],
				completed: {},
			},
		});
		expect(files.operations()).toEqual([]);
		expect(files.fileContent("ns.toml")).toBe(initializedToml);
	});

	it.each([
		["extension_descriptor_package_missing", "missing package"],
		["extension_descriptor_package_json_invalid", "invalid package manifest"],
		["extension_descriptor_export_missing", "missing descriptor export"],
		["extension_descriptor_import_failed", "descriptor import failed"],
		["extension_descriptor_invalid", "invalid descriptor"],
	])(
		"keeps durable writes at zero for descriptor preflight diagnostic %s",
		async (code, message) => {
			const source = "npm:@test/tools";
			const { context, files } = fixture({
				nsToml: initializedToml,
				diagnostics: [{ severity: "error", code, message, spec: source }],
			});
			const result = await installExtension(context, { cwd: "/repo", source });
			expect(result).toMatchObject({
				type: "failure",
				errorType: "ns-extension-install-preflight-failed",
				data: { diagnostics: [{ code: code.replaceAll("_", "-") }], completed: {} },
			});
			expect(files.operations()).toEqual([]);
			expect(files.fileContent("ns.toml")).toBe(initializedToml);
		},
	);

	it("rejects artifact identity collisions during preflight without recording the source", async () => {
		const source = "./extensions/tools";
		const artifacts = new InMemoryArtifactActivationGateway({
			prepareResult: {
				ok: true,
				prepared: {
					modules: [],
					selectedHarnesses: ["pi"],
					diagnostics: [],
					skippedCollisions: [
						{ kind: "target-name", value: "tools", packages: ["@acme/a", "@acme/b"] },
					],
					artifacts: [],
					reconciliation: createEmptyPreparedProjectHarnessArtifactTransitions({
						type: "strict",
						shouldForce: false,
					}),
				},
			},
		});
		const { context, files } = fixture({
			nsToml: initializedToml,
			descriptors: [descriptor({ spec: source })],
			artifacts,
		});

		const result = await installExtension(context, { cwd: "/repo", source });

		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-install-preflight-failed",
			data: { diagnostics: [{ code: "artifact-collision" }], completed: {} },
		});
		expect(files.operations()).toEqual([]);
		expect(files.fileContent("ns.toml")).toBe(initializedToml);
	});

	it("reports completed duties on apply failure and a rerun converges", async () => {
		const source = "./extensions/tools";
		const files = new InMemoryActivationFilesGateway({
			files: { "ns.toml": initializedToml },
			writeFailures: {
				"AGENTS.md": { code: "write-failed", message: "cannot write AGENTS.md" },
			},
		});
		const firstFixture = fixture({
			files,
			descriptors: [descriptor({ spec: source })],
		});
		const first = await installExtension(firstFixture.context, { cwd: "/repo", source });
		expect(first).toMatchObject({
			type: "failure",
			errorType: "ns-extension-install-apply-failed",
			data: {
				phase: "agents-instructions",
				completed: {
					nsToml: { change: "appended" },
					managedExtensionsIgnore: { change: "created" },
				},
			},
		});
		expect(files.fileContent("ns.toml")).toContain(source);

		const recoveredFiles = new InMemoryActivationFilesGateway({
			files: {
				"ns.toml": files.fileContent("ns.toml") ?? "",
				".gitignore": files.fileContent(".gitignore") ?? "",
			},
		});
		const rerunFixture = fixture({
			files: recoveredFiles,
			descriptors: [descriptor({ spec: source })],
		});
		const rerun = await installExtension(rerunFixture.context, { cwd: "/repo", source });
		expect(rerun).toMatchObject({
			type: "ok",
			data: {
				isRecorded: false,
				completed: {
					nsToml: { change: "unchanged" },
					managedExtensionsIgnore: { change: "unchanged" },
				},
			},
		});
	});
});

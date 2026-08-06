import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";
import type { UserExtensionPackageAvailabilityFact } from "@nseng-ai/sdk/extensions/user-package-availability";
import { userManagedNpmStorage } from "@nseng-ai/sdk/project-config";
import { createEmptyPreparedHarnessArtifactTransitions } from "../../src/harness-artifacts/api.ts";

import type { InMemoryUserNpmUpdateAcquisitionState } from "../../src/init/extension-acquisition.ts";
import type { ExtensionInstallContext } from "../../src/init/install-extension.ts";
import {
	installExtension,
	renderInstallExtensionHuman,
	renderInstallExtensionMarkdown,
} from "../../src/init/install-extension.ts";
import type { ExtensionListContext } from "../../src/init/list-extensions.ts";
import { listExtensions } from "../../src/init/list-extensions.ts";
import type { ExtensionUninstallContext } from "../../src/init/uninstall-extension.ts";
import { uninstallExtension } from "../../src/init/uninstall-extension.ts";
import type { ExtensionUpdateContext } from "../../src/init/update-extension.ts";
import { updateExtension } from "../../src/init/update-extension.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactActivationGateway,
	InMemoryArtifactProvisioningStatusGateway,
	InMemoryDeclaredExtensionsGateway,
	InMemoryExtensionInstallAcquisitionGateway,
	InMemoryExtensionUninstallAcquisitionGateway,
	InMemoryExtensionUpdateAcquisitionGateway,
	InMemoryUserNpmUpdateAcquisitionGateway,
	InMemoryUserArtifactActivationGateway,
	InMemoryUserExtensionConfigGateway,
	InMemoryUserExtensionAvailabilityGateway,
} from "../../src/init/testing/index.ts";

const sourceSpec = "/work/extensions/tools";
const descriptor: DeclaredExtensionDescriptor = {
	spec: sourceSpec,
	sourceKind: "local",
	moduleRoot: sourceSpec,
	descriptorPath: `${sourceSpec}/extension.ts`,
	packageName: "@test/tools",
	version: "1.0.0",
	descriptor: { description: "tools" },
};

function contexts(
	userExtensionConfig: InMemoryUserExtensionConfigGateway,
	options: {
		readonly descriptors?: readonly DeclaredExtensionDescriptor[];
		readonly diagnostics?: readonly {
			readonly severity: "error";
			readonly code: string;
			readonly message: string;
			readonly spec: string;
		}[];
		readonly availabilityFacts?: readonly UserExtensionPackageAvailabilityFact[];
		readonly installedPackageRoots?: readonly string[];
		readonly existingProjectRoots?: readonly string[];
		readonly installedPackageNames?: readonly string[];
		readonly userArtifacts?: InMemoryUserArtifactActivationGateway;
		readonly userNpmUpdate?: InMemoryUserNpmUpdateAcquisitionState;
		readonly env?: Readonly<Record<string, string | undefined>>;
		readonly cleanupFailureByPackageName?: Readonly<
			Record<
				string,
				{
					readonly code: "extension_acquisition_npm_remove_failed";
					readonly message: string;
					readonly path?: string;
				}
			>
		>;
	} = {},
) {
	const declaredExtensions = new InMemoryDeclaredExtensionsGateway({
		result: {
			descriptors: options.descriptors ?? [descriptor],
			diagnostics: options.diagnostics ?? [],
		},
	});
	const userExtensionAvailability = new InMemoryUserExtensionAvailabilityGateway({
		facts:
			options.availabilityFacts ??
			(options.descriptors ?? [descriptor]).map((item) => ({
				sourceSpec: item.spec,
				availability: "available",
				packageName: item.packageName,
				diagnostics: [],
			})),
	});
	const shared = {
		git: new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } }),
		files: new InMemoryActivationFilesGateway(),
		declaredExtensions,
		userExtensionConfig,
		userExtensionAvailability,
		userArtifacts: options.userArtifacts ?? new InMemoryUserArtifactActivationGateway(),
		...(options.env === undefined ? {} : { env: { ...options.env } }),
		userManagedNpmStorage: {
			type: "available" as const,
			storage: userManagedNpmStorage("/home/test/.local/share/ns/extensions"),
		},
		artifacts: new InMemoryArtifactActivationGateway(),
	};
	return {
		install: {
			...shared,
			installAcquisition: new InMemoryExtensionInstallAcquisitionGateway({
				...(options.installedPackageRoots === undefined
					? {}
					: { installedPackageRoots: options.installedPackageRoots }),
				...(options.existingProjectRoots === undefined
					? {}
					: { existingProjectRoots: options.existingProjectRoots }),
			}),
			uninstallAcquisition: new InMemoryExtensionUninstallAcquisitionGateway({
				...(options.installedPackageNames === undefined
					? {}
					: { installedPackageNames: options.installedPackageNames }),
				...(options.cleanupFailureByPackageName === undefined
					? {}
					: { failureByPackageName: options.cleanupFailureByPackageName }),
			}),
		} satisfies ExtensionInstallContext,
		list: {
			...shared,
			artifactProvisioningStatus: new InMemoryArtifactProvisioningStatusGateway(),
			installedExtensionPackages: { list: () => [] },
		} satisfies ExtensionListContext,
		update: {
			...shared,
			userNpmUpdateAcquisition: new InMemoryUserNpmUpdateAcquisitionGateway({
				candidateModuleRootBySpec: Object.fromEntries(
					(options.descriptors ?? [descriptor])
						.filter((item) => item.sourceKind === "npm")
						.map((item) => [item.spec, item.moduleRoot]),
				),
				existingCanonicalPackageNames:
					options.installedPackageRoots?.map(() => "@test/tools") ?? [],
				...options.userNpmUpdate,
			}),
			updateAcquisition: new InMemoryExtensionUpdateAcquisitionGateway(
				options.installedPackageRoots === undefined
					? {}
					: { installedPackageRoots: options.installedPackageRoots },
			),
		} satisfies ExtensionUpdateContext,
		uninstall: {
			...shared,
			uninstallAcquisition: new InMemoryExtensionUninstallAcquisitionGateway({
				...(options.installedPackageNames === undefined
					? {}
					: { installedPackageNames: options.installedPackageNames }),
				...(options.cleanupFailureByPackageName === undefined
					? {}
					: { failureByPackageName: options.cleanupFailureByPackageName }),
			}),
		} satisfies ExtensionUninstallContext,
	};
}

function preparedUserArtifacts(options: {
	readonly selectedHarnesses?: readonly ("claude-code" | "codex" | "pi")[];
	readonly skippedCollisions?: readonly {
		readonly kind: "id" | "target-name";
		readonly value: string;
		readonly packages: readonly string[];
	}[];
	readonly orphans?: readonly {
		readonly artifactId: string;
		readonly harness: "claude-code" | "codex" | "pi";
		readonly scope: "user";
		readonly targetRoot: string;
		readonly packageName: string;
		readonly sourceType: "npm-module";
	}[];
}) {
	return {
		modules: [],
		selectedHarnesses: [...(options.selectedHarnesses ?? ["pi"])],
		diagnostics: [],
		skippedCollisions: [...(options.skippedCollisions ?? [])],
		artifacts: [],
		reconciliation: {
			...createEmptyPreparedHarnessArtifactTransitions({ type: "strict", shouldForce: false }),
			orphans: [...(options.orphans ?? [])],
		},
	};
}

describe("user extension lifecycle", () => {
	it("installs, lists, validates, and uninstalls a canonical local declaration without project activation", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: "# keep\r\n[other]\r\nvalue = 1\r\n",
		});
		const context = contexts(config);
		const install = await installExtension(context.install, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(install).toMatchObject({
			status: "success",
			data: {
				scope: "user",
				sourceSpec,
				declarationAction: "appended",
				commandAvailability: "unavailable",
			},
		});
		expect(config.fileContent()).toBe(
			`# keep\r\nextensions = [${JSON.stringify(sourceSpec)}]\r\n[other]\r\nvalue = 1\r\n`,
		);

		const listed = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		expect(listed).toMatchObject({
			status: "success",
			data: { scope: "user", extensions: [{ sourceSpec, commandAvailability: "unavailable" }] },
		});

		const updated = await updateExtension(context.update, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
			dryRun: false,
		});
		expect(updated).toMatchObject({
			status: "success",
			data: {
				scope: "user",
				acquisitionOutcome: "local-in-place",
				activation: "not-performed",
				configWrite: "not-performed",
			},
		});
		expect(config.writes).toHaveLength(1);

		const uninstalled = await uninstallExtension(context.uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(uninstalled).toMatchObject({
			status: "success",
			data: { scope: "user", declarationAction: "removed", cleanup: { status: "not-applicable" } },
		});
		expect(config.fileContent()).toBe("# keep\r\nextensions = []\r\n[other]\r\nvalue = 1\r\n");
	});

	it("installs, updates, lists, and uninstalls a user npm extension in managed storage", async () => {
		const npmSpec = "npm:@test/tools";
		const moduleRoot =
			"/home/test/.local/share/ns/extensions/npm/@test/tools/node_modules/@test/tools";
		const npmDescriptor: DeclaredExtensionDescriptor = {
			...descriptor,
			spec: npmSpec,
			sourceKind: "npm",
			moduleRoot,
			descriptorPath: `${moduleRoot}/extension.ts`,
		};
		const config = new InMemoryUserExtensionConfigGateway();
		const context = contexts(config, {
			descriptors: [npmDescriptor],
			installedPackageNames: ["@test/tools"],
		});
		const installed = await installExtension(context.install, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});
		expect(installed).toMatchObject({
			status: "success",
			data: { sourceKind: "npm", acquisitionOutcome: "installed", declarationAction: "appended" },
		});
		expect(context.install.installAcquisition.calls()[0]).toMatchObject({
			sourceSpec: npmSpec,
			managedNpmStorage: { npmRoot: "/home/test/.local/share/ns/extensions/npm" },
		});
		const listed = await listExtensions(context.list, { cwd: "/unrelated", scope: "user" });
		expect(listed).toMatchObject({
			status: "success",
			data: { extensions: [{ sourceKind: "npm", commandAvailability: "unavailable", moduleRoot }] },
		});
		const updated = await updateExtension(context.update, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
			dryRun: false,
		});
		expect(updated).toMatchObject({
			status: "success",
			data: { acquisitionIntent: "refresh-floating", acquisitionOutcome: "restored" },
		});
		const uninstalled = await uninstallExtension(context.uninstall, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});
		expect(uninstalled).toMatchObject({
			status: "success",
			data: { declarationAction: "removed", cleanup: { status: "removed" } },
		});
	});

	it.each([
		{
			label: "floating restore",
			npmSpec: "npm:@test/tools",
			installedPackageRoots: [] as readonly string[],
			expectedIntent: "refresh-floating",
			expectedOutcome: "restored",
		},
		{
			label: "pinned unchanged",
			npmSpec: "npm:@test/tools@1.0.0",
			installedPackageRoots: [
				"/home/test/.local/share/ns/extensions/npm/@test/tools/node_modules/@test/tools",
			] as readonly string[],
			expectedIntent: "ensure-pinned",
			expectedOutcome: "unchanged",
		},
	] as const)(
		"retains managed npm bytes when whole-catalog admission rejects an applied $label update",
		async ({ npmSpec, installedPackageRoots }) => {
			const otherSpec = "/work/extensions/other";
			const content = `extensions = [${JSON.stringify(otherSpec)}, ${JSON.stringify(npmSpec)}]\n`;
			const config = new InMemoryUserExtensionConfigGateway({ content });
			const collisionDiagnostic = {
				severity: "error" as const,
				code: "extension_package_same_level_conflict",
				message: "Conflicts with another User package.",
				spec: npmSpec,
				contributionId: "user:tools",
				packageName: "@test/tools",
				sourceLevel: "user" as const,
			};
			const npmModuleRoot =
				"/home/test/.local/share/ns/extensions/npm/@test/tools/node_modules/@test/tools";
			const context = contexts(config, {
				descriptors: [
					{
						...descriptor,
						spec: npmSpec,
						sourceKind: "npm",
						moduleRoot: npmModuleRoot,
						descriptorPath: `${npmModuleRoot}/extension.ts`,
					},
				],
				installedPackageRoots,
				availabilityFacts: [
					{
						sourceSpec: otherSpec,
						availability: "available",
						packageName: "@test/other",
						diagnostics: [],
					},
					{
						sourceSpec: npmSpec,
						availability: "unavailable",
						packageName: "@test/tools",
						diagnostics: [collisionDiagnostic],
					},
				],
			});

			const result = await updateExtension(context.update, {
				cwd: "/outside",
				source: npmSpec,
				scope: "user",
				dryRun: false,
			});

			expect(result).toEqual({
				status: "failure",
				errorType: "ns-extension-update-user-package-unavailable",
				message: `User extension package is not fully available: ${npmSpec}.`,
				data: {
					scope: "user",
					sourceSpec: npmSpec,
					diagnostics: [{ ...collisionDiagnostic, code: "extension-package-same-level-conflict" }],
					canonicalBytesUnchanged: true,
				},
			});
			expect(context.update.updateAcquisition.operations()).toEqual([]);
			expect(context.update.userNpmUpdateAcquisition.operations()).toEqual([
				{ operation: "prepare", sourceSpec: npmSpec },
				{ operation: "discard", sourceSpec: npmSpec },
			]);
			expect(context.update.userExtensionAvailability.calls()).toEqual([
				{
					configDir: "/home/test/.config/ns",
					sourceSpecs: [otherSpec, npmSpec],
					npmPackageRootOverride: {
						sourceSpec: npmSpec,
						packageName: "@test/tools",
						moduleRoot: npmModuleRoot,
					},
				},
			]);
			expect(context.update.updateAcquisition.installedRoots()).toEqual(
				new Set(installedPackageRoots),
			);
			expect(context.update.declaredExtensions.calls()).toHaveLength(1);
			expect(config.fileContent()).toBe(content);
			expect(config.writes).toEqual([]);
			expect(context.update.files.operations()).toEqual([]);
			expect(context.update.artifacts.prepareCalls()).toEqual([]);
			expect(context.update.artifacts.applyCalls()).toEqual([]);
		},
	);

	it("rejects malformed user npm update config before acquisition", async () => {
		const content = "extensions = [\n";
		const config = new InMemoryUserExtensionConfigGateway({ content });
		const context = contexts(config);

		const result = await updateExtension(context.update, {
			cwd: "/outside",
			source: "npm:@test/tools",
			scope: "user",
			dryRun: false,
		});

		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-update-user-config-invalid",
			data: { scope: "user" },
		});
		expect(context.update.updateAcquisition.operations()).toEqual([]);
		expect(context.update.userExtensionAvailability.calls()).toEqual([]);
		expect(context.update.declaredExtensions.calls()).toEqual([]);
		expect(config.fileContent()).toBe(content);
		expect(config.writes).toEqual([]);
	});

	it("rolls back only a newly installed npm package after descriptor or config failure", async () => {
		const npmSpec = "npm:@test/tools";
		const invalidConfig = new InMemoryUserExtensionConfigGateway();
		const invalidContext = contexts(invalidConfig, { descriptors: [] });
		const invalid = await installExtension(invalidContext.install, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});
		expect(invalid).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-user-descriptor-invalid",
		});
		expect(invalidContext.install.uninstallAcquisition.removals()).toEqual([
			{
				storage: userManagedNpmStorage("/home/test/.local/share/ns/extensions"),
				packageName: "@test/tools",
			},
		]);

		const moduleRoot =
			"/home/test/.local/share/ns/extensions/npm/@test/tools/node_modules/@test/tools";
		const npmDescriptor: DeclaredExtensionDescriptor = {
			...descriptor,
			spec: npmSpec,
			sourceKind: "npm",
			moduleRoot,
			descriptorPath: `${moduleRoot}/extension.ts`,
		};
		const racedConfig = new InMemoryUserExtensionConfigGateway({
			mutateBeforeWriteTo: "# raced\n",
		});
		const racedContext = contexts(racedConfig, { descriptors: [npmDescriptor] });
		const raced = await installExtension(racedContext.install, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});
		expect(raced).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-user-config-write-failed",
		});
		expect(racedContext.install.uninstallAcquisition.removals()).toHaveLength(1);

		const preExistingProjectContext = contexts(
			new InMemoryUserExtensionConfigGateway({ mutateBeforeWriteTo: "# raced\n" }),
			{
				descriptors: [npmDescriptor],
				existingProjectRoots: ["/home/test/.local/share/ns/extensions/npm/@test/tools"],
			},
		);
		const restoredThenFailed = await installExtension(preExistingProjectContext.install, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});
		expect(restoredThenFailed).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-user-config-write-failed",
		});
		expect(preExistingProjectContext.install.uninstallAcquisition.removals()).toEqual([]);
		expect(preExistingProjectContext.install.installAcquisition.installedRoots()).toContain(
			moduleRoot,
		);

		const existingContext = contexts(
			new InMemoryUserExtensionConfigGateway({ mutateBeforeWriteTo: "# raced\n" }),
			{
				descriptors: [npmDescriptor],
				installedPackageRoots: [moduleRoot],
			},
		);
		await installExtension(existingContext.install, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});
		expect(existingContext.install.uninstallAcquisition.removals()).toEqual([]);
	});

	it("reports the primary install failure, cleanup diagnostic, and retained path when rollback fails", async () => {
		const npmSpec = "npm:@test/tools";
		const retainedPath = "/home/test/.local/share/ns/extensions/npm/@test/tools";
		const context = contexts(new InMemoryUserExtensionConfigGateway(), {
			descriptors: [],
			cleanupFailureByPackageName: {
				"@test/tools": {
					code: "extension_acquisition_npm_remove_failed",
					message: "busy",
					path: retainedPath,
				},
			},
		});

		const result = await installExtension(context.install, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});

		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-user-rollback-failed",
			data: {
				primaryFailure: {
					status: "failure",
					errorType: "ns-extension-install-user-descriptor-invalid",
				},
				cleanupDiagnostic: {
					code: "extension-acquisition-npm-remove-failed",
					message: "busy",
					path: retainedPath,
				},
				retainedPath,
			},
		});
		expect(context.install.uninstallAcquisition.removals()).toHaveLength(1);
	});

	it("includes user acquisition outcome in human and Markdown install renderers", () => {
		const result = {
			scope: "user" as const,
			sourceSpec: "npm:@test/tools",
			sourceKind: "npm" as const,
			packageName: "@test/tools",
			packageVersion: "1.0.0",
			moduleRoot: "/data/ns/extensions/npm/@test/tools/node_modules/@test/tools",
			configPath: "/config/ns/ns.toml",
			declarationAction: "appended" as const,
			acquisitionOutcome: "installed" as const,
			commandAvailability: "available" as const,
			configuredHarnesses: ["pi" as const],
			userExtensionLayer: { enabled: true, activeHarness: "pi" as const },
			artifacts: [],
			dormantContributions: { instructionModuleCount: 0, consumerDirCount: 0 },
			activation: "not-performed" as const,
		};

		expect(renderInstallExtensionHuman(result)).toContain("Acquisition: installed.");
		expect(renderInstallExtensionMarkdown(result)).toContain("acquisition: installed");
	});

	it("applies artifacts before declaration write and reports them on npm cleanup failure", async () => {
		const npmSpec = "npm:@test/tools";
		const config = new InMemoryUserExtensionConfigGateway({
			content: `extensions = [${JSON.stringify(npmSpec)}]\n`,
		});
		const completed = {
			key: "pi:tools",
			action: "removed" as const,
			artifactId: "@test/tools:tools",
			skillName: "tools",
			harness: "pi" as const,
			targetArtifactPath: "/home/test/.pi/agent/skills/tools",
			manifestPath: "/home/test/.pi/agent/skills/.ns-harness-artifacts-manifest.json",
			writtenFiles: [],
			conflictingFiles: [],
			removedFiles: ["/home/test/.pi/agent/skills/tools/SKILL.md"],
			removalReason: "removed-source" as const,
		};
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			applyResult: { ok: true, completed: [completed] },
		});
		const context = contexts(config, {
			installedPackageNames: ["@test/tools"],
			userArtifacts,
			cleanupFailureByPackageName: {
				"@test/tools": {
					code: "extension_acquisition_npm_remove_failed",
					message: "busy",
					path: "/home/test/.local/share/ns/extensions/npm/@test/tools",
				},
			},
		});
		const events: string[] = [];
		const partial = await uninstallExtension(
			{
				...context.uninstall,
				userArtifacts: {
					prepare: (params) => userArtifacts.prepare(params),
					apply: async (prepared) => {
						events.push("apply-artifacts");
						return userArtifacts.apply(prepared);
					},
				},
				userExtensionConfig: {
					read: () => config.read(),
					compareAndWrite: async (options) => {
						events.push("write-config");
						return config.compareAndWrite(options);
					},
				},
				uninstallAcquisition: {
					removeManagedNpmPackage: async (params) => {
						events.push("cleanup-npm");
						return context.uninstall.uninstallAcquisition.removeManagedNpmPackage(params);
					},
				},
			},
			{ cwd: "/outside", source: npmSpec, scope: "user" },
		);
		expect(partial).toMatchObject({
			status: "failure",
			errorType: "ns-extension-uninstall-user-managed-package-cleanup-failed",
			data: {
				declarationAction: "removed",
				declarationCompleted: true,
				retainedPath: expect.any(String),
				completedArtifacts: [completed],
			},
		});
		expect(events).toEqual(["apply-artifacts", "write-config", "cleanup-npm"]);
		expect(config.fileContent()).toBe("extensions = []\n");

		const retryContext = contexts(config);
		const retry = await uninstallExtension(retryContext.uninstall, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
		});
		expect(retry).toMatchObject({
			status: "success",
			data: { declarationAction: "already-absent", cleanup: { status: "already-absent" } },
		});
		expect(retryContext.uninstall.uninstallAcquisition.removals()).toHaveLength(1);
	});

	it("validates install config and descriptor before writing or touching project paths", async () => {
		const malformedConfig = new InMemoryUserExtensionConfigGateway({
			content: "extensions = [\n",
		});
		const malformedContext = contexts(malformedConfig);
		const malformed = await installExtension(malformedContext.install, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(malformed).toMatchObject({ status: "failure", data: { scope: "user" } });
		expect(malformedConfig.writes).toEqual([]);
		expect(malformedContext.install.declaredExtensions.calls()).toEqual([]);
		expect(malformedContext.install.files.operations()).toEqual([]);
		expect(malformedContext.install.artifacts.prepareCalls()).toEqual([]);
		expect(malformedContext.install.artifacts.applyCalls()).toEqual([]);
		expect(malformedContext.install.installAcquisition.calls()).toEqual([]);

		const wrongDescriptor = { ...descriptor, spec: "/work/extensions/other" };
		const descriptorConfig = new InMemoryUserExtensionConfigGateway();
		const descriptorContext = contexts(descriptorConfig, { descriptors: [wrongDescriptor] });
		const invalidDescriptor = await installExtension(descriptorContext.install, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(invalidDescriptor).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-user-descriptor-invalid",
		});
		expect(descriptorConfig.fileContent()).toBeUndefined();
		expect(descriptorConfig.writes).toEqual([]);
		expect(descriptorContext.install.files.operations()).toEqual([]);
		expect(descriptorContext.install.artifacts.prepareCalls()).toEqual([]);
		expect(descriptorContext.install.artifacts.applyCalls()).toEqual([]);
		expect(descriptorContext.install.installAcquisition.calls()).toEqual([]);
	});

	it("rejects a whole colliding install, including an already-declared package, without writing", async () => {
		for (const content of [undefined, `extensions = [${JSON.stringify(sourceSpec)}]\n`]) {
			const config = new InMemoryUserExtensionConfigGateway(
				content === undefined ? {} : { content },
			);
			const context = contexts(config, {
				availabilityFacts: [
					{
						sourceSpec,
						availability: "unavailable",
						packageName: "@test/tools",
						diagnostics: [
							{
								severity: "error",
								code: "extension_package_builtin_conflict",
								message: "tools/install collides; tools/inspect would not collide",
								contributionId: "user:tools",
								packageName: "@test/tools",
								sourceLevel: "user",
								commandName: "extension",
							},
						],
					},
				],
			});
			const result = await installExtension(context.install, {
				cwd: "/work",
				source: "./extensions/tools",
				scope: "user",
			});
			expect(result).toMatchObject({
				status: "failure",
				errorType: "ns-extension-install-user-package-unavailable",
			});
			expect(config.writes).toEqual([]);
			expect(config.fileContent()).toBe(content);
		}
	});

	it("is idempotent and does not write an already-declared install", async () => {
		const content = `extensions = [${JSON.stringify(sourceSpec)}]\n`;
		const config = new InMemoryUserExtensionConfigGateway({ content });
		const result = await installExtension(contexts(config).install, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(result).toMatchObject({
			status: "success",
			data: { declarationAction: "unchanged", activation: "not-performed" },
		});
		expect(config.writes).toEqual([]);
		expect(config.fileContent()).toBe(content);
	});

	it("handles update not-declared, moved descriptor, and dry-run without writes", async () => {
		const notDeclaredConfig = new InMemoryUserExtensionConfigGateway({
			content: "extensions = []\n",
		});
		const notDeclaredContext = contexts(notDeclaredConfig);
		const notDeclared = await updateExtension(notDeclaredContext.update, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
			dryRun: false,
		});
		expect(notDeclared).toMatchObject({
			status: "failure",
			errorType: "ns-extension-update-user-not-declared",
			data: { scope: "user" },
		});
		expect(notDeclaredContext.update.declaredExtensions.calls()).toEqual([]);
		expect(notDeclaredConfig.writes).toEqual([]);

		const declaredContent = `extensions = [${JSON.stringify(sourceSpec)}]\n`;
		const movedConfig = new InMemoryUserExtensionConfigGateway({ content: declaredContent });
		const movedContext = contexts(movedConfig, {
			descriptors: [],
			diagnostics: [
				{
					severity: "error",
					code: "extension-descriptor-package-missing",
					message: `Missing ${sourceSpec}`,
					spec: sourceSpec,
				},
			],
		});
		const moved = await updateExtension(movedContext.update, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
			dryRun: false,
		});
		expect(moved).toMatchObject({
			status: "failure",
			errorType: "ns-extension-update-user-package-unavailable",
			data: { scope: "user" },
		});
		expect(movedConfig.fileContent()).toBe(declaredContent);
		expect(movedConfig.writes).toEqual([]);

		const dryRunConfig = new InMemoryUserExtensionConfigGateway({ content: declaredContent });
		const dryRunContext = contexts(dryRunConfig);
		const dryRun = await updateExtension(dryRunContext.update, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
			dryRun: true,
		});
		expect(dryRun).toMatchObject({
			status: "success",
			data: { scope: "user", mode: "dry-run", configWrite: "not-performed" },
		});
		expect(dryRunConfig.writes).toEqual([]);
		expect(dryRunContext.update.files.operations()).toEqual([]);
		expect(dryRunContext.update.artifacts.prepareCalls()).toEqual([]);
		expect(dryRunContext.update.artifacts.applyCalls()).toEqual([]);
		expect(dryRunContext.update.updateAcquisition.operations()).toEqual([]);
	});

	it("lists rejected User packages as unavailable and rejects update without writes", async () => {
		const content = `extensions = [${JSON.stringify(sourceSpec)}]\n`;
		const config = new InMemoryUserExtensionConfigGateway({ content });
		const context = contexts(config, {
			availabilityFacts: [
				{
					sourceSpec,
					availability: "unavailable",
					packageName: "@test/tools",
					diagnostics: [
						{
							severity: "error",
							code: "extension_package_same_level_conflict",
							message: "Conflicts with another User package.",
							contributionId: "user:tools",
							packageName: "@test/tools",
							sourceLevel: "user",
						},
					],
				},
			],
		});
		await expect(
			listExtensions(context.list, { cwd: "/outside", scope: "user" }),
		).resolves.toMatchObject({
			status: "success",
			data: {
				extensions: [
					{
						sourceSpec,
						packageName: "@test/tools",
						commandAvailability: "unavailable",
						diagnostics: [{ code: "extension-package-same-level-conflict" }],
					},
				],
			},
		});
		await expect(
			updateExtension(context.update, {
				cwd: "/work",
				source: "./extensions/tools",
				scope: "user",
				dryRun: false,
			}),
		).resolves.toMatchObject({
			status: "failure",
			errorType: "ns-extension-update-user-package-unavailable",
		});
		expect(config.writes).toEqual([]);
	});

	it("blocks install before config or artifact apply when strict artifact preflight finds a collision", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: 'supported_harnesses = ["pi"]\nextensions = []\n',
		});
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			prepareResult: {
				ok: true,
				prepared: preparedUserArtifacts({
					skippedCollisions: [
						{ kind: "target-name", value: "tools", packages: ["@test/tools", "@test/other"] },
					],
				}),
			},
		});
		const context = contexts(config, { userArtifacts });

		const result = await installExtension(context.install, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});

		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-user-artifact-preflight-failed",
			data: { declarationCompleted: false, diagnostics: [{ code: "user-artifact-collision" }] },
		});
		expect(config.writes).toEqual([]);
		expect(userArtifacts.prepareCalls()).toHaveLength(1);
		expect(userArtifacts.applyCalls()).toEqual([]);
	});

	it("reports the shared gate and planned local artifact outcomes without applying a dry-run", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: `supported_harnesses = ["pi"]\nextensions = [${JSON.stringify(sourceSpec)}]\n`,
		});
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			prepareResult: { ok: true, prepared: preparedUserArtifacts({}) },
		});
		const context = contexts(config, { userArtifacts, env: { NS_HARNESS: "codex" } });

		const result = await updateExtension(context.update, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
			dryRun: true,
		});

		expect(result).toMatchObject({
			status: "success",
			data: {
				mode: "dry-run",
				commandAvailability: "unavailable",
				userExtensionLayer: { enabled: false, reason: "active-harness-unsupported" },
				artifactEffects: "available",
				artifacts: [],
			},
		});
		expect(config.writes).toEqual([]);
		expect(userArtifacts.prepareCalls()).toHaveLength(1);
		expect(userArtifacts.applyCalls()).toEqual([]);
	});

	it("reports completed artifact transitions and retry guidance after partial update apply", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: `supported_harnesses = ["pi"]\nextensions = [${JSON.stringify(sourceSpec)}]\n`,
		});
		const completed = {
			key: "pi:tools",
			action: "installed" as const,
			artifactId: "@test/tools:tools",
			skillName: "tools",
			harness: "pi" as const,
			targetArtifactPath: "/home/test/.pi/agent/skills/tools",
			manifestPath: "/home/test/.pi/agent/skills/.ns-harness-artifacts-manifest.json",
			writtenFiles: ["/home/test/.pi/agent/skills/tools/SKILL.md"],
			conflictingFiles: [],
		};
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			prepareResult: { ok: true, prepared: preparedUserArtifacts({}) },
			applyResult: {
				ok: false,
				error: {
					code: "stale_prepared_reconciliation",
					message: "second root changed",
					details: {
						kind: "target",
						path: "/home/test/.agents/skills/tools",
						installKey: "codex:tools",
					},
					completedTransitions: new Map(),
				},
				completed: [completed],
			},
		});
		const context = contexts(config, { userArtifacts });

		const result = await updateExtension(context.update, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
			dryRun: false,
		});

		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-update-user-artifact-apply-failed",
			data: {
				completedArtifacts: [completed],
				retryGuidance: expect.stringContaining("extension update --scope user"),
			},
		});
		expect(config.writes).toEqual([]);
		expect(userArtifacts.applyCalls()).toHaveLength(1);
	});

	it("stages, promotes, applies candidate artifacts, and commits a User npm update", async () => {
		const npmSpec = "npm:@test/tools";
		const candidateModuleRoot = "/candidate/@test/tools";
		const npmDescriptor: DeclaredExtensionDescriptor = {
			...descriptor,
			spec: npmSpec,
			sourceKind: "npm",
			moduleRoot: candidateModuleRoot,
			descriptorPath: `${candidateModuleRoot}/extension.ts`,
			version: "2.0.0",
		};
		const config = new InMemoryUserExtensionConfigGateway({
			content: `supported_harnesses = ["pi"]\nextensions = [${JSON.stringify(npmSpec)}]\n`,
		});
		const context = contexts(config, {
			descriptors: [npmDescriptor],
			installedPackageRoots: ["/canonical/@test/tools"],
			userNpmUpdate: { candidateModuleRootBySpec: { [npmSpec]: candidateModuleRoot } },
		});

		const result = await updateExtension(context.update, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
			dryRun: false,
		});

		expect(result).toMatchObject({
			status: "success",
			data: { packageVersion: "2.0.0", moduleRoot: candidateModuleRoot },
		});
		expect(context.update.userNpmUpdateAcquisition.operations()).toEqual([
			{ operation: "prepare", sourceSpec: npmSpec },
			{ operation: "promote", sourceSpec: npmSpec },
			{ operation: "commit", sourceSpec: npmSpec },
		]);
		expect(context.update.userArtifacts.prepareCalls()[0]?.descriptors).toEqual([npmDescriptor]);
		expect(context.update.userArtifacts.applyCalls()).toHaveLength(1);
	});

	it.each([
		["rollback", "ns-extension-update-user-artifact-apply-failed", "failed"],
		["commit", "ns-extension-update-user-commit-cleanup-failed", undefined],
	] as const)(
		"reports staged User npm %s failure and retained operation paths",
		async (failedOperation, errorType, packageRollback) => {
			const npmSpec = "npm:@test/tools";
			const candidateModuleRoot = "/candidate/@test/tools";
			const npmDescriptor: DeclaredExtensionDescriptor = {
				...descriptor,
				spec: npmSpec,
				sourceKind: "npm",
				moduleRoot: candidateModuleRoot,
				descriptorPath: `${candidateModuleRoot}/extension.ts`,
			};
			const userArtifacts = new InMemoryUserArtifactActivationGateway({
				applyResult:
					failedOperation === "rollback"
						? {
								ok: false,
								error: {
									code: "filesystem_error",
									message: "artifact apply failed",
									details: { path: "/artifact", operation: "write" },
									completedTransitions: new Map(),
								},
								completed: [],
							}
						: { ok: true, completed: [] },
			});
			const context = contexts(
				new InMemoryUserExtensionConfigGateway({
					content: `extensions = [${JSON.stringify(npmSpec)}]\n`,
				}),
				{
					descriptors: [npmDescriptor],
					userArtifacts,
					userNpmUpdate: {
						candidateModuleRootBySpec: { [npmSpec]: candidateModuleRoot },
						failureByOperation: {
							[failedOperation]: {
								code: "extension_acquisition_npm_project_failed",
								message: `${failedOperation} failed`,
							},
						},
					},
				},
			);

			const result = await updateExtension(context.update, {
				cwd: "/outside",
				source: npmSpec,
				scope: "user",
				dryRun: false,
			});

			expect(result).toMatchObject({
				status: "failure",
				errorType,
				data: {
					retainedPaths: expect.any(Array),
					...(packageRollback === undefined ? {} : { packageRollback }),
				},
			});
		},
	);

	it("reports candidate discard failure with the primary descriptor failure", async () => {
		const npmSpec = "npm:@test/tools";
		const context = contexts(
			new InMemoryUserExtensionConfigGateway({
				content: `extensions = [${JSON.stringify(npmSpec)}]\n`,
			}),
			{
				descriptors: [],
				diagnostics: [
					{
						severity: "error",
						code: "extension-descriptor-package-missing",
						message: "candidate descriptor missing",
						spec: npmSpec,
					},
				],
				userNpmUpdate: {
					failureByOperation: {
						discard: {
							code: "extension_acquisition_npm_project_failed",
							message: "discard failed",
						},
					},
				},
			},
		);

		const result = await updateExtension(context.update, {
			cwd: "/outside",
			source: npmSpec,
			scope: "user",
			dryRun: false,
		});

		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-update-user-candidate-cleanup-failed",
			data: {
				primaryFailure: { errorType: "ns-extension-update-user-descriptor-invalid" },
				cleanupDiagnostics: [{ message: "discard failed" }],
				retainedPaths: [expect.stringContaining(".updates")],
			},
		});
	});

	it("blocks identifiable uninstall before declaration mutation or apply", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: `supported_harnesses = ["pi"]\nextensions = [${JSON.stringify(sourceSpec)}]\n`,
		});
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			prepareResult: {
				ok: true,
				prepared: preparedUserArtifacts({
					skippedCollisions: [
						{ kind: "id", value: "@test/tools:tools", packages: ["@test/tools"] },
					],
				}),
			},
		});
		const context = contexts(config, { userArtifacts });

		const result = await uninstallExtension(context.uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});

		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-uninstall-user-artifact-preflight-failed",
			data: { declarationCompleted: false },
		});
		expect(config.writes).toEqual([]);
		expect(userArtifacts.applyCalls()).toEqual([]);
	});

	it("uninstalls a missing local source and keeps an absent declaration idempotent", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: `extensions = [${JSON.stringify(sourceSpec)}]\n`,
		});
		const context = contexts(config, { descriptors: [] });
		const removed = await uninstallExtension(context.uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(removed).toMatchObject({
			status: "success",
			data: {
				declarationAction: "removed",
				cleanup: { status: "not-applicable" },
				artifactReconciliation: "artifacts-retained-package-identity-unavailable",
			},
		});
		const absentConfig = new InMemoryUserExtensionConfigGateway();
		const absent = await uninstallExtension(contexts(absentConfig).uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(absent).toMatchObject({
			status: "success",
			data: {
				declarationAction: "already-absent",
				artifactReconciliation: "not-authorized-declaration-absent",
			},
		});
		expect(absentConfig.writes).toEqual([]);
		expect(absentConfig.fileContent()).toBeUndefined();
	});

	it("reports unavailable list evidence when read-only artifact inspection fails", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: `supported_harnesses = ["pi"]\nextensions = [${JSON.stringify(sourceSpec)}]\n`,
		});
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			prepareResult: {
				ok: false,
				error: {
					code: "missing_home_directory",
					message: "home unavailable",
					details: { harness: "pi", scope: "user" },
				},
			},
		});
		const context = contexts(config, { userArtifacts });

		const result = await listExtensions(context.list, { cwd: "/outside", scope: "user" });

		expect(result).toMatchObject({
			status: "success",
			data: {
				extensions: [
					{
						sourceSpec,
						artifactStatus: "unavailable",
						artifactCount: 0,
						diagnostics: [{ code: "missing-home-directory", message: "home unavailable" }],
					},
				],
			},
		});
		expect(userArtifacts.applyCalls()).toEqual([]);
		expect(config.writes).toEqual([]);
	});

	it("reports orphan drift for an empty declaration list without applying or writing", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: 'supported_harnesses = ["pi"]\nextensions = []\n',
		});
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			prepareResult: {
				ok: true,
				prepared: preparedUserArtifacts({
					orphans: [
						{
							artifactId: "@test/orphan:tools",
							harness: "pi",
							scope: "user",
							targetRoot: "/home/test/.pi/agent/skills",
							packageName: "@test/orphan",
							sourceType: "npm-module",
						},
					],
				}),
			},
		});
		const context = contexts(config, { userArtifacts });

		const result = await listExtensions(context.list, { cwd: "/outside", scope: "user" });

		expect(result).toMatchObject({
			status: "success",
			data: {
				extensions: [],
				orphanedArtifactCount: 1,
				harnessSetDriftNote: expect.stringContaining("does not reconcile"),
			},
		});
		expect(userArtifacts.prepareCalls()).toEqual([
			{
				cwd: "/outside",
				descriptors: [],
				configuredHarnesses: ["pi"],
				targetPackageNames: [],
			},
		]);
		expect(userArtifacts.applyCalls()).toEqual([]);
		expect(config.writes).toEqual([]);
	});

	it("returns an empty, deterministic result for a missing user list config", async () => {
		const config = new InMemoryUserExtensionConfigGateway();
		const context = contexts(config);
		const first = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		const second = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		expect(first).toEqual(second);
		expect(first).toMatchObject({
			status: "success",
			data: { scope: "user", extensions: [] },
		});
		expect(config.fileContent()).toBeUndefined();
		expect(config.writes).toEqual([]);
		expect(context.list.declaredExtensions.calls()).toEqual([
			{ repoRoot: "/home/test/.config/ns", specs: [] },
			{ repoRoot: "/home/test/.config/ns", specs: [] },
		]);
		expect(context.list.files.operations()).toEqual([]);
		expect(context.list.artifacts.prepareCalls()).toEqual([]);
		expect(context.list.artifacts.applyCalls()).toEqual([]);
	});

	it("reports malformed user list config as a scope-specific user failure", async () => {
		const content = "extensions = [\n";
		const config = new InMemoryUserExtensionConfigGateway({ content });
		const context = contexts(config);
		const result = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-list-user-config-invalid",
			data: { scope: "user", diagnostics: [expect.objectContaining({ path: expect.any(String) })] },
		});
		expect(config.fileContent()).toBe(content);
		expect(config.writes).toEqual([]);
		expect(context.list.declaredExtensions.calls()).toEqual([]);
		expect(context.list.files.operations()).toEqual([]);
	});

	it("reports mixed valid, missing, relative, and npm list rows without writes", async () => {
		const missing = "/work/extensions/missing";
		const content = `extensions = [${JSON.stringify(sourceSpec)}, ${JSON.stringify(missing)}, "./relative", "npm:@test/npm"]\n[ignored]\nvalue = 1\n`;
		const config = new InMemoryUserExtensionConfigGateway({ content });
		const context = contexts(config, {
			diagnostics: [
				{
					severity: "error",
					code: "extension-descriptor-package-missing",
					message: `Missing ${missing}`,
					spec: missing,
				},
				{
					severity: "error",
					code: "extension-local-path-must-be-absolute",
					message: "Relative user path is invalid.",
					spec: "./relative",
				},
			],
		});
		const result = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		expect(result).toMatchObject({
			status: "success",
			data: {
				extensions: [
					{ sourceSpec, commandAvailability: "unavailable" },
					{
						sourceSpec: missing,
						acquisitionStatus: "missing",
						commandAvailability: "unavailable",
					},
					{ sourceSpec: "./relative", commandAvailability: "unavailable" },
					{
						sourceSpec: "npm:@test/npm",
						sourceKind: "npm",
						diagnostics: [{ code: "extension-descriptor-status-unavailable" }],
					},
				],
			},
		});
		expect(config.writes).toEqual([]);
		expect(config.fileContent()).toBe(content);
	});

	it("retains authority after partial artifact failure and succeeds on a second uninstall", async () => {
		const content = `extensions = [${JSON.stringify(sourceSpec)}]\n`;
		const config = new InMemoryUserExtensionConfigGateway({ content });
		const completed = {
			key: "pi:tools",
			action: "removed" as const,
			artifactId: "@test/tools:tools",
			skillName: "tools",
			harness: "pi" as const,
			targetArtifactPath: "/home/test/.pi/agent/skills/tools",
			manifestPath: "/home/test/.pi/agent/skills/.ns-harness-artifacts-manifest.json",
			writtenFiles: [],
			conflictingFiles: [],
			removedFiles: ["/home/test/.pi/agent/skills/tools/SKILL.md"],
			removalReason: "removed-source" as const,
		};
		const userArtifacts = new InMemoryUserArtifactActivationGateway({
			applyResult: {
				ok: false,
				error: {
					code: "filesystem_error",
					message: "artifact root is busy",
					details: { path: "/home/test/.pi/skills/tools", operation: "delete" },
					completedTransitions: new Map(),
				},
				completed: [completed],
			},
		});
		const context = contexts(config, { userArtifacts });

		const result = await uninstallExtension(context.uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});

		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-uninstall-user-artifact-removal-failed",
			data: { declarationCompleted: false, completedArtifacts: [completed] },
		});
		expect(config.fileContent()).toBe(content);
		expect(config.writes).toEqual([]);
		expect(userArtifacts.applyCalls()).toHaveLength(1);
		expect(context.uninstall.uninstallAcquisition.removals()).toEqual([]);

		const retryContext = contexts(config);
		const retry = await uninstallExtension(retryContext.uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(retry).toMatchObject({
			status: "success",
			data: { declarationAction: "removed", artifactReconciliation: "performed" },
		});
		expect(retryContext.uninstall.declaredExtensions.calls()).toHaveLength(1);
		expect(retryContext.uninstall.userArtifacts.applyCalls()).toHaveLength(1);
		expect(config.fileContent()).toBe("extensions = []\n");
	});

	it("refuses install and uninstall compare-and-write races", async () => {
		const installConfig = new InMemoryUserExtensionConfigGateway({
			mutateBeforeWriteTo: "# concurrent install\n",
		});
		const install = await installExtension(contexts(installConfig).install, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(install).toMatchObject({
			status: "failure",
			errorType: "ns-extension-install-user-config-write-failed",
			data: { error: { code: "user-config-prepared-state-mismatch" } },
		});
		expect(installConfig.fileContent()).toBe("# concurrent install\n");

		const uninstallConfig = new InMemoryUserExtensionConfigGateway({
			content: `extensions = [${JSON.stringify(sourceSpec)}]\n`,
			mutateBeforeWriteTo: "# concurrent uninstall\n",
		});
		const uninstallContext = contexts(uninstallConfig);
		const uninstall = await uninstallExtension(uninstallContext.uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(uninstall).toMatchObject({
			status: "failure",
			errorType: "ns-extension-uninstall-user-config-write-failed",
			data: {
				scope: "user",
				declarationCompleted: false,
				completedArtifacts: [],
				error: { code: "user-config-prepared-state-mismatch" },
			},
		});
		expect(uninstallContext.uninstall.userArtifacts.applyCalls()).toHaveLength(1);
		expect(uninstallConfig.fileContent()).toBe("# concurrent uninstall\n");
		expect(uninstallContext.uninstall.files.operations()).toEqual([]);
		expect(uninstallContext.uninstall.artifacts.prepareCalls()).toEqual([]);
		expect(uninstallContext.uninstall.artifacts.applyCalls()).toEqual([]);
		expect(uninstallContext.uninstall.uninstallAcquisition.removals()).toEqual([]);
	});
});

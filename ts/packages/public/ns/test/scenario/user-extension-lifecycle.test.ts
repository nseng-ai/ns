import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";

import type { ExtensionInstallContext } from "../../src/init/install-extension.ts";
import { installExtension } from "../../src/init/install-extension.ts";
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
	InMemoryUserExtensionConfigGateway,
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
	} = {},
) {
	const declaredExtensions = new InMemoryDeclaredExtensionsGateway({
		result: {
			descriptors: options.descriptors ?? [descriptor],
			diagnostics: options.diagnostics ?? [],
		},
	});
	const shared = {
		git: new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } }),
		files: new InMemoryActivationFilesGateway(),
		declaredExtensions,
		userExtensionConfig,
		artifacts: new InMemoryArtifactActivationGateway(),
	};
	return {
		install: {
			...shared,
			installAcquisition: new InMemoryExtensionInstallAcquisitionGateway(),
		} satisfies ExtensionInstallContext,
		list: {
			...shared,
			artifactProvisioningStatus: new InMemoryArtifactProvisioningStatusGateway(),
			installedExtensionPackages: { list: () => [] },
		} satisfies ExtensionListContext,
		update: {
			...shared,
			updateAcquisition: new InMemoryExtensionUpdateAcquisitionGateway(),
		} satisfies ExtensionUpdateContext,
		uninstall: {
			...shared,
			uninstallAcquisition: new InMemoryExtensionUninstallAcquisitionGateway(),
		} satisfies ExtensionUninstallContext,
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
			type: "ok",
			data: {
				scope: "user",
				sourceSpec,
				declarationAction: "appended",
				commandAvailability: "available",
			},
		});
		expect(config.fileContent()).toBe(
			`# keep\r\nextensions = [${JSON.stringify(sourceSpec)}]\r\n[other]\r\nvalue = 1\r\n`,
		);

		const listed = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		expect(listed).toMatchObject({
			type: "ok",
			data: { scope: "user", extensions: [{ sourceSpec, commandAvailability: "available" }] },
		});

		const updated = await updateExtension(context.update, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
			dryRun: false,
		});
		expect(updated).toMatchObject({
			type: "ok",
			data: {
				scope: "user",
				updateOutcome: "unchanged-local-in-place",
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
			type: "ok",
			data: { scope: "user", declarationAction: "removed", localSourcePreserved: true },
		});
		expect(config.fileContent()).toBe("# keep\r\nextensions = []\r\n[other]\r\nvalue = 1\r\n");
	});

	it("rejects npm mutations but lists hand-authored npm declarations as unavailable", async () => {
		const config = new InMemoryUserExtensionConfigGateway({
			content: 'extensions = ["npm:@test/tools"]\n',
		});
		const context = contexts(config);
		for (const result of [
			await installExtension(context.install, {
				cwd: "/work",
				source: "npm:@test/tools",
				scope: "user",
			}),
			await updateExtension(context.update, {
				cwd: "/work",
				source: "npm:@test/tools",
				scope: "user",
				dryRun: false,
			}),
			await uninstallExtension(context.uninstall, {
				cwd: "/work",
				source: "npm:@test/tools",
				scope: "user",
			}),
		])
			expect(result).toMatchObject({
				type: "failure",
				data: { code: "user-npm-managed-storage-unavailable" },
			});
		const listed = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		expect(listed).toMatchObject({
			type: "ok",
			data: {
				extensions: [
					{
						sourceKind: "npm",
						commandAvailability: "unavailable",
						diagnostics: [{ code: "user-npm-managed-storage-unavailable" }],
					},
				],
			},
		});
		expect(config.writes).toEqual([]);
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
		expect(malformed).toMatchObject({ type: "failure", data: { scope: "user" } });
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
			type: "failure",
			errorType: "ns-extension-install-user-descriptor-invalid",
		});
		expect(descriptorConfig.fileContent()).toBeUndefined();
		expect(descriptorConfig.writes).toEqual([]);
		expect(descriptorContext.install.files.operations()).toEqual([]);
		expect(descriptorContext.install.artifacts.prepareCalls()).toEqual([]);
		expect(descriptorContext.install.artifacts.applyCalls()).toEqual([]);
		expect(descriptorContext.install.installAcquisition.calls()).toEqual([]);
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
			type: "ok",
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
			type: "failure",
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
			type: "failure",
			errorType: "ns-extension-update-user-descriptor-invalid",
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
			type: "ok",
			data: { scope: "user", mode: "dry-run", configWrite: "not-performed" },
		});
		expect(dryRunConfig.writes).toEqual([]);
		expect(dryRunContext.update.files.operations()).toEqual([]);
		expect(dryRunContext.update.artifacts.prepareCalls()).toEqual([]);
		expect(dryRunContext.update.artifacts.applyCalls()).toEqual([]);
		expect(dryRunContext.update.updateAcquisition.operations()).toEqual([]);
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
			type: "ok",
			data: {
				declarationAction: "removed",
				managedCleanup: "not-performed",
				localSourcePreserved: true,
			},
		});
		const absentConfig = new InMemoryUserExtensionConfigGateway();
		const absent = await uninstallExtension(contexts(absentConfig).uninstall, {
			cwd: "/work",
			source: "./extensions/tools",
			scope: "user",
		});
		expect(absent).toMatchObject({
			type: "ok",
			data: { declarationAction: "already-absent" },
		});
		expect(absentConfig.writes).toEqual([]);
		expect(absentConfig.fileContent()).toBeUndefined();
	});

	it("returns an empty, deterministic result for a missing user list config", async () => {
		const config = new InMemoryUserExtensionConfigGateway();
		const context = contexts(config);
		const first = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		const second = await listExtensions(context.list, { cwd: "/outside", scope: "user" });
		expect(first).toEqual(second);
		expect(first).toMatchObject({
			type: "ok",
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
			type: "failure",
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
			type: "ok",
			data: {
				extensions: [
					{ sourceSpec, commandAvailability: "available" },
					{
						sourceSpec: missing,
						acquisitionStatus: "missing",
						commandAvailability: "unavailable",
					},
					{ sourceSpec: "./relative", commandAvailability: "unavailable" },
					{
						sourceSpec: "npm:@test/npm",
						diagnostics: [{ code: "user-npm-managed-storage-unavailable" }],
					},
				],
			},
		});
		expect(config.writes).toEqual([]);
		expect(config.fileContent()).toBe(content);
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
			type: "failure",
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
			type: "failure",
			errorType: "ns-extension-uninstall-user-config-write-failed",
			data: { scope: "user", error: { code: "user-config-prepared-state-mismatch" } },
		});
		expect(uninstallConfig.fileContent()).toBe("# concurrent uninstall\n");
		expect(uninstallContext.uninstall.files.operations()).toEqual([]);
		expect(uninstallContext.uninstall.artifacts.prepareCalls()).toEqual([]);
		expect(uninstallContext.uninstall.artifacts.applyCalls()).toEqual([]);
		expect(uninstallContext.uninstall.uninstallAcquisition.removals()).toEqual([]);
	});
});

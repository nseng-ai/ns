import { describe, expect, it } from "vitest";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";
import type { ExtensionListContext } from "../../src/init/list-extensions.ts";
import { listExtensions, renderListExtensionsHuman } from "../../src/init/list-extensions.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryDeclaredExtensionsGateway,
	InMemoryUserExtensionAvailabilityGateway,
	InMemoryUserExtensionConfigGateway,
} from "../../src/init/testing/index.ts";

function descriptor(spec: string): DeclaredExtensionDescriptor {
	return {
		spec,
		sourceKind: "local",
		moduleRoot: `/repo/${spec}`,
		descriptorPath: `/repo/${spec}/extension.ts`,
		packageName: "@test/tools",
		version: "1.0.0",
		descriptor: { description: "tools" },
	};
}
function fixture(
	options: {
		nsToml?: string;
		git?: InMemoryGitGateway;
		descriptors?: readonly DeclaredExtensionDescriptor[];
		diagnostics?: readonly { severity: "error"; code: string; message: string; spec: string }[];
		installed?: readonly { packageName: string; packageVersion?: string; moduleRoot?: string }[];
	} = {},
) {
	const files = new InMemoryActivationFilesGateway({
		files: options.nsToml === undefined ? {} : { "ns.toml": options.nsToml },
	});
	const declaredExtensions = new InMemoryDeclaredExtensionsGateway({
		result: { descriptors: options.descriptors ?? [], diagnostics: options.diagnostics ?? [] },
	});
	const context: ExtensionListContext = {
		git: options.git ?? new InMemoryGitGateway({ optionalRepoRoot: "/repo" }),
		files,
		declaredExtensions,
		installedExtensionPackages: { list: () => options.installed ?? [] },
		userExtensionConfig: new InMemoryUserExtensionConfigGateway(),
		userExtensionAvailability: new InMemoryUserExtensionAvailabilityGateway(),
		userManagedNpmStorage: {
			type: "unavailable",
			diagnostic: {
				code: "user-managed-npm-storage-unavailable",
				message: "unavailable",
			},
		},
	};
	return { context, files, declaredExtensions };
}
describe("listExtensions", () => {
	it("fails outside git and on repository inspection errors", async () => {
		expect(
			await listExtensions(
				fixture({ git: new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } }) }).context,
				{ cwd: "/repo", scope: "project" },
			),
		).toMatchObject({ status: "failure", errorType: "ns-extension-list-not-a-git-repo" });
		expect(
			await listExtensions(
				fixture({
					git: new InMemoryGitGateway({
						optionalRepoRoot: { type: "failure", error: { code: "git-failed", message: "failed" } },
					}),
				}).context,
				{ cwd: "/repo", scope: "project" },
			),
		).toMatchObject({ status: "failure", errorType: "ns-extension-list-repository-failed" });
	});
	it("includes installed packages absent from ns.toml", async () => {
		const result = await listExtensions(
			fixture({ installed: [{ packageName: "@test/installed", packageVersion: "1.0.0" }] }).context,
			{ cwd: "/repo", scope: "project" },
		);
		expect(result).toMatchObject({
			status: "success",
			data: {
				extensions: [
					{ sourceSpec: "@test/installed", sourceKind: "package", acquisitionStatus: "installed" },
				],
			},
		});
	});
	it("shows each declared extension with descriptor facts", async () => {
		const source = "./extensions/tools";
		const result = await listExtensions(
			fixture({ nsToml: `extensions = ["${source}"]\n`, descriptors: [descriptor(source)] })
				.context,
			{ cwd: "/repo", scope: "project" },
		);
		expect(result).toMatchObject({
			status: "success",
			data: {
				extensions: [
					{
						sourceSpec: source,
						sourceKind: "local",
						packageName: "@test/tools",
						acquisitionStatus: "installed",
						diagnostics: [],
					},
				],
			},
		});
	});
	it.each([undefined, "# config\n", "extensions = []\n"])(
		"returns empty inventory without declarations",
		async (nsToml) => {
			const { context } = fixture(nsToml === undefined ? {} : { nsToml });
			const result = await listExtensions(context, { cwd: "/repo", scope: "project" });
			expect(result).toMatchObject({ status: "success", data: { extensions: [] } });
		},
	);
	it("fails rather than returning partial inventory for invalid config", async () => {
		const result = await listExtensions(fixture({ nsToml: "extensions = [42]\n" }).context, {
			cwd: "/repo",
			scope: "project",
		});
		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-extension-list-config-invalid",
			data: { diagnostics: [{ code: "invalid-extensions" }] },
		});
	});
	it("keeps missing and unsupported declarations as diagnostic rows", async () => {
		const specs = ["./missing", "https://example.test/ext.tgz"];
		const result = await listExtensions(
			fixture({
				nsToml: `extensions = ${JSON.stringify(specs)}\n`,
				diagnostics: [
					{
						severity: "error",
						code: "extension_descriptor_package_missing",
						message: "missing",
						spec: specs[0]!,
					},
				],
			}).context,
			{ cwd: "/repo", scope: "project" },
		);
		expect(result).toMatchObject({
			status: "success",
			data: {
				extensions: [
					{ sourceSpec: specs[0], acquisitionStatus: "missing" },
					{ sourceSpec: specs[1], sourceKind: "unsupported", acquisitionStatus: "invalid" },
				],
			},
		});
	});
	it("renders empty and populated human output", async () => {
		const empty = await listExtensions(fixture().context, { cwd: "/repo", scope: "project" });
		if (empty.status !== "success") throw new Error("expected success");
		expect(renderListExtensionsHuman(empty.data)).toContain("No extensions installed or declared");
		const source = "./tools";
		const full = await listExtensions(
			fixture({ nsToml: `extensions = ["${source}"]\n`, descriptors: [descriptor(source)] })
				.context,
			{ cwd: "/repo", scope: "project" },
		);
		if (full.status !== "success") throw new Error("expected success");
		expect(renderListExtensionsHuman(full.data)).toContain(source);
	});
});

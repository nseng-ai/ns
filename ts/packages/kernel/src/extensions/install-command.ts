import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { failure, ok, usageError } from "@nseng-ai/clinkr";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	appendDeclaredExtensionSpecToml,
	type NsTomlExtensionsAppendResult,
} from "../project-config/ns-toml-extensions-edit.ts";
import {
	directoryExists,
	fileExists,
	managedDescriptorPackageRoot,
	managedExtensionsNpmProjectRoot,
	resolveDescriptorExportPath,
} from "../project-config/descriptor-package.ts";
import { defineCommand, type ExecResult, type NsCommand } from "../sdk/index.ts";

const installRequestSchema = z.object({
	source: z.string().min(1),
});

const installResultSchema = z.object({
	sourceSpec: z.string(),
	packageName: z.string(),
	packageVersion: z.string(),
	managedRoot: z.string(),
	nsTomlPath: z.string(),
	isRecorded: z.boolean(),
});

const extensionPackageManifestSchema = z
	.object({
		name: z.string().min(1),
		version: z.string().min(1),
	})
	.passthrough();

type ExtensionPackageManifest = z.infer<typeof extensionPackageManifestSchema>;

const npmInstallArgs = [
	"install",
	"--no-save",
	"--package-lock=false",
	"--ignore-scripts",
	"--legacy-peer-deps",
] as const;

export const installCommand: NsCommand<
	typeof installRequestSchema,
	z.infer<typeof installResultSchema>
> = defineCommand({
	name: "install",
	summary: "Install a local ns extension package.",
	description:
		"Install a local ns extension package into managed storage and record the source spec in ns.toml.",
	schema: installRequestSchema,
	positionals: { source: { position: 0 } },
	resultSchema: installResultSchema,
	handler: async (ctx, request) => {
		const unsupported = unsupportedSourceSpec(request.source);
		if (unsupported !== undefined) {
			return usageError(
				`ns install currently supports local package directories only; ${unsupported} specs are planned but not supported in this slice.`,
				{
					sourceSpec: request.source,
					unsupportedType: unsupported,
					futureGrowthPath:
						"npm:, git:, and URL source specs can be added over this command contract later.",
				},
			);
		}
		const sourceDir = resolve(ctx.cwd, request.source);
		if (!directoryExists(sourceDir)) {
			return failure(
				"missing-source",
				`Extension source directory does not exist: ${request.source}.`,
				{
					sourceSpec: request.source,
					sourceDir,
				},
			);
		}
		const manifest = readExtensionPackageManifest(sourceDir);
		if (!manifest.ok) return manifest.exit;
		const exportValidation = validateDescriptorExportFile(sourceDir, manifest.manifest);
		if (!exportValidation.ok) return exportValidation.exit;
		const managedProjectRoot = managedExtensionsNpmProjectRoot(ctx.cwd);
		const managedPackageRoot = managedDescriptorPackageRoot(ctx.cwd, manifest.manifest.name);
		const managedProject = ensureManagedNpmProject(managedProjectRoot);
		if (!managedProject.ok) return managedProject.exit;
		const installResult = await ctx.exec("npm", [...npmInstallArgs, sourceDir], {
			cwd: managedProjectRoot,
		});
		if (
			installResult.type !== "exited" ||
			installResult.code !== 0 ||
			installResult.signal !== null
		) {
			return failure("npm-install-failed", "npm failed to install the extension package.", {
				sourceSpec: request.source,
				command: "npm",
				args: [...npmInstallArgs, sourceDir],
				cwd: managedProjectRoot,
				...execResultData(installResult),
			});
		}
		const record = recordInstalledExtensionSpec(ctx.cwd, request.source);
		if (!record.ok) return record.exit;
		return ok({
			sourceSpec: request.source,
			packageName: manifest.manifest.name,
			packageVersion: manifest.manifest.version,
			managedRoot: managedPackageRoot,
			nsTomlPath: record.nsTomlPath,
			isRecorded: record.isRecorded,
		});
	},
	renderHuman: renderInstallHuman,
});

function unsupportedSourceSpec(source: string): string | undefined {
	if (source.startsWith("npm:")) return "npm";
	if (source.startsWith("git:")) return "git";
	if (/^[a-z][a-z0-9+.-]*:/iu.test(source)) return "url";
	return undefined;
}

function readExtensionPackageManifest(
	sourceDir: string,
):
	| { ok: true; manifest: ExtensionPackageManifest }
	| { ok: false; exit: ReturnType<typeof failure> } {
	const packageJsonPath = join(sourceDir, "package.json");
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return {
			ok: false,
			exit: failure(
				"invalid-package-json",
				"Extension source must contain a readable package.json.",
				{
					packageJsonPath,
					message: formatErrorMessage(error),
				},
			),
		};
	}
	const manifest = extensionPackageManifestSchema.safeParse(parsed);
	if (!manifest.success) {
		return {
			ok: false,
			exit: failure(
				"invalid-package-json",
				"Extension package.json must contain string name and version fields.",
				{
					packageJsonPath,
					issues: manifest.error.issues.map((issue) => ({
						path: issue.path.join("."),
						message: issue.message,
					})),
				},
			),
		};
	}
	return { ok: true, manifest: manifest.data };
}

function validateDescriptorExportFile(
	sourceDir: string,
	manifest: ExtensionPackageManifest,
): { ok: true } | { ok: false; exit: ReturnType<typeof failure> } {
	const packageJsonPath = join(sourceDir, "package.json");
	const exportPath = resolveDescriptorExportPath(sourceDir, manifest);
	if (!exportPath.ok) {
		return {
			ok: false,
			exit: failure(
				"missing-descriptor-export",
				'Extension package must expose exports["./ns-extension"].',
				{
					packageJsonPath,
					reason: exportPath.reason,
					...(exportPath.target === undefined ? {} : { target: exportPath.target }),
				},
			),
		};
	}
	if (!fileExists(exportPath.path)) {
		return {
			ok: false,
			exit: failure(
				"missing-descriptor-export",
				"Extension descriptor export does not resolve to a file.",
				{
					packageJsonPath,
					target: exportPath.target,
					descriptorPath: exportPath.path,
				},
			),
		};
	}
	return { ok: true };
}

function ensureManagedNpmProject(
	managedProjectRoot: string,
): { ok: true } | { ok: false; exit: ReturnType<typeof failure> } {
	try {
		mkdirSync(managedProjectRoot, { recursive: true });
		const packageJsonPath = join(managedProjectRoot, "package.json");
		if (!existsSync(packageJsonPath)) {
			writeFileSync(
				packageJsonPath,
				`${JSON.stringify({ private: true, name: "ns-managed-extensions" }, null, "\t")}\n`,
			);
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			exit: failure(
				"managed-root-unavailable",
				"Could not prepare managed extensions npm project.",
				{
					managedProjectRoot,
					message: formatErrorMessage(error),
				},
			),
		};
	}
}

function recordInstalledExtensionSpec(
	repoRoot: string,
	sourceSpec: string,
):
	| { ok: true; nsTomlPath: string; isRecorded: boolean }
	| { ok: false; exit: ReturnType<typeof failure> } {
	const nsTomlPath = join(repoRoot, "ns.toml");
	let existing = "";
	try {
		if (existsSync(nsTomlPath)) existing = readFileSync(nsTomlPath, "utf8");
	} catch (error) {
		return {
			ok: false,
			exit: failure("ns-toml-read-failed", "Could not read ns.toml before recording extension.", {
				nsTomlPath,
				message: formatErrorMessage(error),
			}),
		};
	}
	const next = appendDeclaredExtensionSpecToml(existing, sourceSpec);
	if (!next.ok) return { ok: false, exit: nsTomlAppendFailure(nsTomlPath, next) };
	if (!next.isAdded) return { ok: true, nsTomlPath, isRecorded: false };
	try {
		mkdirSync(dirname(nsTomlPath), { recursive: true });
		writeFileSync(nsTomlPath, next.text);
		return { ok: true, nsTomlPath, isRecorded: true };
	} catch (error) {
		return {
			ok: false,
			exit: failure("ns-toml-write-failed", "Could not write ns.toml after installing extension.", {
				nsTomlPath,
				message: formatErrorMessage(error),
			}),
		};
	}
}

function nsTomlAppendFailure(
	nsTomlPath: string,
	result: Exclude<NsTomlExtensionsAppendResult, { ok: true }>,
): ReturnType<typeof failure> {
	return failure(
		result.reason === "unsupported-format" ? "ns-toml-update-failed" : "ns-toml-parse-failed",
		result.reason === "unsupported-format"
			? result.message
			: `Could not parse ns.toml extensions before recording extension: ${result.message}`,
		{ nsTomlPath, reason: result.reason },
	);
}

function execResultData(result: ExecResult): Record<string, unknown> {
	return {
		type: result.type,
		stdout: result.stdout,
		stderr: result.stderr,
		...(result.type === "spawn-failed"
			? { error: result.error }
			: { code: result.code, signal: result.signal }),
	};
}

function renderInstallHuman(result: z.infer<typeof installResultSchema>): string {
	const recorded = result.isRecorded ? "recorded" : "already recorded";
	return (
		[
			`Installed ${result.packageName}@${result.packageVersion}`,
			`source: ${result.sourceSpec}`,
			`managed root: ${result.managedRoot}`,
			`ns.toml: ${result.nsTomlPath} (${recorded})`,
		].join("\n") + "\n"
	);
}

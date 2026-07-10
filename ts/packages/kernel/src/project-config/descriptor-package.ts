import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { isPathInside } from "@nseng-ai/foundation/primitives";
import { parse } from "smol-toml";
import { z } from "zod";

import { nsExtensionExportTarget } from "../sdk/descriptor.ts";

import { parseExtensionSourceSpec } from "./extension-source-spec.ts";

export type DeclaredExtensionSpecsParseResult =
	| { readonly ok: true; readonly specs: readonly string[] }
	| {
			readonly ok: false;
			readonly reason: "invalid-toml" | "invalid-extensions";
			readonly message: string;
	  };

export interface DescriptorPackageErrorInfo {
	readonly code: string;
	readonly message: string;
}

export interface DeclaredExtensionSpecsErrorInfo extends DescriptorPackageErrorInfo {
	readonly path: "ns.toml" | "extensions";
}

export function parseDeclaredExtensionSpecsToml(source: string): DeclaredExtensionSpecsParseResult {
	let parsed: unknown;
	try {
		parsed = parse(source);
	} catch (error) {
		return {
			ok: false,
			reason: "invalid-toml",
			message: error instanceof Error ? error.message : String(error),
		};
	}
	const documentResult = z.record(z.string(), z.unknown()).safeParse(parsed);
	if (!documentResult.success) return { ok: true, specs: [] };
	const value = documentResult.data["extensions"];
	if (value === undefined) return { ok: true, specs: [] };
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		return {
			ok: false,
			reason: "invalid-extensions",
			message: "ns.toml extensions must be an array of package-directory strings.",
		};
	}
	return { ok: true, specs: value };
}

export function declaredExtensionSpecsErrorInfo(
	result: Exclude<DeclaredExtensionSpecsParseResult, { ok: true }>,
): DeclaredExtensionSpecsErrorInfo {
	if (result.reason === "invalid-toml") {
		return {
			code: "ns_toml_invalid",
			message: `ns.toml: Invalid TOML.\n${result.message}`,
			path: "ns.toml",
		};
	}
	return {
		code: "ns_toml_extensions_invalid",
		message: result.message,
		path: "extensions",
	};
}

export function descriptorExportTarget(manifest: unknown): string | undefined {
	const manifestResult = z.record(z.string(), z.unknown()).safeParse(manifest);
	return manifestResult.success
		? nsExtensionExportTarget(manifestResult.data["exports"])
		: undefined;
}

export type DescriptorExportPathResult =
	| { readonly ok: true; readonly path: string; readonly target: string }
	| {
			readonly ok: false;
			readonly reason: "missing" | "invalid" | "escapes";
			readonly target?: string;
	  };

export function resolveDescriptorExportPath(
	packageDir: string,
	manifest: unknown,
): DescriptorExportPathResult {
	const target = descriptorExportTarget(manifest);
	if (target === undefined) return { ok: false, reason: "missing" };
	if (target.startsWith("/") || target.includes("\\")) {
		return { ok: false, reason: "invalid", target };
	}
	const path = resolve(packageDir, target);
	if (!isPathInside(packageDir, path)) return { ok: false, reason: "escapes", target };
	return { ok: true, path, target };
}

export function descriptorExportPathErrorInfo(
	result: Exclude<DescriptorExportPathResult, { ok: true }>,
	packageJsonPath: string,
): DescriptorPackageErrorInfo {
	if (result.reason === "missing") {
		return {
			code: "extension_descriptor_export_missing",
			message: `Extension package must expose exports["./ns-extension"]: ${packageJsonPath}.`,
		};
	}
	if (result.reason === "invalid") {
		return {
			code: "extension_descriptor_export_invalid",
			message: `Extension descriptor export must be a relative POSIX path: ${result.target}.`,
		};
	}
	return {
		code: "extension_descriptor_export_escapes",
		message: `Extension descriptor export must stay inside the package: ${result.target}.`,
	};
}

export interface AcquiredDescriptorPackageRoot {
	readonly packageRoot: string;
}

export function resolveAcquiredDescriptorPackageRoot(options: {
	repoRoot: string;
	spec: string;
}): AcquiredDescriptorPackageRoot {
	const parsed = parseExtensionSourceSpec(options.repoRoot, options.spec);
	if (!parsed.ok || parsed.value.kind === "git") {
		return { packageRoot: resolve(options.repoRoot, options.spec) };
	}
	if (parsed.value.kind === "local") return { packageRoot: parsed.value.path };
	return {
		packageRoot: managedDescriptorPackageRoot(options.repoRoot, parsed.value.packageName),
	};
}

export function managedExtensionsNpmProjectRoot(repoRoot: string): string {
	return join(repoRoot, ".ns", "managed-extensions", "npm");
}

export function managedDescriptorPackageRoot(repoRoot: string, packageName: string): string {
	return join(managedExtensionsNpmProjectRoot(repoRoot), "node_modules", ...packageName.split("/"));
}

export function directoryExists(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}

export function fileExists(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
}

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { isPathInside } from "@nseng-ai/foundation/primitives";
import { parse } from "smol-toml";
import { z } from "zod";

export type DeclaredExtensionSpecsParseResult =
	| { readonly ok: true; readonly specs: readonly string[] }
	| {
			readonly ok: false;
			readonly reason: "invalid-toml" | "invalid-extensions";
			readonly message: string;
	  };

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

export function descriptorExportTarget(manifest: unknown): string | undefined {
	const manifestResult = z.record(z.string(), z.unknown()).safeParse(manifest);
	if (!manifestResult.success) return undefined;
	const exportsResult = z.record(z.string(), z.unknown()).safeParse(manifestResult.data["exports"]);
	if (!exportsResult.success) return undefined;
	const nsExtensionExport = exportsResult.data["./ns-extension"];
	if (typeof nsExtensionExport === "string") return nsExtensionExport;
	const nsExtensionExportResult = z.record(z.string(), z.unknown()).safeParse(nsExtensionExport);
	if (!nsExtensionExportResult.success) return undefined;
	const importTarget = nsExtensionExportResult.data["import"];
	if (typeof importTarget === "string") return importTarget;
	const defaultTarget = nsExtensionExportResult.data["default"];
	return typeof defaultTarget === "string" ? defaultTarget : undefined;
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

export interface AcquiredDescriptorPackageRoot {
	readonly declaredRoot: string;
	readonly packageRoot: string;
	readonly isManaged: boolean;
}

export function resolveAcquiredDescriptorPackageRoot(options: {
	repoRoot: string;
	spec: string;
}): AcquiredDescriptorPackageRoot {
	const declaredRoot = resolve(options.repoRoot, options.spec);
	const packageName = readPackageName(declaredRoot);
	if (packageName === undefined) {
		return { declaredRoot, packageRoot: declaredRoot, isManaged: false };
	}
	const managedRoot = managedDescriptorPackageRoot(options.repoRoot, packageName);
	if (!directoryExists(managedRoot)) {
		return { declaredRoot, packageRoot: declaredRoot, isManaged: false };
	}
	return { declaredRoot, packageRoot: managedRoot, isManaged: true };
}

export function managedExtensionsNpmProjectRoot(repoRoot: string): string {
	return join(repoRoot, ".ns", "managed-extensions", "npm");
}

export function managedDescriptorPackageRoot(repoRoot: string, packageName: string): string {
	return join(managedExtensionsNpmProjectRoot(repoRoot), "node_modules", ...packageName.split("/"));
}

function readPackageName(packageRoot: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
		const result = z.object({ name: z.string().min(1) }).safeParse(parsed);
		return result.success ? result.data.name : undefined;
	} catch {
		return undefined;
	}
}

function directoryExists(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}

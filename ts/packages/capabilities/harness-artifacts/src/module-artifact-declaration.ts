import { formatErrorMessage, formatZodIssue } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { SkillHarnessArtifactEntry } from "./artifact-catalog.ts";

export type ModuleArtifactDeclarationDiagnosticCode =
	| "module_artifact_package_json_invalid"
	| "module_artifact_package_name_invalid"
	| "module_artifact_declarations_not_array"
	| "module_artifact_declaration_invalid"
	| "module_artifact_kind_unsupported"
	| "module_artifact_name_invalid"
	| "module_artifact_path_invalid"
	| "module_artifact_duplicate_name";

export interface ModuleArtifactDeclarationDiagnostic {
	code: ModuleArtifactDeclarationDiagnosticCode;
	message: string;
	path?: string;
	artifactName?: string;
}

export type ParseModuleArtifactDeclarationResult =
	| {
			ok: true;
			packageName: string;
			version: string;
			artifacts: readonly SkillHarnessArtifactEntry[];
			diagnostics: readonly ModuleArtifactDeclarationDiagnostic[];
	  }
	| {
			ok: false;
			diagnostics: readonly ModuleArtifactDeclarationDiagnostic[];
	  };

interface RawSkillDeclaration {
	kind: "skill";
	name: unknown;
	path: unknown;
	description?: unknown;
}

const packageJsonSchema = z.looseObject({
	name: z.string(),
	version: z.string().optional(),
	ns: z.looseObject({ harnessArtifacts: z.unknown().optional() }).optional(),
});

const declarationObjectSchema = z.looseObject({
	kind: z.string(),
	name: z.unknown().optional(),
	path: z.unknown().optional(),
	description: z.unknown().optional(),
});

export function parseModuleArtifactDeclaration(
	packageJsonText: string,
): ParseModuleArtifactDeclarationResult {
	let data: unknown;
	try {
		data = JSON.parse(packageJsonText);
	} catch (error) {
		return {
			ok: false,
			diagnostics: [
				{
					code: "module_artifact_package_json_invalid",
					message: `Package manifest is not valid JSON: ${formatErrorMessage(error)}`,
				},
			],
		};
	}

	const packageJson = packageJsonSchema.safeParse(data);
	if (!packageJson.success || packageJson.data.name.trim() === "") {
		return {
			ok: false,
			diagnostics: [
				{
					code: "module_artifact_package_name_invalid",
					message: packageJson.success
						? "Package manifest name must be a non-empty string."
						: `Package manifest name must be a string: ${formatZodIssue(
								packageJson.error.issues[0],
								{
									rootPath: "$",
									pathPrefix: "$.",
									fallback: "invalid package manifest",
								},
							)}`,
				},
			],
		};
	}

	const declarations = packageJson.data.ns?.harnessArtifacts;
	if (declarations === undefined) {
		return {
			ok: true,
			packageName: packageJson.data.name,
			version: packageJson.data.version ?? "unversioned",
			artifacts: [],
			diagnostics: [],
		};
	}
	if (!Array.isArray(declarations)) {
		return {
			ok: true,
			packageName: packageJson.data.name,
			version: packageJson.data.version ?? "unversioned",
			artifacts: [],
			diagnostics: [
				{
					code: "module_artifact_declarations_not_array",
					message: "Package manifest ns.harnessArtifacts must be an array.",
				},
			],
		};
	}

	return parseDeclarations({
		packageName: packageJson.data.name,
		version: packageJson.data.version ?? "unversioned",
		declarations,
	});
}

function parseDeclarations(options: {
	packageName: string;
	version: string;
	declarations: readonly unknown[];
}): ParseModuleArtifactDeclarationResult {
	const diagnostics: ModuleArtifactDeclarationDiagnostic[] = [];
	const artifacts: SkillHarnessArtifactEntry[] = [];
	const acceptedNames = new Set<string>();
	const duplicateNames = duplicateDeclarationNames(options.declarations);
	for (const declaration of options.declarations) {
		const parsed = declarationObjectSchema.safeParse(declaration);
		if (!parsed.success) {
			diagnostics.push({
				code: "module_artifact_declaration_invalid",
				message: "Harness artifact declarations must be objects with a string kind.",
			});
			continue;
		}

		if (parsed.data.kind !== "skill") {
			diagnostics.push({
				code: "module_artifact_kind_unsupported",
				message: `Harness artifact kind ${JSON.stringify(parsed.data.kind)} is not supported for provisioning in this slice.`,
			});
			continue;
		}

		const skillDeclaration: RawSkillDeclaration = {
			kind: "skill",
			name: parsed.data.name,
			path: parsed.data.path,
			...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
		};
		const artifact = parseSkillDeclaration({
			packageName: options.packageName,
			declaration: skillDeclaration,
			duplicateNames,
			acceptedNames,
		});
		if (artifact.ok) {
			artifacts.push(artifact.artifact);
		} else {
			diagnostics.push(...artifact.diagnostics);
		}
	}

	return {
		ok: true,
		packageName: options.packageName,
		version: options.version,
		artifacts: [...artifacts].sort((left, right) => left.id.localeCompare(right.id)),
		diagnostics: sortDeclarationDiagnostics(diagnostics),
	};
}

function parseSkillDeclaration(options: {
	packageName: string;
	declaration: RawSkillDeclaration;
	duplicateNames: ReadonlySet<string>;
	acceptedNames: Set<string>;
}):
	| { ok: true; artifact: SkillHarnessArtifactEntry }
	| { ok: false; diagnostics: readonly ModuleArtifactDeclarationDiagnostic[] } {
	const diagnostics: ModuleArtifactDeclarationDiagnostic[] = [];
	const name = readNonEmptyString(options.declaration.name);
	if (name === undefined) {
		diagnostics.push({
			code: "module_artifact_name_invalid",
			message: "Skill harness artifact declaration name must be a non-empty string.",
		});
	}
	const relativePath = readNonEmptyString(options.declaration.path);
	if (relativePath === undefined || !isValidModuleArtifactRelativePath(relativePath)) {
		diagnostics.push({
			code: "module_artifact_path_invalid",
			message:
				"Skill harness artifact declaration path must be a relative POSIX path inside the package.",
			...(relativePath === undefined ? {} : { path: relativePath }),
			...(name === undefined ? {} : { artifactName: name }),
		});
	}
	if (name !== undefined && options.duplicateNames.has(name)) {
		diagnostics.push({
			code: "module_artifact_duplicate_name",
			message: `Skill harness artifact declaration name ${JSON.stringify(name)} appears more than once in this package.`,
			artifactName: name,
		});
	}
	if (diagnostics.length > 0 || name === undefined || relativePath === undefined) {
		return { ok: false, diagnostics };
	}
	if (options.acceptedNames.has(name)) {
		return { ok: false, diagnostics: [] };
	}
	options.acceptedNames.add(name);
	const description = readNonEmptyString(options.declaration.description);
	return {
		ok: true,
		artifact: {
			kind: "skill",
			id: `${options.packageName}:${name}`,
			name,
			description: description ?? `Skill declared by ${options.packageName}.`,
			skillName: name,
			source: {
				type: "npm-module",
				packageName: options.packageName,
				relativePath,
			},
		},
	};
}

export function isValidModuleArtifactRelativePath(relativePath: string): boolean {
	if (relativePath === "" || relativePath.startsWith("/") || relativePath.includes("\\")) {
		return false;
	}
	const segments = relativePath.split("/");
	return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function duplicateDeclarationNames(declarations: readonly unknown[]): ReadonlySet<string> {
	const names: string[] = [];
	for (const declaration of declarations) {
		const parsed = declarationObjectSchema.safeParse(declaration);
		if (!parsed.success || parsed.data.kind !== "skill") continue;
		const name = readNonEmptyString(parsed.data.name);
		if (name !== undefined) names.push(name);
	}
	return new Set(names.filter((name, index) => names.indexOf(name) !== index));
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function sortDeclarationDiagnostics(
	diagnostics: readonly ModuleArtifactDeclarationDiagnostic[],
): readonly ModuleArtifactDeclarationDiagnostic[] {
	return [...diagnostics].sort((left, right) =>
		declarationDiagnosticSortKey(left).localeCompare(declarationDiagnosticSortKey(right)),
	);
}

function declarationDiagnosticSortKey(diagnostic: ModuleArtifactDeclarationDiagnostic): string {
	return [
		diagnostic.artifactName ?? "",
		diagnostic.path ?? "",
		diagnostic.code,
		diagnostic.message,
	].join("\0");
}

import { resolve } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

export type ExtensionSourceSpec =
	| { kind: "local"; raw: string; path: string }
	| {
			kind: "npm";
			raw: string;
			packageName: string;
			version: string | undefined;
			isPinned: boolean;
	  }
	| { kind: "git"; raw: string };

export interface ExtensionSourceSpecDiagnostic {
	readonly code: "extension_acquisition_invalid_npm_spec";
	readonly message: string;
	readonly spec: string;
}

export type ExtensionSourceLifecycleClassification =
	| {
			readonly type: "supported-npm";
			readonly source: Extract<ExtensionSourceSpec, { kind: "npm" }>;
	  }
	| {
			readonly type: "supported-local";
			readonly source: Extract<ExtensionSourceSpec, { kind: "local" }>;
	  }
	| {
			readonly type: "unsupported-git";
			readonly source: Extract<ExtensionSourceSpec, { kind: "git" }>;
			readonly message: string;
	  }
	| {
			readonly type: "unsupported-other";
			readonly sourceSpec: string;
			readonly message: string;
	  }
	| { readonly type: "invalid-npm"; readonly diagnostic: ExtensionSourceSpecDiagnostic };

export const GIT_EXTENSION_SOURCE_UNSUPPORTED_REASON =
	"Git extension sources are recognized but unsupported.";

export function gitExtensionSourceUnsupportedMessage(spec: string): string {
	return `${GIT_EXTENSION_SOURCE_UNSUPPORTED_REASON} Source: ${spec}.`;
}

export function extensionSourceRequirementMessage(spec: string): string {
	return `Extension source must be an npm: spec or an unprefixed local path: ${spec}.`;
}

export function classifyExtensionSourceLifecycle(
	projectRoot: string,
	raw: string,
): ExtensionSourceLifecycleClassification {
	const parsed = parseExtensionSourceSpec(projectRoot, raw);
	if (!parsed.ok) return { type: "invalid-npm", diagnostic: parsed.error };
	switch (parsed.value.kind) {
		case "npm":
			return { type: "supported-npm", source: parsed.value };
		case "git":
			return {
				type: "unsupported-git",
				source: parsed.value,
				message: gitExtensionSourceUnsupportedMessage(raw),
			};
		case "local": {
			const schemeWithSeparator = raw.match(/^[a-z][a-z0-9+.-]*:/iu)?.[0];
			if (schemeWithSeparator === undefined)
				return { type: "supported-local", source: parsed.value };
			return {
				type: "unsupported-other",
				sourceSpec: raw,
				message: extensionSourceRequirementMessage(raw),
			};
		}
	}
}

export function parseExtensionSourceSpec(
	projectRoot: string,
	raw: string,
): Result<ExtensionSourceSpec, ExtensionSourceSpecDiagnostic> {
	if (raw.startsWith("npm:")) return parseNpmExtensionSourceSpec(raw);
	if (raw.startsWith("git:")) return resultOk({ kind: "git", raw });
	return resultOk({ kind: "local", raw, path: resolve(projectRoot, raw) });
}

function parseNpmExtensionSourceSpec(
	raw: string,
): Result<ExtensionSourceSpec, ExtensionSourceSpecDiagnostic> {
	const body = raw.slice("npm:".length);
	if (body.trim() === "") return invalidNpmSpec(raw);
	const separator = npmVersionSeparatorIndex(body);
	const packageName = separator === -1 ? body : body.slice(0, separator);
	const version = separator === -1 ? undefined : body.slice(separator + 1);
	if (!isValidNpmPackageName(packageName) || version === "") return invalidNpmSpec(raw);
	return resultOk({
		kind: "npm",
		raw,
		packageName,
		version,
		isPinned: version !== undefined,
	});
}

function npmVersionSeparatorIndex(value: string): number {
	if (!value.startsWith("@")) return value.lastIndexOf("@");
	const slashIndex = value.indexOf("/");
	if (slashIndex === -1) return -1;
	return value.indexOf("@", slashIndex + 1);
}

function isValidNpmPackageName(value: string): boolean {
	if (value.includes(" ") || value.includes("\\") || value.includes("//")) return false;
	if (!value.startsWith("@")) return value.length > 0 && !value.includes("/");
	const slashIndex = value.indexOf("/");
	return (
		slashIndex > 1 && slashIndex < value.length - 1 && !value.slice(slashIndex + 1).includes("/")
	);
}

function invalidNpmSpec(raw: string): Result<never, ExtensionSourceSpecDiagnostic> {
	return resultErr({
		code: "extension_acquisition_invalid_npm_spec",
		message: `Invalid npm extension source spec: ${raw}. Expected npm:pkg, npm:pkg@version, npm:@scope/name, or npm:@scope/name@version.`,
		spec: raw,
	});
}

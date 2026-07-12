import { resolve } from "node:path";

import { firstLineEnding } from "@nseng-ai/foundation/markdown-frontmatter";

import { parseDeclaredExtensionSpecsToml } from "./descriptor-package.ts";
import { parseExtensionSourceSpec, type ExtensionSourceSpec } from "./extension-source-spec.ts";
import {
	parseExtensionArraySyntax,
	type ExtensionArraySyntax,
	type ExtensionArraySyntaxValue,
} from "./ns-toml-extension-syntax.ts";

export interface ExtensionSourceIdentity {
	readonly kind: "npm" | "local";
	readonly value: string;
}

export type NsTomlExtensionsAppendResult =
	| { readonly ok: true; readonly text: string; readonly isAdded: boolean }
	| {
			readonly ok: false;
			readonly reason: "invalid-toml" | "invalid-extensions" | "unsupported-format";
			readonly message: string;
	  };

export type NsTomlExtensionInstallPlan =
	| NsTomlExtensionsAppendResult
	| {
			readonly ok: false;
			readonly reason: "identity-conflict";
			readonly identity: ExtensionSourceIdentity;
			readonly requestedSpec: string;
			readonly existingSpecs: readonly string[];
			readonly message: string;
	  }
	| InvalidSourcePlan;

export type NsTomlExtensionUninstallPlan =
	| {
			readonly ok: true;
			readonly text: string;
			readonly isRemoved: boolean;
			readonly matchedSpec: string | undefined;
	  }
	| NsTomlSyntaxFailure
	| {
			readonly ok: false;
			readonly reason: "ambiguous-identity";
			readonly identity: ExtensionSourceIdentity;
			readonly requestedSpec: string;
			readonly matchingSpecs: readonly string[];
			readonly message: string;
	  }
	| InvalidSourcePlan;

export type NsTomlExtensionTargetPlan =
	| { readonly ok: true; readonly matchedSpec: string }
	| NsTomlSyntaxFailure
	| {
			readonly ok: false;
			readonly reason: "not-declared" | "ambiguous-identity";
			readonly requestedSpec: string;
			readonly declaredSpecs: readonly string[];
			readonly matchingSpecs: readonly string[];
			readonly message: string;
	  }
	| InvalidSourcePlan;

interface InvalidSourcePlan {
	readonly ok: false;
	readonly reason: "invalid-source";
	readonly requestedSpec: string;
	readonly message: string;
}

interface NsTomlSyntaxFailure {
	readonly ok: false;
	readonly reason: "invalid-toml" | "invalid-extensions" | "unsupported-format";
	readonly message: string;
}

export function planDeclaredExtensionUninstallToml(options: {
	readonly projectRoot: string;
	readonly source: string;
	readonly requestedSpec: string;
}): NsTomlExtensionUninstallPlan {
	const prepared = prepareSyntax(options.source);
	if (!prepared.ok) return prepared;
	const identity = extensionSourceIdentity(options.projectRoot, options.requestedSpec);
	if (identity === undefined) return invalidSource(options.requestedSpec);
	const matches = prepared.syntax.values.filter((value) =>
		identitiesEqual(identity, extensionSourceIdentity(options.projectRoot, value.decoded)),
	);
	if (matches.length === 0) {
		return { ok: true, text: options.source, isRemoved: false, matchedSpec: undefined };
	}
	if (matches.length > 1) {
		const matchingSpecs = matches.map((value) => value.decoded);
		return {
			ok: false,
			reason: "ambiguous-identity",
			identity,
			requestedSpec: options.requestedSpec,
			matchingSpecs,
			message: `Extension identity is declared more than once and cannot be removed unambiguously: ${matchingSpecs.join(", ")}.`,
		};
	}
	const match = matches[0];
	if (match === undefined) throw new Error("Expected one matching extension declaration.");
	return {
		ok: true,
		text: removeValue(options.source, match),
		isRemoved: true,
		matchedSpec: match.decoded,
	};
}

export function planDeclaredExtensionInstallToml(options: {
	readonly projectRoot: string;
	readonly source: string;
	readonly requestedSpec: string;
}): NsTomlExtensionInstallPlan {
	const prepared = prepareSyntax(options.source);
	if (!prepared.ok) return prepared;
	const identity = extensionSourceIdentity(options.projectRoot, options.requestedSpec);
	if (identity === undefined) return invalidSource(options.requestedSpec);
	const specs = prepared.syntax.values.map((value) => value.decoded);
	if (specs.includes(options.requestedSpec))
		return { ok: true, text: options.source, isAdded: false };
	const existingSpecs = specs.filter((spec) =>
		identitiesEqual(identity, extensionSourceIdentity(options.projectRoot, spec)),
	);
	if (existingSpecs.length > 0) {
		return {
			ok: false,
			reason: "identity-conflict",
			identity,
			requestedSpec: options.requestedSpec,
			existingSpecs,
			message: extensionIdentityConflictMessage(identity, existingSpecs),
		};
	}
	return appendWithSyntax(options.source, options.requestedSpec, prepared.syntax);
}

export function planDeclaredExtensionTarget(options: {
	readonly projectRoot: string;
	readonly source: string;
	readonly requestedSpec: string;
}): NsTomlExtensionTargetPlan {
	const prepared = prepareSyntax(options.source);
	if (!prepared.ok) return prepared;
	const identity = extensionSourceIdentity(options.projectRoot, options.requestedSpec);
	if (identity === undefined) return invalidSource(options.requestedSpec);
	const declaredSpecs = prepared.syntax.values.map((value) => value.decoded);
	const matchingSpecs = declaredSpecs.filter((spec) =>
		isUpdateTargetMatch({
			projectRoot: options.projectRoot,
			requestedSpec: options.requestedSpec,
			requestedIdentity: identity,
			declaredSpec: spec,
		}),
	);
	if (matchingSpecs.length === 1) {
		const matchedSpec = matchingSpecs[0];
		if (matchedSpec === undefined) throw new Error("Expected one matching extension target.");
		return { ok: true, matchedSpec };
	}
	const reason = matchingSpecs.length === 0 ? "not-declared" : "ambiguous-identity";
	return {
		ok: false,
		reason,
		requestedSpec: options.requestedSpec,
		declaredSpecs,
		matchingSpecs,
		message:
			reason === "not-declared"
				? `Extension target is not declared in ns.toml: ${options.requestedSpec}.`
				: `Extension identity is declared more than once and cannot be updated unambiguously: ${matchingSpecs.join(", ")}.`,
	};
}

export function extensionSourceIdentity(
	projectRoot: string,
	spec: string,
): ExtensionSourceIdentity | undefined {
	if (!spec.startsWith("npm:") && /^[a-z][a-z0-9+.-]*:/iu.test(spec)) return undefined;
	const parsed = parseExtensionSourceSpec(projectRoot, spec);
	if (!parsed.ok || parsed.value.kind === "git") return undefined;
	return extensionSourceIdentityFromParsed(projectRoot, parsed.value);
}

export function extensionSourceIdentityFromParsed(
	projectRoot: string,
	source: Exclude<ExtensionSourceSpec, { kind: "git" }>,
): ExtensionSourceIdentity {
	if (source.kind === "npm") return { kind: "npm", value: source.packageName };
	return { kind: "local", value: resolve(projectRoot, source.path) };
}

export function appendDeclaredExtensionSpecToml(
	source: string,
	spec: string,
): NsTomlExtensionsAppendResult {
	const parsed = parseDeclaredExtensionSpecsToml(source);
	if (!parsed.ok) return { ok: false, reason: parsed.reason, message: parsed.message };
	if (parsed.specs.includes(spec)) return { ok: true, text: source, isAdded: false };
	const syntax = parseExtensionArraySyntax(source);
	if (syntax === undefined) {
		if (parsed.specs.length > 0 || hasBareAssignment(source)) return unsupportedFormat("installed");
		const prefix = source.trimEnd();
		return {
			ok: true,
			text: `${prefix}${prefix === "" ? "" : "\n"}extensions = [${JSON.stringify(spec)}]\n`,
			isAdded: true,
		};
	}
	return appendWithSyntax(source, spec, syntax);
}

function prepareSyntax(
	source: string,
): { ok: true; syntax: ExtensionArraySyntax } | NsTomlSyntaxFailure {
	const parsed = parseDeclaredExtensionSpecsToml(source);
	if (!parsed.ok) return { ok: false, reason: parsed.reason, message: parsed.message };
	const syntax = parseExtensionArraySyntax(source);
	if (syntax === undefined) {
		if (parsed.specs.length === 0 && !hasBareAssignment(source)) {
			return {
				ok: true,
				syntax: {
					assignmentStart: source.length,
					openOffset: source.length,
					closeOffset: source.length,
					values: [],
					hasTrailingComma: false,
				},
			};
		}
		return unsupportedFormat("changed");
	}
	return { ok: true, syntax };
}

function appendWithSyntax(
	source: string,
	spec: string,
	syntax: ExtensionArraySyntax,
): NsTomlExtensionsAppendResult {
	if (syntax.openOffset === source.length) return appendDeclaredExtensionSpecToml(source, spec);
	const encoded = JSON.stringify(spec);
	const openLine = source.lastIndexOf("\n", syntax.openOffset) + 1;
	const closeLine = source.lastIndexOf("\n", syntax.closeOffset) + 1;
	if (openLine === closeLine) {
		const separator = syntax.values.length === 0 || syntax.hasTrailingComma ? "" : ",";
		const trailing = syntax.hasTrailingComma ? "," : "";
		return {
			ok: true,
			text: `${source.slice(0, syntax.closeOffset)}${separator} ${encoded}${trailing}${source.slice(syntax.closeOffset)}`,
			isAdded: true,
		};
	}
	const last = syntax.values.at(-1);
	const closeIndent = source.slice(closeLine, syntax.closeOffset).match(/^\s*/u)?.[0] ?? "";
	const itemIndent =
		last === undefined ? `${closeIndent}\t` : indentationAt(source, last.tokenStart);
	const ending = firstLineEnding(source) ?? "\n";
	let text = `${source.slice(0, closeLine)}${itemIndent}${encoded}${syntax.hasTrailingComma ? "," : ""}${ending}${source.slice(closeLine)}`;
	if (last !== undefined && !syntax.hasTrailingComma)
		text = `${text.slice(0, last.tokenEnd)},${text.slice(last.tokenEnd)}`;
	return { ok: true, text, isAdded: true };
}

function removeValue(source: string, value: ExtensionArraySyntaxValue): string {
	const comma = value.commaAfter ?? value.commaBefore;
	if (comma === undefined)
		return `${source.slice(0, value.tokenStart)}${source.slice(value.tokenEnd)}`;
	if (comma < value.tokenStart)
		return `${source.slice(0, comma)}${source.slice(comma + 1, value.tokenStart)}${source.slice(value.tokenEnd)}`;
	return `${source.slice(0, value.tokenStart)}${source.slice(value.tokenEnd, comma)}${source.slice(comma + 1)}`;
}

function hasBareAssignment(source: string): boolean {
	return source.split(/(?<=\n)/u).some((line) => /^extensions\s*=\s*\[/u.test(line.trimStart()));
}

function unsupportedFormat(verb: string): NsTomlSyntaxFailure {
	return {
		ok: false,
		reason: "unsupported-format",
		message: `Top-level ns.toml extensions assignment must be a textual array before an extension can be ${verb}.`,
	};
}

function invalidSource(requestedSpec: string): InvalidSourcePlan {
	return {
		ok: false,
		reason: "invalid-source",
		requestedSpec,
		message: `Extension source must be an npm: spec or an unprefixed local path: ${requestedSpec}.`,
	};
}

function indentationAt(source: string, offset: number): string {
	const start = source.lastIndexOf("\n", offset - 1) + 1;
	return source.slice(start, offset).match(/^\s*/u)?.[0] ?? "";
}

function isUpdateTargetMatch(options: {
	readonly projectRoot: string;
	readonly requestedSpec: string;
	readonly requestedIdentity: ExtensionSourceIdentity;
	readonly declaredSpec: string;
}): boolean {
	if (options.requestedIdentity.kind === "npm")
		return options.declaredSpec === options.requestedSpec;
	return identitiesEqual(
		options.requestedIdentity,
		extensionSourceIdentity(options.projectRoot, options.declaredSpec),
	);
}

function identitiesEqual(
	left: ExtensionSourceIdentity,
	right: ExtensionSourceIdentity | undefined,
): boolean {
	return right !== undefined && left.kind === right.kind && left.value === right.value;
}

function extensionIdentityConflictMessage(
	identity: ExtensionSourceIdentity,
	specs: readonly string[],
): string {
	const label =
		identity.kind === "npm" ? `npm package ${identity.value}` : `local path ${identity.value}`;
	return `Extension ${label} is already declared under a different source spec: ${specs.join(", ")}.`;
}

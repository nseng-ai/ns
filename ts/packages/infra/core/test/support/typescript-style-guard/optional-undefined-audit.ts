import * as ts from "typescript";

import { ADVISORY_OPTIONAL_UNDEFINED_PROPERTY } from "./config.ts";
import { parseTypeScriptSource } from "./module-specifiers.ts";
import { sourceLocationFields } from "./source-location.ts";

export interface OptionalUndefinedPropertyCandidate {
	readonly rule: typeof ADVISORY_OPTIONAL_UNDEFINED_PROPERTY;
	readonly path: string;
	readonly line: number;
	readonly column: number;
	readonly text: string;
	readonly propertyName: string;
	readonly containingTypeName: string | undefined;
	readonly parameterName: string | undefined;
	readonly hasOptionsInputName: boolean;
	readonly hasNull: boolean;
}

// Advisory by design: under exactOptionalPropertyTypes, `?: T | undefined` can be
// correct for option/input/override bags that accept or forward explicit undefined.
export function collectOptionalUndefinedPropertyCandidates(
	content: string,
	path: string,
): OptionalUndefinedPropertyCandidate[] {
	const sourceFile = parseTypeScriptSource(path, content);
	const candidates: OptionalUndefinedPropertyCandidate[] = [];

	function visit(node: ts.Node): void {
		if (ts.isPropertySignature(node) && isOptionalUndefinedProperty(node)) {
			candidates.push(buildCandidate(path, sourceFile, node));
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return candidates;
}

function isOptionalUndefinedProperty(node: ts.PropertySignature): boolean {
	return (
		node.questionToken !== undefined && typeIncludesKind(node.type, ts.SyntaxKind.UndefinedKeyword)
	);
}

function typeIncludesKind(type: ts.TypeNode | undefined, kind: ts.SyntaxKind): boolean {
	if (type === undefined) return false;
	if (type.kind === kind) return true;
	if (ts.isLiteralTypeNode(type) && type.literal.kind === kind) return true;
	if (ts.isUnionTypeNode(type)) {
		return type.types.some((member) => typeIncludesKind(member, kind));
	}
	return false;
}

function buildCandidate(
	path: string,
	sourceFile: ts.SourceFile,
	node: ts.PropertySignature,
): OptionalUndefinedPropertyCandidate {
	const containingTypeName = findContainingTypeName(node);
	const parameterName = findContainingParameterName(node);
	return {
		rule: ADVISORY_OPTIONAL_UNDEFINED_PROPERTY,
		...sourceLocationFields(path, sourceFile, node),
		propertyName: propertyNameText(node.name) ?? "<computed>",
		containingTypeName,
		parameterName,
		hasOptionsInputName:
			hasOptionsInputName(containingTypeName) || hasOptionsInputName(parameterName),
		hasNull: typeIncludesKind(node.type, ts.SyntaxKind.NullKeyword),
	};
}

function findContainingTypeName(node: ts.Node): string | undefined {
	let current: ts.Node | undefined = node.parent;
	while (current !== undefined) {
		if (ts.isInterfaceDeclaration(current)) return current.name.text;
		if (ts.isTypeAliasDeclaration(current)) return current.name.text;
		current = current.parent;
	}
	return undefined;
}

function findContainingParameterName(node: ts.Node): string | undefined {
	let current: ts.Node | undefined = node.parent;
	while (current !== undefined) {
		if (ts.isParameter(current)) return bindingNameText(current.name);
		current = current.parent;
	}
	return undefined;
}

function bindingNameText(name: ts.BindingName): string | undefined {
	return ts.isIdentifier(name) ? name.text : undefined;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name)) return name.text;
	if (ts.isStringLiteralLike(name)) return name.text;
	if (ts.isNumericLiteral(name)) return name.text;
	return undefined;
}

function hasOptionsInputName(name: string | undefined): boolean {
	if (name === undefined) return false;
	return /(?:options?|opts|input|inputs|override|overrides|request|params|args)$/iu.test(name);
}

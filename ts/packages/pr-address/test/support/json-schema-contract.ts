// Structural JSON Schema comparator for pr-address `--json-schema` contract tests.
//
// Compares an emitted schema document against a captured contract fixture at the
// structural-semantic level: property sets, required-ness, types, enums/consts,
// array items, nullability, object strictness (`additionalProperties: false`),
// and record key/value shapes must match.
//
// Accepted dialect differences that are deliberately ignored:
// - `title`, `description`, `default`, `examples`, `$schema`
// - numeric bounds (`minimum`/`maximum`) that zod adds for safe integers
// - `$defs` naming and `$ref` indirection (refs are resolved before comparing)
// - `anyOf` vs `oneOf` (+ `discriminator`) for unions
// - `propertyNames: {type: "string"}` without an enum on record types

interface ObjectAtom {
	kind: "object";
	properties: Map<string, CanonicalSchema>;
	required: Set<string>;
	isSealed: boolean;
}

interface RecordAtom {
	kind: "record";
	value: CanonicalSchema;
	keyEnum: Set<string> | null;
}

interface ArrayAtom {
	kind: "array";
	items: CanonicalSchema;
}

interface EnumAtom {
	kind: "enum";
	values: Set<string | number | boolean>;
}

interface PrimitiveAtom {
	kind: "primitive";
	type: string;
}

interface AnyAtom {
	kind: "any";
}

type SchemaAtom = ObjectAtom | RecordAtom | ArrayAtom | EnumAtom | PrimitiveAtom | AnyAtom;

type CanonicalSchema = SchemaAtom[];

const IGNORED_KEYS = new Set(["title", "description", "default", "examples", "$schema", "minimum", "maximum", "discriminator"]);

export function collectSchemaContractMismatches(actual: unknown, expected: unknown): string[] {
	const mismatches: string[] = [];
	const actualCanonical = canonicalize({ node: actual, defs: rootDefs(actual), side: "actual" });
	const expectedCanonical = canonicalize({ node: expected, defs: rootDefs(expected), side: "expected" });
	compareCanonical({ actual: actualCanonical, expected: expectedCanonical, path: "#", mismatches });
	return mismatches;
}

function rootDefs(document: unknown): Map<string, unknown> {
	const defs = new Map<string, unknown>();
	if (!isRecord(document)) return defs;
	const rawDefs = document["$defs"];
	if (!isRecord(rawDefs)) return defs;
	for (const [name, definition] of Object.entries(rawDefs)) defs.set(name, definition);
	return defs;
}

interface CanonicalizeOptions {
	node: unknown;
	defs: Map<string, unknown>;
	side: string;
	refStack?: readonly string[] | undefined;
}

function canonicalize(options: CanonicalizeOptions): CanonicalSchema {
	const { node, defs, side } = options;
	const refStack = options.refStack ?? [];
	if (!isRecord(node)) throw new Error(`${side} schema node is not an object`);

	const ref = node["$ref"];
	if (typeof ref === "string") {
		const refName = ref.replace("#/$defs/", "");
		if (refStack.includes(refName)) throw new Error(`${side} schema has a recursive $ref cycle at ${refName}`);
		const resolved = defs.get(refName);
		if (resolved === undefined) throw new Error(`${side} schema has unresolved $ref ${ref}`);
		return canonicalize({ node: resolved, defs, side, refStack: [...refStack, refName] });
	}

	const unionBranches = node["anyOf"] ?? node["oneOf"];
	if (Array.isArray(unionBranches)) {
		const atoms: SchemaAtom[] = [];
		for (const branch of unionBranches) atoms.push(...canonicalize({ node: branch, defs, side, refStack }));
		return atoms;
	}

	const enumValues = node["enum"];
	if (Array.isArray(enumValues)) return [{ kind: "enum", values: new Set(enumValues.map(asEnumValue)) }];
	if ("const" in node) return [{ kind: "enum", values: new Set([asEnumValue(node["const"])]) }];

	const type = node["type"];
	if (Array.isArray(type)) {
		return type.flatMap((member) => canonicalize({ node: { ...node, type: member }, defs, side, refStack }));
	}

	if (type === "object" || hasObjectShape(node)) {
		const properties = node["properties"];
		if (isRecord(properties)) {
			const canonicalProperties = new Map<string, CanonicalSchema>();
			for (const [name, propertyNode] of Object.entries(properties)) {
				canonicalProperties.set(name, canonicalize({ node: propertyNode, defs, side, refStack }));
			}
			const required = node["required"];
			return [
				{
					kind: "object",
					properties: canonicalProperties,
					required: new Set(Array.isArray(required) ? required.map(String) : []),
					isSealed: node["additionalProperties"] === false,
				},
			];
		}
		const additional = node["additionalProperties"];
		if (isRecord(additional)) {
			return [{ kind: "record", value: canonicalize({ node: additional, defs, side, refStack }), keyEnum: recordKeyEnum(node) }];
		}
		return [{ kind: "record", value: [{ kind: "any" }], keyEnum: recordKeyEnum(node) }];
	}

	if (type === "array") {
		const items = node["items"];
		return [{ kind: "array", items: items === undefined ? [{ kind: "any" }] : canonicalize({ node: items, defs, side, refStack }) }];
	}

	if (type === "null") return [{ kind: "primitive", type: "null" }];
	if (typeof type === "string") return [{ kind: "primitive", type }];

	if (Object.keys(node).every((key) => IGNORED_KEYS.has(key))) return [{ kind: "any" }];
	throw new Error(`${side} schema node has unrecognized shape: ${JSON.stringify(node)}`);
}

function recordKeyEnum(node: Record<string, unknown>): Set<string> | null {
	const propertyNames = node["propertyNames"];
	if (!isRecord(propertyNames)) return null;
	const keyEnum = propertyNames["enum"];
	if (!Array.isArray(keyEnum)) return null;
	return new Set(keyEnum.map(String));
}

function hasObjectShape(node: Record<string, unknown>): boolean {
	return isRecord(node["properties"]) || "additionalProperties" in node || "propertyNames" in node;
}

interface CompareCanonicalOptions {
	actual: CanonicalSchema;
	expected: CanonicalSchema;
	path: string;
	mismatches: string[];
}

function compareCanonical(options: CompareCanonicalOptions): void {
	const { actual, expected, path, mismatches } = options;
	const actualAtoms = mergeEnumAtoms(actual);
	const expectedAtoms = mergeEnumAtoms(expected);

	const actualSignatures = actualAtoms.map(atomSignature).sort();
	const expectedSignatures = expectedAtoms.map(atomSignature).sort();
	if (actualSignatures.join("|") !== expectedSignatures.join("|")) {
		mismatches.push(`${path}: branch kinds differ (actual: ${actualSignatures.join(", ")}; expected: ${expectedSignatures.join(", ")})`);
		return;
	}

	const remaining = [...expectedAtoms];
	for (const actualAtom of actualAtoms) {
		const matchIndex = bestMatchIndex(actualAtom, remaining);
		const expectedAtom = remaining[matchIndex];
		if (expectedAtom === undefined) {
			mismatches.push(`${path}: no matching branch for ${atomSignature(actualAtom)}`);
			continue;
		}
		remaining.splice(matchIndex, 1);
		compareAtoms({ actual: actualAtom, expected: expectedAtom, path, mismatches });
	}
}

function mergeEnumAtoms(atoms: CanonicalSchema): SchemaAtom[] {
	const enumValues = new Set<string | number | boolean>();
	const rest: SchemaAtom[] = [];
	for (const atom of atoms) {
		if (atom.kind === "enum") {
			for (const value of atom.values) enumValues.add(value);
			continue;
		}
		rest.push(atom);
	}
	if (enumValues.size > 0) rest.push({ kind: "enum", values: enumValues });
	return rest;
}

function atomSignature(atom: SchemaAtom): string {
	if (atom.kind === "primitive") return `primitive:${atom.type}`;
	return atom.kind;
}

function bestMatchIndex(actualAtom: SchemaAtom, candidates: SchemaAtom[]): number {
	const signature = atomSignature(actualAtom);
	const sameKindIndexes = candidates.flatMap((candidate, index) => (atomSignature(candidate) === signature ? [index] : []));
	const fallbackIndex = sameKindIndexes[0] ?? 0;
	if (actualAtom.kind !== "object") return fallbackIndex;

	// Unions can contain several object branches (e.g. full vs compact results,
	// pr vs local_branch provenance); match by identical property-name sets.
	const actualNames = [...actualAtom.properties.keys()].sort().join(",");
	for (const index of sameKindIndexes) {
		const candidate = candidates[index];
		if (candidate !== undefined && candidate.kind === "object" && [...candidate.properties.keys()].sort().join(",") === actualNames) {
			return index;
		}
	}
	return fallbackIndex;
}

interface CompareAtomsOptions {
	actual: SchemaAtom;
	expected: SchemaAtom;
	path: string;
	mismatches: string[];
}

function compareAtoms(options: CompareAtomsOptions): void {
	const { actual, expected, path, mismatches } = options;
	if (actual.kind === "enum" && expected.kind === "enum") {
		if (!setsEqual(actual.values, expected.values)) {
			mismatches.push(`${path}: enum values differ (actual: ${formatSet(actual.values)}; expected: ${formatSet(expected.values)})`);
		}
		return;
	}
	if (actual.kind === "array" && expected.kind === "array") {
		compareCanonical({ actual: actual.items, expected: expected.items, path: `${path}[]`, mismatches });
		return;
	}
	if (actual.kind === "record" && expected.kind === "record") {
		if (!nullableSetsEqual(actual.keyEnum, expected.keyEnum)) {
			mismatches.push(`${path}: record key enums differ (actual: ${formatSet(actual.keyEnum)}; expected: ${formatSet(expected.keyEnum)})`);
		}
		compareCanonical({ actual: actual.value, expected: expected.value, path: `${path}.*`, mismatches });
		return;
	}
	if (actual.kind === "object" && expected.kind === "object") {
		compareObjectAtoms({ actual, expected, path, mismatches });
	}
}

interface CompareObjectAtomsOptions {
	actual: ObjectAtom;
	expected: ObjectAtom;
	path: string;
	mismatches: string[];
}

function compareObjectAtoms(options: CompareObjectAtomsOptions): void {
	const { actual, expected, path, mismatches } = options;
	const actualNames = new Set(actual.properties.keys());
	const expectedNames = new Set(expected.properties.keys());
	if (!setsEqual(actualNames, expectedNames)) {
		const missing = [...expectedNames].filter((name) => !actualNames.has(name));
		const extra = [...actualNames].filter((name) => !expectedNames.has(name));
		mismatches.push(`${path}: property sets differ (missing: ${missing.join(", ") || "-"}; extra: ${extra.join(", ") || "-"})`);
		return;
	}
	if (!setsEqual(actual.required, expected.required)) {
		mismatches.push(`${path}: required sets differ (actual: ${formatSet(actual.required)}; expected: ${formatSet(expected.required)})`);
	}
	if (actual.isSealed !== expected.isSealed) {
		mismatches.push(`${path}: additionalProperties strictness differs (actual sealed: ${actual.isSealed}; expected sealed: ${expected.isSealed})`);
	}
	for (const [name, actualProperty] of actual.properties) {
		const expectedProperty = expected.properties.get(name);
		if (expectedProperty === undefined) continue;
		compareCanonical({ actual: actualProperty, expected: expectedProperty, path: `${path}.${name}`, mismatches });
	}
}

function asEnumValue(value: unknown): string | number | boolean {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	throw new Error(`Unsupported enum/const value: ${JSON.stringify(value)}`);
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) return false;
	for (const value of a) if (!b.has(value)) return false;
	return true;
}

function nullableSetsEqual(a: Set<string> | null, b: Set<string> | null): boolean {
	if (a === null || b === null) return a === b;
	return setsEqual(a, b);
}

function formatSet(values: Set<string | number | boolean> | null): string {
	if (values === null) return "(none)";
	return [...values].map(String).sort().join(", ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

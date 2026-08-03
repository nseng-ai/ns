import type { ArtifactSchemaRegistration, TargetProjectionField } from "../domain.ts";

const MISSING = Symbol("missing-json-pointer");

export type JsonPointerResult =
	| { readonly type: "found"; readonly value: unknown }
	| { readonly type: "missing" };

export function isValidJsonPointer(pointer: string): boolean {
	return pointer === "" || (pointer.startsWith("/") && !/~(?:[^01]|$)/u.test(pointer));
}

export function resolveJsonPointer(value: unknown, pointer: string): JsonPointerResult {
	if (!isValidJsonPointer(pointer)) return { type: "missing" };
	if (pointer === "") return { type: "found", value };
	let current: unknown = value;
	for (const encodedToken of pointer.slice(1).split("/")) {
		if (/~(?:[^01]|$)/u.test(encodedToken)) return { type: "missing" };
		const token = encodedToken.replaceAll("~1", "/").replaceAll("~0", "~");
		current = resolveToken(current, token);
		if (current === MISSING) return { type: "missing" };
	}
	return { type: "found", value: current };
}

function resolveToken(value: unknown, token: string): unknown | typeof MISSING {
	if (Array.isArray(value)) {
		if (!/^(0|[1-9]\d*)$/.test(token)) return MISSING;
		const index = Number(token);
		return index < value.length ? value[index] : MISSING;
	}
	if (typeof value !== "object" || value === null || !Object.hasOwn(value, token)) return MISSING;
	return (value as Readonly<Record<string, unknown>>)[token];
}

export interface ProjectionPlan {
	readonly fields: readonly TargetProjectionField[];
	readonly clearFields: readonly string[];
}

export function buildProjectionPlan(
	envelope: Readonly<Record<string, unknown>>,
	registration: ArtifactSchemaRegistration,
): ProjectionPlan {
	function compareCodeUnits(left: string, right: string): number {
		return left < right ? -1 : left > right ? 1 : 0;
	}
	const fields = Object.entries(registration.fields)
		.map(([pointer, mapping]) => {
			const resolved = resolveJsonPointer(envelope, pointer);
			return {
				column: mapping.target,
				mode: mapping.mode ?? "scalar",
				value: resolved.type === "missing" || resolved.value === null ? null : resolved.value,
			} satisfies TargetProjectionField;
		})
		.sort((left, right) => compareCodeUnits(left.column, right.column));
	return {
		fields,
		clearFields: [...(registration.clearFields ?? [])].sort(compareCodeUnits),
	};
}

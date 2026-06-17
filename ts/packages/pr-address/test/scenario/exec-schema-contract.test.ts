import { describe, expect, test } from "vitest";

import { buildSurfacePlan } from "../../../clinkr/src/surface.ts";
import { EXEC_OPERATIONS } from "../../src/exec-commands.ts";
import { buildOperationSchemaDocument } from "../../src/operation-schemas/index.ts";

/**
 * Known deltas between clinkr parse-schema option surface and published
 * `input_json_schema` document properties. Each entry MUST have a comment
 * explaining the delta rationale; do not bulk-allowlist.
 */
const CONTRACT_DELTAS: Record<string, string[]> = {};

describe("pr-address exec operation parse↔document schema contract", () => {
	test("every exec operation's parse schema keys match published document schema keys (modulo deltas)", () => {
		for (const operation of EXEC_OPERATIONS) {
			const { parseKeys, documentKeys } = schemaKeysForOperation(operation.name, operation.schema);
			const allowedDeltas = new Set(CONTRACT_DELTAS[operation.name] ?? []);

			// Keys in parseKeys but not in documentKeys (extra surface)
			const extraParseKeys = [...parseKeys].filter((key) => !documentKeys.has(key) && !allowedDeltas.has(key));

			// Keys in documentKeys but not in parseKeys (missing surface)
			const missingParseKeys = [...documentKeys].filter((key) => !parseKeys.has(key) && !allowedDeltas.has(key));

			if (extraParseKeys.length > 0 || missingParseKeys.length > 0) {
				throw new Error(
					`${operation.name}: parse↔document schema contract mismatch (extra: ${extraParseKeys.join(", ") || "-"}; missing: ${missingParseKeys.join(", ") || "-"})`,
				);
			}
		}
	});

	test("CONTRACT_DELTAS allowlist covers only real deltas", () => {
		// Every allowlisted delta must correspond to a real mismatch; stale allowlist
		// entries are tech debt that obscure the actual delta surface.
		for (const operation of EXEC_OPERATIONS) {
			const { parseKeys, documentKeys } = schemaKeysForOperation(operation.name, operation.schema);
			const allowedDeltas = CONTRACT_DELTAS[operation.name] ?? [];
			for (const delta of allowedDeltas) {
				const isRealDelta =
					(parseKeys.has(delta) && !documentKeys.has(delta)) || (!parseKeys.has(delta) && documentKeys.has(delta));
				if (!isRealDelta) {
					throw new Error(`${operation.name}: CONTRACT_DELTAS includes stale allowlist entry '${delta}'`);
				}
			}
		}
	});
});

function schemaKeysForOperation(operationName: string, schema: (typeof EXEC_OPERATIONS)[number]["schema"]): { parseKeys: Set<string>; documentKeys: Set<string> } {
	const surface = buildSurfacePlan({ commandName: operationName, schema });
	const parseKeys = new Set(surface.options.map((option) => option.key));

	const document = buildOperationSchemaDocument(operationName);
	if (document === undefined) {
		throw new Error(`No schema document builder for operation '${operationName}'`);
	}

	const inputSchema = document.input_json_schema as Record<string, unknown>;
	const properties = inputSchema.properties as Record<string, unknown> | undefined;
	return { parseKeys, documentKeys: new Set(properties !== undefined ? Object.keys(properties) : []) };
}

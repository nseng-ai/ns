import { DatabaseSync } from "node:sqlite";
import type { OperationResult } from "@nseng-ai/gitplane";
import { databaseError, resolveDatabasePath, transaction } from "./database.ts";
import { CONTROL_SCHEMA, inspectControlSchema } from "./schema.ts";

export interface InitializeSqliteStoreOptions {
	readonly path: string;
	readonly baseDirectory: string;
}

export async function initializeSqliteStore(
	options: InitializeSqliteStoreOptions,
): Promise<OperationResult> {
	let database: DatabaseSync | undefined;
	try {
		database = new DatabaseSync(resolveDatabasePath(options.path, options.baseDirectory));
		const before = inspectControlSchema(database);
		if (before.state === "incompatible") return incompatible(before.detail);
		if (before.state === "compatible") return { ok: true };

		transaction(database, () => {
			for (const descriptor of Object.values(CONTROL_SCHEMA)) {
				if (!before.missingTables.includes(descriptor.name)) continue;
				for (const statement of descriptor.statements) database?.exec(statement);
			}
			const after = inspectControlSchema(database!);
			if (after.state !== "compatible")
				throw new ControlSchemaVerificationError(
					after.state === "incompatible"
						? after.detail
						: `Missing Gitplane control tables: ${after.missingTables.join(", ")}.`,
				);
		});
		return { ok: true };
	} catch (error) {
		if (error instanceof ControlSchemaVerificationError) return incompatible(error.detail);
		return { ok: false, error: databaseError(error) };
	} finally {
		database?.close();
	}
}

class ControlSchemaVerificationError extends Error {
	readonly detail: string;
	constructor(detail: string) {
		super(detail);
		this.detail = detail;
	}
}

function incompatible(detail: string): OperationResult {
	return {
		ok: false,
		error: { code: "incompatible-control-schema", message: detail },
	};
}

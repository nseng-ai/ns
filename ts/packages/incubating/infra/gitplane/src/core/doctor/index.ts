import { z } from "zod";
import type { ArtifactKindRegistration } from "../domain.ts";
import type { DoctorIntrospection, DoctorCheck } from "../gateways.ts";

export const doctorCheckSchema = z
	.object({
		code: z.string(),
		subject: z.string(),
		status: z.union([z.literal("pass"), z.literal("fail"), z.literal("unsupported")]),
		summary: z.string(),
	})
	.strict();

export function evaluateDoctor(request: {
	readonly sourceId: string;
	readonly kinds: readonly ArtifactKindRegistration[];
	readonly introspection: DoctorIntrospection;
}): readonly DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	const control = request.introspection.controlSchema;
	checks.push({
		code: "control-schema",
		subject: request.sourceId,
		status: control.state === "compatible" ? "pass" : "fail",
		summary:
			control.state === "compatible"
				? `Control schema version ${control.version} is compatible.`
				: control.detail,
	});
	const kinds = [...request.kinds].sort(
		(left, right) =>
			compareCodeUnits(left.apiVersion, right.apiVersion) ||
			compareCodeUnits(left.kind, right.kind),
	);
	for (const kind of kinds) checks.push(...buildKindChecks(kind, request.introspection));
	return checks;
}

function buildKindChecks(
	kind: ArtifactKindRegistration,
	introspection: DoctorIntrospection,
): readonly DoctorCheck[] {
	const checks: DoctorCheck[] = [];
	const subject = `${kind.apiVersion}/${kind.kind}:${kind.target.table}`;
	const table = introspection.targetTables.find((item) => item.name === kind.target.table);
	checks.push(
		check("target-table", subject, table !== undefined, `Target table ${kind.target.table}`),
	);
	const projected = new Set<string>();
	let needsJson = false;
	for (const registration of Object.values(kind.schemaVersions)) {
		for (const field of Object.values(registration.fields)) {
			projected.add(field.target);
			needsJson ||= field.mode === "json";
		}
		for (const field of registration.clearFields ?? []) projected.add(field);
	}
	const columns = new Set(table?.columns ?? []);
	checks.push(
		check(
			"target-columns",
			subject,
			[...projected].every((item) => columns.has(item)),
			"Projected target columns",
		),
	);
	const lineage = Object.values(kind.target.lineage);
	checks.push(
		check(
			"target-lineage-columns",
			subject,
			lineage.every((item) => columns.has(item)),
			"Mapped lineage columns",
		),
	);
	const unique =
		table?.uniqueColumnSets.some(
			(set) =>
				set.length === 2 &&
				set.includes(kind.target.lineage.sourceId) &&
				set.includes(kind.target.lineage.artifactId),
		) ?? false;
	checks.push(
		check("target-source-artifact-uniqueness", subject, unique, "Exact source/artifact uniqueness"),
	);
	if (needsJson) {
		checks.push({
			code: "target-json-mapping-support",
			subject,
			status:
				introspection.jsonProjection.status === "unsupported" &&
				introspection.jsonProjection.requirement === "required"
					? "fail"
					: introspection.jsonProjection.status,
			summary: introspection.jsonProjection.detail,
		});
	}
	return checks;
}

function compareCodeUnits(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function check(code: string, subject: string, pass: boolean, label: string): DoctorCheck {
	return {
		code,
		subject,
		status: pass ? "pass" : "fail",
		summary: `${label} ${pass ? "are compatible" : "are missing or incompatible"}.`,
	};
}

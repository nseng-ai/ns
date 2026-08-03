import { createHash } from "node:crypto";
import type { ReconciliationPlanBaseline } from "./gateways.ts";

export type ReconciliationPlanDigestInput = Omit<ReconciliationPlanBaseline, "planDigest">;

export function deriveReconciliationPlanDigest(input: ReconciliationPlanDigestInput): string {
	const canonical = canonicalJson({
		...input,
		entries: [...input.entries].sort((left, right) =>
			left.artifactId.localeCompare(right.artifactId),
		),
	});
	return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) =>
		typeof item === "object" && item !== null && !Array.isArray(item)
			? Object.fromEntries(
					Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
				)
			: item,
	);
}

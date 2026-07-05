import { finiteNumberField, stringArrayField } from "@nseng-ai/foundation/primitives";
import { isRecord, stringField } from "@nseng-ai/pi/runtime/primitives";

import type { WatchEventEntry } from "./model.ts";

export function parseWatchEventEntry(value: unknown): WatchEventEntry | undefined {
	if (!isRecord(value)) return undefined;
	if (value.version !== 1) return undefined;
	if (typeof value.type !== "string") return undefined;
	if (!isWatchEventType(value.type)) return undefined;
	const createdAt = stringField(value, "createdAt");
	if (createdAt === undefined) return undefined;
	const itemKeys = stringArrayField(value, "itemKeys");
	if (isRestoreRelevantEventType(value.type) && itemKeys === undefined) return undefined;
	const branch = stringField(value, "branch");
	const prNumber = finiteNumberField(value, "prNumber");
	const headRefOid = stringField(value, "headRefOid");
	return {
		version: 1,
		type: value.type,
		...(branch === undefined ? {} : { branch }),
		...(prNumber === undefined ? {} : { prNumber }),
		...(headRefOid === undefined ? {} : { headRefOid }),
		...(itemKeys === undefined ? {} : { itemKeys }),
		createdAt,
		...(isRecord(value.details) ? { details: value.details } : {}),
	};
}
function isWatchEventType(value: string): value is WatchEventEntry["type"] {
	return (
		value === "baseline" ||
		value === "detected" ||
		value === "dispatched" ||
		value === "ignored" ||
		value === "stopped" ||
		value === "config" ||
		value === "error"
	);
}

function isRestoreRelevantEventType(value: WatchEventEntry["type"]): boolean {
	return value === "baseline" || value === "dispatched" || value === "ignored";
}

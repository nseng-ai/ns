import { isRecord, stringField } from "../../runtime/primitives.ts";

import type { WatchEventEntry } from "./model.ts";

export function parseWatchEventEntry(value: unknown): WatchEventEntry | undefined {
	if (!isRecord(value)) return undefined;
	if (value.version !== 1) return undefined;
	if (typeof value.type !== "string") return undefined;
	if (!isWatchEventType(value.type)) return undefined;
	const itemKeys = Array.isArray(value.itemKeys)
		? value.itemKeys.filter((item): item is string => typeof item === "string")
		: undefined;
	return {
		version: 1,
		type: value.type,
		branch: stringField(value, "branch"),
		prNumber: numberField(value, "prNumber"),
		headRefOid: stringField(value, "headRefOid"),
		itemKeys,
		createdAt: stringField(value, "createdAt") ?? "",
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

function numberField(value: Record<string, unknown>, key: string): number | undefined {
	const field = value[key];
	return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

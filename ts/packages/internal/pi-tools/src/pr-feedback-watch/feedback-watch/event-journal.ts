import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { PR_FEEDBACK_WATCH_STATE_TYPE } from "./constants.ts";
import { parseWatchEventEntry } from "./events.ts";
import type { FeedbackSnapshot, WatchEventEntry, WatchStatus } from "./model.ts";
import type { ExtensionAPI, ExtensionContext } from "./types.ts";

export interface WatchEventAppendInput {
	branch?: string;
	prNumber?: number;
	headRefOid?: string;
	itemKeys?: string[];
	details?: Record<string, unknown>;
}

export interface RestoredWatchEventSets {
	seenKeys: Set<string>;
	attemptedKeys: Set<string>;
}

export function restoreWatchEventSets(ctx: ExtensionContext): RestoredWatchEventSets {
	const entries = ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
	const seenKeys = new Set<string>();
	const attemptedKeys = new Set<string>();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== PR_FEEDBACK_WATCH_STATE_TYPE) continue;
		const event = parseWatchEventEntry(entry.data);
		if (event === undefined || event.itemKeys === undefined) continue;
		if (event.type === "baseline" || event.type === "ignored") {
			for (const key of event.itemKeys) seenKeys.add(key);
		}
		if (event.type === "dispatched") {
			for (const key of event.itemKeys) {
				seenKeys.add(key);
				attemptedKeys.add(key);
			}
		}
	}
	return { seenKeys, attemptedKeys };
}

export function appendWatchEvent(options: {
	pi: ExtensionAPI;
	status: WatchStatus;
	type: WatchEventEntry["type"];
	overrides?: WatchEventAppendInput;
}): void {
	const { pi, status, type, overrides = {} } = options;
	pi.appendEntry?.(PR_FEEDBACK_WATCH_STATE_TYPE, {
		version: 1,
		type,
		...optionalEntry("branch", status.branch),
		...optionalEntry("prNumber", status.prNumber),
		createdAt: new Date().toISOString(),
		...overrides,
	} satisfies WatchEventEntry);
}

export function eventFieldsFromSnapshot(snapshot: FeedbackSnapshot): WatchEventAppendInput {
	const branch = snapshot.data.target.branch ?? undefined;
	const prNumber = snapshot.data.target.pr_number;
	return {
		...optionalEntry("branch", branch),
		...optionalEntry("prNumber", prNumber ?? undefined),
		...optionalEntry("headRefOid", snapshot.headRefOid),
	};
}

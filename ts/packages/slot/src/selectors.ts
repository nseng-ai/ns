import { basename } from "node:path";

import { extractSlotNumber, generateSlotName } from "./naming.ts";

export type SelectorResult = { type: "ok"; slotName: string } | { type: "error"; message: string };

export function resolveNum(num: number, poolSize: number): SelectorResult {
	if (!(1 <= num && num <= poolSize)) return { type: "error", message: `--num must be in 1..${poolSize} (got ${num}).` };
	return { type: "ok", slotName: generateSlotName(num) };
}

export function resolveWt(wt: string): SelectorResult {
	if (extractSlotNumber(wt) === null) return { type: "error", message: `--wt '${wt}' is not a valid slot name (e.g. 'slot-01').` };
	return { type: "ok", slotName: wt };
}

export function resolveCurrent(cwd: string): SelectorResult {
	const slotName = basename(cwd);
	if (extractSlotNumber(slotName) === null) return { type: "error", message: `--current requires running from a slot worktree; cwd '${cwd}' is not a slot directory (e.g. 'slot-01').` };
	return { type: "ok", slotName };
}

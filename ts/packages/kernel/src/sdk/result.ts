import type { ClinkrOkExit } from "@nseng-ai/clinkr";

export type NsResult =
	| { ok: true; message: string }
	| { ok: false; exitCode: number; message: string };

export function ok(message: string): NsResult {
	return { ok: true, message };
}

export function okExit<T>(data: T): ClinkrOkExit<T> {
	return { type: "ok", data };
}

export function failed(message: string, exitCode = 1): NsResult {
	return { ok: false, exitCode, message };
}

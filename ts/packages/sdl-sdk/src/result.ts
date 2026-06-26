export type SdlResult =
	| { ok: true; message: string }
	| { ok: false; exitCode: number; message: string };

export function ok(message: string): SdlResult {
	return { ok: true, message };
}

export function failed(message: string, exitCode = 1): SdlResult {
	return { ok: false, exitCode, message };
}

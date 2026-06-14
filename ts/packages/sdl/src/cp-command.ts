import { loadSdlCommand, runSdlCommand } from "./command-registry.ts";
import type { SdlCommand, SdlContext, SdlResult } from "./sdk.ts";

export async function loadCpCommand(cwd: string): Promise<{ ok: true; command: SdlCommand } | { ok: false; message: string }> {
	return loadSdlCommand("cp", cwd);
}

export async function runCp(ctx: SdlContext): Promise<SdlResult> {
	return runSdlCommand(ctx, "cp");
}

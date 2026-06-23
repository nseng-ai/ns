import type { ExecResult, SdlExtensionApi } from "@sdl/sdl/sdk";

export const GIT_FACT_TIMEOUT_MS = 30_000;
export const GT_COMMAND_TIMEOUT_MS = 120_000;
export const GT_CREATE_TIMEOUT_MS = 120_000;

export function execGt(
  ctx: SdlExtensionApi,
  args: readonly string[],
  timeoutMs = GT_COMMAND_TIMEOUT_MS,
): Promise<ExecResult> {
  return ctx.exec("gt", [...args], { timeoutMs });
}

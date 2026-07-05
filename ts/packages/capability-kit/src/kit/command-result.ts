import type { ExecResult } from "@nseng-ai/core/exec";

export type CommandResult = Pick<ExecResult, "code" | "stdout" | "stderr"> & {
	killed?: ExecResult["killed"];
};

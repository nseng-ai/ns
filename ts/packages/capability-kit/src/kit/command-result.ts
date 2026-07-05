import type { ExecResult } from "@nseng-ai/foundation/exec";

export type CommandResult = Pick<ExecResult, "code" | "stdout" | "stderr"> & {
	killed?: ExecResult["killed"];
};

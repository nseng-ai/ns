import type { ExecResult } from "@ns/core/exec";

export type CommandResult = Pick<ExecResult, "code" | "stdout" | "stderr"> & {
	killed?: ExecResult["killed"];
};

import { formatCommand } from "@sdl/core/command";

export const SUBMIT_BASE_ARGS = [
	"submit",
	"--no-edit",
	"--publish",
	"--no-stack",
	"--no-ai",
	"--no-interactive",
	"--no-view",
	"--no-web",
] as const;

export function buildSubmitArgs(options: { dryRun: boolean; force: boolean }): string[] {
	return [
		...SUBMIT_BASE_ARGS,
		...(options.force ? ["--force"] : []),
		...(options.dryRun ? ["--dry-run"] : []),
	];
}

export function formatSubmitCommandDisplay(options: { dryRun: boolean; force: boolean }): string {
	return formatCommand("gt", buildSubmitArgs(options));
}

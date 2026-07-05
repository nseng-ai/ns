import { formatCommand } from "@nseng-ai/foundation/command";

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

export interface SubmitCommandSpecOptions {
	isDryRun: boolean;
	shouldForce: boolean;
}

export interface SubmitCommandDisplays {
	submitCommandDisplay: string;
	submitDryRunCommandDisplay: string;
}

export function buildSubmitArgs(options: SubmitCommandSpecOptions): string[] {
	return [
		...SUBMIT_BASE_ARGS,
		...(options.shouldForce ? ["--force"] : []),
		...(options.isDryRun ? ["--dry-run"] : []),
	];
}

export function formatSubmitCommandDisplay(options: SubmitCommandSpecOptions): string {
	return formatCommand("gt", buildSubmitArgs(options));
}

export function formatSubmitCommandDisplays(options: {
	shouldForce: boolean;
}): SubmitCommandDisplays {
	return {
		submitCommandDisplay: formatSubmitCommandDisplay({
			isDryRun: false,
			shouldForce: options.shouldForce,
		}),
		submitDryRunCommandDisplay: formatSubmitCommandDisplay({
			isDryRun: true,
			shouldForce: options.shouldForce,
		}),
	};
}

import { formatCommand } from "@nseng-ai/foundation/command";

const GT_SUBMIT_PREFIX_ARGS = ["submit", "--no-edit", "--publish"] as const;
const GT_SUBMIT_SUFFIX_ARGS = ["--no-ai", "--no-interactive", "--no-view", "--no-web"] as const;
export const SUBMIT_BASE_ARGS = buildGtSubmitBaseArgs();

export interface SubmitCommandSpecOptions {
	isDryRun: boolean;
	shouldForce: boolean;
}

export interface SubmitCommandDisplays {
	submitCommandDisplay: string;
	submitDryRunCommandDisplay: string;
}

function buildGtSubmitBaseArgs(): string[] {
	return [...GT_SUBMIT_PREFIX_ARGS, "--no-stack", ...GT_SUBMIT_SUFFIX_ARGS];
}

function buildGtSubmitArgs(options: { shouldForce: boolean; isDryRun?: boolean }): string[] {
	return [
		...buildGtSubmitBaseArgs(),
		...(options.shouldForce ? ["--force"] : []),
		...(options.isDryRun === true ? ["--dry-run"] : []),
	];
}

export function buildSubmitArgs(options: SubmitCommandSpecOptions): string[] {
	return buildGtSubmitArgs({
		shouldForce: options.shouldForce,
		isDryRun: options.isDryRun,
	});
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

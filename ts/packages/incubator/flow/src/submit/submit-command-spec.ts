import { formatCommand } from "@nseng-ai/foundation/command";

const GT_SUBMIT_PREFIX_ARGS = ["submit", "--no-edit", "--publish"] as const;
const GT_SUBMIT_SUFFIX_ARGS = ["--no-ai", "--no-interactive", "--no-view", "--no-web"] as const;
const GT_SUBMIT_MODE_ARGS = {
	default: ["--no-stack"],
	stackUpdate: ["--stack", "--update-only"],
} as const;

type GtSubmitMode = keyof typeof GT_SUBMIT_MODE_ARGS;

export const SUBMIT_BASE_ARGS = buildGtSubmitBaseArgs("default");
export const STACK_UPDATE_BASE_ARGS = buildGtSubmitBaseArgs("stackUpdate");

export interface SubmitCommandSpecOptions {
	isDryRun: boolean;
	shouldForce: boolean;
}

export interface SubmitCommandDisplays {
	submitCommandDisplay: string;
	submitDryRunCommandDisplay: string;
}

function buildGtSubmitBaseArgs(mode: GtSubmitMode): string[] {
	return [...GT_SUBMIT_PREFIX_ARGS, ...GT_SUBMIT_MODE_ARGS[mode], ...GT_SUBMIT_SUFFIX_ARGS];
}

function buildGtSubmitArgs(options: {
	mode: GtSubmitMode;
	shouldForce: boolean;
	isDryRun?: boolean;
}): string[] {
	return [
		...buildGtSubmitBaseArgs(options.mode),
		...(options.shouldForce ? ["--force"] : []),
		...(options.isDryRun === true ? ["--dry-run"] : []),
	];
}

export function buildSubmitArgs(options: SubmitCommandSpecOptions): string[] {
	return buildGtSubmitArgs({
		mode: "default",
		shouldForce: options.shouldForce,
		isDryRun: options.isDryRun,
	});
}

export function buildStackUpdateArgs(options: { shouldForce: boolean }): string[] {
	return buildGtSubmitArgs({ mode: "stackUpdate", shouldForce: options.shouldForce });
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

export function formatStackUpdateCommandDisplay(options: { shouldForce: boolean }): string {
	return formatCommand("gt", buildStackUpdateArgs(options));
}

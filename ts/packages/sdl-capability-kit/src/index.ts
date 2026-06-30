export {
	createSdlCommandRunner,
	SdlCommandExecApi,
	SdlStdinCapableCommandExecApi,
} from "./command-runner.ts";
export {
	createSdlCliExecAdapter,
	createSdlGitGateway,
	execSdlCommand,
	execSdlGit,
	readSdlGitPorcelainStatus,
	type ExecSdlCommandOptions,
	type SdlGitPorcelainStatusResult,
} from "./git.ts";
export {
	commandFailure,
	err,
	formatCommandFailureConciseCause,
	formatErrorInfoDiagnosticLines,
	ok,
	resultErr,
	resultOk,
	type CommandFailureOptions,
	type ErrorInfo,
	type GatewayResult,
	type Result,
} from "./gateway-result.ts";
export { createSdlDomainCommand, type SdlDomainCommandOptions } from "./sdl-command.ts";
export {
	createSdlClinkrInteraction,
	createSdlCwdEnvStdinContext,
	readEmptySdlStdin,
	type SdlClinkrInteractionOptions,
	type SdlCwdEnvStdinContext,
} from "./sdl-context.ts";

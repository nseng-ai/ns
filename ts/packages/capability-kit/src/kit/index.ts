export {
	createNsCommandRunner,
	NsCommandExecApi,
	NsStdinCapableCommandExecApi,
} from "./command-runner.ts";
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
export { createNsDomainCommand, type NsDomainCommandOptions } from "./ns-command.ts";
export {
	createNsClinkrInteraction,
	createNsCwdEnvStdinContext,
	readEmptyNsStdin,
	type NsClinkrInteractionOptions,
	type NsCwdEnvStdinContext,
} from "./ns-context.ts";

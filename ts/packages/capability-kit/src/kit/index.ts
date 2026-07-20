export {
	defineFirstPartyCommand,
	materializeFirstPartyCommand,
	type DefineFirstPartyCommandOptions,
	type FirstPartyNsClinkrCommandOptions,
	type FirstPartyCommandDefinition,
} from "./first-party-command.ts";
export {
	createRealFirstPartyCommandContext,
	type CreateRealFirstPartyCommandContextOptions,
	type FirstPartyCommandContext,
} from "./command-context.ts";
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
export { createNsGitGateway } from "./git-gateway.ts";
export { createNsDomainCommand, type NsDomainCommandOptions } from "./ns-command.ts";
export {
	createNsClinkrInteraction,
	createNsCwdEnvStdinContext,
	readEmptyNsStdin,
	type NsClinkrInteractionOptions,
	type NsCwdEnvStdinContext,
} from "./ns-context.ts";

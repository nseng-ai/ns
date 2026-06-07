export {
	formatCommand,
	formatExecFailure,
	formatExecStartupFailure,
	formatOutputSection,
	formatPlainOutputSection,
	formatShellArg,
	normalizeExecResult,
	shellQuote,
	stripTerminalEscapes,
	tailText,
	truncateTail,
} from "@asdl/pi-extension-runtime/command-runtime";
export type { ExecResult, PiExecResultLike, TailTextOptions } from "@asdl/pi-extension-runtime/command-runtime";

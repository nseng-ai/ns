import { createJiti } from "jiti/static";

import {
	buildFailureMachineEnvelopeSchema,
	buildMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	bundledArtifactDefinitionSchema,
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	defineCommand,
	defineExtension,
	defineRawCommand,
	extensionDescriptorSchema,
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	extensionPointDefinitionSchema,
	failure,
	isMatrixProgressEvent,
	machineEnvelopeSchema,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	negative,
	noopNsCommandIo,
	noopNsProgress,
	normalizeTextOutput,
	ok,
	padMatrixProgressTextEnd,
	stripOuterCodeFence,
	toMachineEnvelope,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	usageError,
	validateExtensionDescriptor,
	validateLoadedCommandName,
	z,
} from "../sdk/index.ts";

/** Module specifier that ns command entries import the SDK from. */
const SDK_SPECIFIER = "@nseng-ai/kernel/sdk";

// Keep this object in sync with all runtime value exports from @nseng-ai/kernel/sdk; type-only exports are erased.
// Descriptor helpers are test-authoring-only today, but stay here while they are runtime exports.
const nsSdkVirtualModule = {
	buildFailureMachineEnvelopeSchema,
	buildMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	bundledArtifactDefinitionSchema,
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	defineCommand,
	defineExtension,
	defineRawCommand,
	extensionDescriptorSchema,
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	extensionPointDefinitionSchema,
	failure,
	isMatrixProgressEvent,
	machineEnvelopeSchema,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	negative,
	noopNsCommandIo,
	noopNsProgress,
	normalizeTextOutput,
	ok,
	padMatrixProgressTextEnd,
	stripOuterCodeFence,
	toMachineEnvelope,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	usageError,
	validateExtensionDescriptor,
	validateLoadedCommandName,
	z,
} satisfies Record<string, unknown>;

/**
 * Create the ns-aware jiti instance used for user-authored modules.
 *
 * The load-bearing option is `virtualModules`: it binds `@nseng-ai/kernel/sdk` to the
 * exact SDK object imported by this process, so descriptor and command modules share host SDK
 * identity instead of resolving dependency copies from their package roots.
 *
 * First-party bundled commands are loaded by package module specifier through
 * the selected-command loader instead of through source-checkout aliases here.
 */
export function createNsJiti(): ReturnType<typeof createJiti> {
	return createJiti(import.meta.url, {
		moduleCache: false,
		virtualModules: {
			[SDK_SPECIFIER]: nsSdkVirtualModule,
		},
	});
}

/**
 * Load the default export of a TypeScript or JavaScript ns user module.
 *
 * Callers validate the returned value according to the command-entry contract.
 * Throws when the file cannot be transpiled or imported.
 */
export async function loadNsUserModuleDefault(modulePath: string): Promise<unknown> {
	const jiti = createNsJiti();
	return jiti.import(modulePath, { default: true });
}

import { truncateTextHead, truncateTextHeadTail } from "@nseng-ai/foundation/text-truncation";
import {
	normalizeTextOutput,
	stripOuterCodeFence,
	trimOuterBlankLines,
} from "@nseng-ai/foundation/text-normalization";

import { defineCommand, defineExtension, defineRawCommand } from "./command.ts";
import {
	bundledArtifactDefinitionSchema,
	extensionDescriptorSchema,
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	extensionPointDefinitionSchema,
	hiddenExecGroup,
	validateExtensionDescriptor,
	validateLoadedCommandName,
} from "./descriptor.ts";
import {
	buildFailureMachineEnvelopeSchema,
	buildMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	failure,
	machineEnvelopeSchema,
	negative,
	ok,
	toMachineEnvelope,
	usageError,
} from "./result.ts";
import { z } from "./schema.ts";
import {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	isMatrixProgressEvent,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	noopNsCommandIo,
	noopNsProgress,
	padMatrixProgressTextEnd,
} from "./services.ts";

export const nsSdkRuntimeExports = {
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
	hiddenExecGroup,
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

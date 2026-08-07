import { truncateTextHead, truncateTextHeadTail } from "@nseng-ai/foundation/text-truncation";
import {
	normalizeTextOutput,
	stripOuterCodeFence,
	trimOuterBlankLines,
} from "@nseng-ai/foundation/text-normalization";
import { defineCommand, defineExtension, defineRawCommand } from "./command.ts";
import {
	extensionDescriptorSchema,
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	extensionPointDefinitionSchema,
	validateExtensionDescriptor,
} from "./descriptor.ts";
import { failure, negative, ok, usageError } from "./result.ts";
import { z } from "./schema.ts";
import {
	centerMatrixProgressText,
	clampMatrixProgressLabelWidthChars,
	formatActiveOperation,
	formatActiveOperationsLine,
	isMatrixProgressEvent,
	matrixProgressDisplayWidthChars,
	MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS,
	MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
	noopNsCommandIo,
	noopNsProgress,
	padMatrixProgressTextEnd,
} from "./services.ts";

export const nsSdkRuntimeExports = {
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
	formatActiveOperation,
	formatActiveOperationsLine,
	isMatrixProgressEvent,
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
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	usageError,
	validateExtensionDescriptor,
	z,
} satisfies Record<string, unknown>;

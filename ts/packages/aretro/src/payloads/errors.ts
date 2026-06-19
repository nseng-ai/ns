/**
 * Payload error types and error class.
 */

export type PayloadErrorType =
	| "payload_root_invalid"
	| "payload_session_required"
	| "payload_session_invalid"
	| "payload_directory_unsafe"
	| "payload_write_failed"
	| "payload_lookup_failed";

export class PayloadError extends Error {
	readonly errorType: PayloadErrorType;

	constructor(errorType: PayloadErrorType, message: string, cause?: unknown) {
		super(message, { cause });
		this.name = "PayloadError";
		this.errorType = errorType;
	}
}

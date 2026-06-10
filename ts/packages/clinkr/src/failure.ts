/**
 * The sole throwable in the clinkr operation contract. Handlers throw this to
 * signal the failure channel (exit 2); the dispatcher converts it to the
 * failure exit variant. Any other throw propagates raw as a crash.
 */
export class ClinkrFailure extends Error {
	errorType: string;

	constructor(options: { errorType: string; message: string }) {
		super(options.message);
		this.name = "ClinkrFailure";
		this.errorType = options.errorType;
	}
}

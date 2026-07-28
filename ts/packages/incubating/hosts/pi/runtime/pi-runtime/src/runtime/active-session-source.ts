import { SessionManager } from "@earendil-works/pi-coding-agent";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

export interface ActiveSessionSourceRequest {
	readonly sourceSessionFile: string;
	readonly sourceLeafId: string;
}

export type AuthoritativeSourceResult =
	| { readonly ok: true; readonly source: SessionManager }
	| { readonly ok: false; readonly message: string };

export function validateActiveSessionSourceRequest(
	request: ActiveSessionSourceRequest,
): string | undefined {
	if (request.sourceSessionFile.trim().length === 0) return "Source session file is required.";
	if (request.sourceLeafId.trim().length === 0) return "Source session leaf id is required.";
	return undefined;
}

export function openAuthoritativeSelectedPath(
	request: ActiveSessionSourceRequest,
): AuthoritativeSourceResult {
	try {
		const source = SessionManager.open(request.sourceSessionFile);
		if (source.getEntry(request.sourceLeafId) === undefined) {
			return {
				ok: false,
				message: `Source session leaf ${JSON.stringify(request.sourceLeafId)} does not exist.`,
			};
		}
		const selectedPath = source.getBranch(request.sourceLeafId);
		if (selectedPath.length === 0) {
			return { ok: false, message: "Source session branch is empty." };
		}
		if (selectedPath.at(-1)?.id !== request.sourceLeafId) {
			return {
				ok: false,
				message: `Source session selected path does not end at authoritative leaf ${JSON.stringify(request.sourceLeafId)}.`,
			};
		}
		return { ok: true, source };
	} catch (error: unknown) {
		return {
			ok: false,
			message: `Failed to read active Pi session source: ${formatErrorMessage(error)}`,
		};
	}
}

import type { PiSessionReader } from "@nseng-ai/extension-kit/pi-types";

export function createTestSessionReader(): PiSessionReader {
	return {
		getBranch: () => [],
		getEntries: () => [],
		getSessionId: () => "test-session",
		getLeafId: () => null,
		getSessionFile: () => undefined,
	};
}

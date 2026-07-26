import type { PiSessionReader } from "@nseng-ai/extension-kit/pi-types";

export function createTestSessionReader(): PiSessionReader {
	return {
		getBranch: () => [],
		getEntries: () => [],
		getSessionId: () => "test-session",
		getSessionFile: () => undefined,
	};
}

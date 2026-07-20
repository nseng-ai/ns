import type { PiSessionReader } from "@nseng-ai/capability-kit/pi-types";

export function createTestSessionReader(): PiSessionReader {
	return {
		getBranch: () => [],
		getEntries: () => [],
		getSessionId: () => "test-session",
		getSessionFile: () => undefined,
	};
}

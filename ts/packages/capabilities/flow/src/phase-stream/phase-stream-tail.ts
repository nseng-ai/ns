export interface TranscriptTail {
	line(): string | undefined;
	note(text: string): void;
	clear(): void;
}

export function createTranscriptTail(): TranscriptTail {
	let tail: string | undefined;
	let tailBuffer = "";

	function line(): string | undefined {
		return tail;
	}

	function note(text: string): void {
		tailBuffer += text;
		const segments = tailBuffer.split(/\r\n|\r|\n/);
		tailBuffer = segments.pop() ?? "";
		const latest = [tailBuffer, ...segments.reverse()].find((segment) => segment.trim() !== "");
		if (latest !== undefined) tail = latest.trim();
	}

	function clear(): void {
		tail = undefined;
		tailBuffer = "";
	}

	return { line, note, clear };
}

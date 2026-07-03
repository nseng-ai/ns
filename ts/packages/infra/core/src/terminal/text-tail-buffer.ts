export interface BoundedTextTailBufferOptions {
	maxBytes: number;
	/** Label used in the omission marker, for example `stderr` or `text`. */
	omissionLabel?: string;
}

export class BoundedTextTailBuffer {
	private readonly maxBytes: number;
	private readonly omissionLabel: string;
	private value = "";
	private omittedBytes = 0;

	constructor(options: BoundedTextTailBufferOptions) {
		this.maxBytes = options.maxBytes;
		this.omissionLabel = options.omissionLabel ?? "text";
	}

	append(chunk: string | Uint8Array): void {
		this.value += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		const bytes = Buffer.byteLength(this.value, "utf8");
		if (bytes <= this.maxBytes) return;

		const buffer = Buffer.from(this.value, "utf8");
		const tail = buffer.subarray(buffer.length - this.maxBytes);
		this.omittedBytes += buffer.length - tail.length;
		this.value = tail.toString("utf8");
	}

	toString(): string {
		if (this.omittedBytes === 0) return this.value;
		return `… ${this.omittedBytes} ${this.omissionLabel} byte(s) omitted\n${this.value}`;
	}
}

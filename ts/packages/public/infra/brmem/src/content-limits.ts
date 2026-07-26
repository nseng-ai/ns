export const MAX_ENTRY_BYTES = 1 << 20;
export const BINARY_SNIFF_BYTES = 8 * 1024;

export function checkEntrySize(bytes: Uint8Array): string | undefined {
	if (bytes.byteLength <= MAX_ENTRY_BYTES) return undefined;
	return `is ${formatBytes(bytes.byteLength)}; Branch Memory Entries are capped at 1 MiB`;
}

export function checkEntryNotBinary(bytes: Uint8Array): string | undefined {
	const limit = Math.min(bytes.byteLength, BINARY_SNIFF_BYTES);
	for (let index = 0; index < limit; index += 1) {
		if (bytes[index] === 0) return `appears to be binary (NUL byte at offset ${index})`;
	}
	return undefined;
}

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.floor(n / 1024)} KiB`;
	if (n < 1024 ** 3) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
	return `${(n / 1024 ** 3).toFixed(1)} GiB`;
}

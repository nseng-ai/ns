import { sha256HexPrefix } from "./sha256.ts";

export interface BoundedCommandSubjectOptions {
	maxLength: number;
	prefixLength: number;
	hashPrefixLength: number;
	formatTruncatedSubject?: (prefix: string, sha256Prefix: string) => string;
}

export interface BoundedCommandSubject {
	subject: string;
	truncated: boolean;
	originalLength: number;
	sha256Prefix: string | null;
}

export function boundedCommandSubject(
	command: string,
	options: BoundedCommandSubjectOptions,
): BoundedCommandSubject {
	if (command.length <= options.maxLength) {
		return {
			subject: command,
			truncated: false,
			originalLength: command.length,
			sha256Prefix: null,
		};
	}

	const sha256Prefix = sha256HexPrefix(command, options.hashPrefixLength);
	const prefix = command.slice(0, options.prefixLength);
	return {
		subject: options.formatTruncatedSubject?.(prefix, sha256Prefix) ?? `${prefix}…`,
		truncated: true,
		originalLength: command.length,
		sha256Prefix,
	};
}

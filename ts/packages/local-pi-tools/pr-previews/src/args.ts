export type ParsedCliCommandArgs =
	| {
			ok: true;
			args: string[];
	  }
	| {
			ok: false;
			error: string;
	  };

export function parseCliCommandArgs(rawArgs: string): ParsedCliCommandArgs {
	const args: string[] = [];
	let current = "";
	let quote: "single" | "double" | undefined;
	let escaping = false;
	let tokenStarted = false;

	for (let index = 0; index < rawArgs.length; index += 1) {
		const char = rawArgs.charAt(index);

		if (escaping) {
			current += char;
			escaping = false;
			tokenStarted = true;
			continue;
		}

		if (quote === "single") {
			if (char === "'") {
				quote = undefined;
			} else {
				current += char;
			}
			tokenStarted = true;
			continue;
		}

		if (quote === "double") {
			if (char === "\\") {
				escaping = true;
				tokenStarted = true;
				continue;
			}
			if (char === '"') {
				quote = undefined;
				tokenStarted = true;
				continue;
			}
			current += char;
			tokenStarted = true;
			continue;
		}

		if (char === "\\") {
			escaping = true;
			tokenStarted = true;
			continue;
		}
		if (char === "'") {
			quote = "single";
			tokenStarted = true;
			continue;
		}
		if (char === '"') {
			quote = "double";
			tokenStarted = true;
			continue;
		}
		if (/\s/u.test(char)) {
			if (tokenStarted) {
				args.push(current);
				current = "";
				tokenStarted = false;
			}
			continue;
		}

		current += char;
		tokenStarted = true;
	}

	if (escaping) return { ok: false, error: "Trailing backslash escape." };
	if (quote === "single") return { ok: false, error: "Unterminated single quote." };
	if (quote === "double") return { ok: false, error: "Unterminated double quote." };
	if (tokenStarted) args.push(current);

	return { ok: true, args };
}

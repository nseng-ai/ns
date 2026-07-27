interface Result {
	readonly value: string;
}

interface Caps {
	readonly canEmitAnsi: boolean;
}

function styled(result: Result): string {
	return `\u001b[1m${result.value}\u001b[0m`;
}

function plain(result: Result): string {
	return result.value;
}

export const renderer = {
// README-FENCE-6-START
renderHuman: (result, caps) =>
	caps.canEmitAnsi ? styled(result) : plain(result),
// README-FENCE-6-END
} satisfies { renderHuman: (result: Result, caps: Caps) => string };

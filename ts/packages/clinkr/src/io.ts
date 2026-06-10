export interface ClinkrIo {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export function createProcessIo(): ClinkrIo {
	return {
		stdout: (text) => {
			process.stdout.write(text);
		},
		stderr: (text) => {
			process.stderr.write(text);
		},
	};
}

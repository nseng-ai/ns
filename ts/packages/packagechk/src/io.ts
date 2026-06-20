export interface PackagechkIo {
	stdout(text: string): void;
	stderr(text: string): void;
	stdin(): Promise<string>;
}

import type { PrAddressContext } from "./context.ts";
import { buildClassificationTemplateSchemaDocument } from "./classification-schemas.ts";
import type { ClinkrExit } from "./clinkr-envelope.ts";

export interface ExecRuntimeDeps {
	context: PrAddressContext;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export interface ExecOperationInvocation {
	operation: string;
	args: readonly string[];
	deps: ExecRuntimeDeps;
}

export type ExecOperationDispatchResult =
	| { type: "fallback" }
	| { type: "exit"; exit: ClinkrExit }
	| { type: "raw-exit"; exitCode: number };

export type ExecOperationHandler = (invocation: ExecOperationInvocation) => Promise<ExecOperationDispatchResult>;

export interface ExecOperationDefinition {
	name: string;
	handler: ExecOperationHandler;
}

export interface ExecOperationRegistry {
	get(operation: string): ExecOperationDefinition | undefined;
	isTsManaged(operation: string): boolean;
}

export const LEGACY_EXEC_OPERATIONS: readonly string[] = [
	"add-issue-comment",
	"add-reaction",
	"add-review-thread-reply",
	"build-resolve-thread-batch-payload",
	"build-stack-resolve-thread-payloads",
	"classification-template",
	"finalize-run",
	"get-discussion-comments",
	"get-feedback",
	"get-pr-for-branch",
	"get-review-comments",
	"get-reviews",
	"plan-feedback",
	"prepare-run",
	"read-feedback-detail",
	"read-feedback-details",
	"record-batch-checkpoint",
	"reply-to-discussion",
	"reply-to-review",
	"resolve-thread",
	"resolve-thread-batch",
	"resolve-thread-with-reply",
	"stack-feedback-diff-current",
	"stack-feedback-plan",
	"stack-feedback-prep",
	"summarize-feedback",
	"unresolve-thread",
	"validate-feedback-classification",
];

export function createDefaultExecOperationRegistry(): ExecOperationRegistry {
	return createExecOperationRegistry([
		{
			name: "classification-template",
			handler: runClassificationTemplateSchemaOnly,
		},
	]);
}

export function createExecOperationRegistry(definitions: readonly ExecOperationDefinition[]): ExecOperationRegistry {
	const byName = new Map<string, ExecOperationDefinition>();
	for (const definition of definitions) byName.set(definition.name, definition);
	return {
		get(operation: string): ExecOperationDefinition | undefined {
			return byName.get(operation);
		},
		isTsManaged(operation: string): boolean {
			return byName.has(operation);
		},
	};
}

async function runClassificationTemplateSchemaOnly(invocation: ExecOperationInvocation): Promise<ExecOperationDispatchResult> {
	if (!hasFlag(invocation.args, "--json-schema")) return { type: "fallback" };
	invocation.deps.stdout(`${JSON.stringify(buildClassificationTemplateSchemaDocument(), null, 2)}\n`);
	return { type: "raw-exit", exitCode: 0 };
}

function hasFlag(args: readonly string[], flag: string): boolean {
	return args.includes(flag);
}

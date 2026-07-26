export type FailureCatalogEntry<Verdict, Failure, Context> = {
	message: (failure: Failure, context: Context) => string;
} & ([Verdict] extends [undefined] ? object : { verdict: Verdict });

export type FailureCatalog<Failure extends { kind: string }, Verdict, Context> = {
	[K in Failure["kind"]]: FailureCatalogEntry<Verdict, Extract<Failure, { kind: K }>, Context>;
};

export function defineFailureCatalog<Failure extends { kind: string }, Verdict, Context>() {
	return (
		catalog: FailureCatalog<Failure, Verdict, Context>,
	): FailureCatalog<Failure, Verdict, Context> => catalog;
}

export function formatFailureCatalogEntry<
	Failure extends { kind: string },
	Verdict,
	Context,
	K extends Failure["kind"],
>(
	catalog: FailureCatalog<Failure, Verdict, Context>,
	failure: Extract<Failure, { kind: K }>,
	context: Context,
): string {
	return catalog[failure.kind].message(failure, context);
}

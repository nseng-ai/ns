from clinkr import ClinkrGroup, clinkr_group


@clinkr_group(help="Manage objectives.")
def objective() -> ClinkrGroup:
    return ClinkrGroup()

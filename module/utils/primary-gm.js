// ── Primary-GM guard ────────────────────────────────────────────────────────
// With several GMs (or Assistant GMs) connected, a write nobody asked for -- tidying a board's dead
// lines, catching up a stale saved name or picture -- must run on exactly ONE client, or two GMs race
// the same write. This resolves that one GM the same way everywhere: Foundry's designated activeGM
// when present, else the first active GM user (and true when there is no active GM at all, so a lone
// client still acts).

/** The primary GM user (activeGM, else the first active GM), or null when no GM is connected. */
export function primaryGM() {
	return game.users?.activeGM ?? game.users?.find(user => user.active && user.isGM) ?? null;
}

export function isPrimaryGM() {
	const gm = primaryGM();
	return !gm || gm.id === game.user?.id;
}

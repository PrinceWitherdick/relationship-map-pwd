// The two primitives the board strip's reordering aims with.
//
// Pure and Foundry-free, and kept apart from the strip itself, because the one thing every way of
// moving a board must agree on is WHERE A DROP LANDS. A path that re-implemented the splice and the
// identity test inline would be a path a fix to `moveWithin` never reached.

/**
 * Move one element of `list` to `to`, clamped. Returns null for a no-op so an unchanged order
 * stays off the wire.
 *
 * Identity comparison is enough for the no-op test because nothing here rebuilds an element.
 */
export function moveWithin(list, from, to) {
	if (from < 0 || from >= list.length) return null;
	const next = [...list];
	const [moved] = next.splice(from, 1);
	next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
	return next.every((x, i) => x === list[i]) ? null : next;
}

/**
 * Where a drop lands: before the row it hit, or `fallback` when it named no neighbour.
 *
 * ALWAYS called against a list the dragged row has already been taken OUT of. That ordering is the
 * whole trick: aiming at the original list would count the row itself as one of the seats ahead of
 * the target, and every drop that moved a row FORWARDS would land one place short.
 */
export function insertionIndexIn(rows, beforeId, fallback) {
	if (!beforeId) return fallback;
	const i = rows.findIndex(r => r.id === beforeId);
	return i < 0 ? fallback : i;
}

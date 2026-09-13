// How big the map window opens.
//
// A fixed pixel box is either cramped on a large screen or hanging off the edge of a small one, so the
// default is a SHARE of the window the reader actually has. A share of the WIDTH alone is wrong on an
// ultrawide, where past a point the extra width is empty margin rather than more board, so the width
// is also capped against the height.
//
// Read at CONSTRUCTION, because an AppV1 Application merges `defaultOptions` per instance: the size
// follows the screen as it is now rather than as it was at page load. Only the DEFAULT is decided
// here. The window stays resizable, and a reader who wants the whole width can drag it there.

/** A share of one screen dimension, or `fallback` when there is no window to measure. */
function screenShare(available, fallback, share) {
	const measured = Number(available);
	return Number.isFinite(measured) && measured > 0
		? Math.round(measured * share)
		: fallback;
}

/**
 * @param {object}  [opts]
 * @param {number}  [opts.share]           fraction of the screen to take, both axes
 * @param {number}  [opts.maxAspect]       widest the result may be as a multiple of its height
 * @param {number}  [opts.fallbackWidth]   used when there is no window to measure (headless test)
 * @param {number}  [opts.fallbackHeight]
 * @returns {{width: number, height: number}}
 */
export function openingSize({
	share = 0.8,
	maxAspect = 1.2,
	fallbackWidth = 900,
	fallbackHeight = 800,
} = {}) {
	const height = screenShare(globalThis.window?.innerHeight, fallbackHeight, share);
	const width = screenShare(globalThis.window?.innerWidth, fallbackWidth, share);
	return { width: Math.min(width, Math.round(height * maxAspect)), height };
}

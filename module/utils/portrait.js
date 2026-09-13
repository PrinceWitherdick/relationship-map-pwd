// The picture a person on a board is drawn with, or none.
//
// Foundry hands every actor a placeholder silhouette until somebody chooses art. Drawn inside a 72px
// circle it reads as a grey blob, which says nothing; a board draws its own person glyph instead, so
// "nobody has chosen a picture yet" looks like exactly that.

/** The placeholders core ships. Matched by their path, which is what ends up on an actor. */
const PLACEHOLDERS = [
	"icons/svg/mystery-man.svg",
	"icons/svg/mystery-man-black.svg",
];

/** Is this image the placeholder, or no image at all? */
export function isDefaultImg(img) {
	const src = String(img ?? "").trim();
	if (!src) return true;
	const known = [globalThis.CONST?.DEFAULT_TOKEN, ...PLACEHOLDERS].filter(Boolean);
	return known.some(path => src === path || src.endsWith(`/${path}`));
}

/**
 * The picture to draw, as `{src, style}`. `src` is null when there is no real art, which is what a
 * template's `{{#if img}}` is asking. `style` is always empty: it is kept so a caller that places the
 * picture has one shape to read whether or not a crop ever arrives.
 */
export function portraitOrNone(img) {
	return { src: isDefaultImg(img) ? null : String(img).trim(), style: "" };
}

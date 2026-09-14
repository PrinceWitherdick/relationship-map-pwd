// The single, audited HTML escaper for this module. Pure (no Foundry, no DOM), so the modules that
// build markup as strings can be exercised by the tests. Escapes the five characters that matter in
// both element and attribute contexts.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };

/** Escape a value for safe insertion into HTML (element text or attribute value). */
export function escHtml(v) {
	return String(v ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * At most `max` UTF-16 units of `value`, never cutting a character in half.
 *
 * ⚠ WHY NOT A PLAIN `slice`. Everything past the Basic Multilingual Plane -- every emoji, for a start --
 * is TWO units, and a cut that lands between them keeps the first of the pair alone: a broken
 * character that is stored, broadcast to the table and drawn as a replacement box for good. Every
 * length rule this is used for is counted in units, so the bound is kept and only the stray half goes.
 */
export function clipText(value, max) {
	const text = String(value ?? "");
	if (!(max >= 0) || text.length <= max) return text;
	const cut = text.slice(0, max);
	return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** `value` with its last character taken off, all of it: two units where that character is two. */
export function dropLastChar(value) {
	return String(value ?? "").replace(/(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S])$/, "");
}

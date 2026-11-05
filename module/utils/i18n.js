// Thin wrappers over Foundry's i18n that degrade to the key when the table isn't
// available, so callers never have to guard `game.i18n` themselves. The unit
// tests load the real English table (tests/setup.js), so localized strings are
// exercised the way players see them — no English fallbacks duplicated in code.

/**
 * Localize a key. Returns the key unchanged when no translation is available.
 * @param {string} key
 * @returns {string}
 */
export function localize(key) {
	return globalThis.game?.i18n?.localize?.(key) ?? key;
}

/**
 * Localize a key with `{placeholder}` interpolation from `data`.
 * @param {string} key
 * @param {object} data
 * @returns {string}
 */
export function format(key, data) {
	return globalThis.game?.i18n?.format?.(key, data) ?? key;
}

/**
 * A few names in a row inside a sentence ("Elena, Marrec, Pell"), joined as the world's language
 * joins a list: Foundry's `getListFormatter` (an `Intl.ListFormat` in the table's language), short
 * and as units, which in English is the plain comma a `join(", ")` gave and in another tongue is that
 * tongue's own mark. A literal ", " inside a localized sentence was the one piece of it no translator
 * could reach. Falls back to the comma where the API is absent (a client without it, the tests).
 * @param {string[]} items
 * @returns {string}
 */
export function listOf(items) {
	const list = Array.isArray(items) ? items.map(item => String(item ?? "")) : [];
	const formatter = globalThis.game?.i18n?.getListFormatter?.({ style: "short", type: "unit" });
	return formatter?.format ? formatter.format(list) : list.join(", ");
}

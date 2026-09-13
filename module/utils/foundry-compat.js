// The four places Foundry v13 and v14 spell the same thing differently, answered once.

/** The data a drag carried, through whichever TextEditor this core exposes. */
export function getDragEventData(ev) {
	const textEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
	return textEditor?.getDragEventData?.(ev) ?? globalThis.TextEditor?.getDragEventData?.(ev);
}

/** Render a Handlebars template by path. v13 moved `renderTemplate` under `foundry.applications`. */
export function renderTemplate(path, data) {
	const handlebars = globalThis.foundry?.applications?.handlebars;
	if (typeof handlebars?.renderTemplate === "function") return handlebars.renderTemplate(path, data);
	return globalThis.renderTemplate(path, data);
}

/**
 * The `document.update()` entry that deletes `keyPath`.
 *
 * Only v14 removes a key whose update value is a fresh `ForcedDeletion` INSTANCE, and only v14 warns
 * about the older `-=` spelling. v13 exposes the same operator class, but a nested ForcedDeletion
 * passed for a key inside an object-typed flag is NOT applied there: the key silently survives. v13
 * deletes reliably through the `-=` prefix on the leaf key. So the operator is used on v14 and the
 * prefix everywhere else.
 *
 * @returns {[string, *]} a key and a value, for `Object.fromEntries` or a spread.
 */
export function deletionEntry(keyPath) {
	const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
	const generation = Number(globalThis.game?.release?.generation) || 0;
	if (ForcedDeletion && generation >= 14) return [keyPath, new ForcedDeletion()];
	const i = keyPath.lastIndexOf(".");
	return [`${keyPath.slice(0, i + 1)}-=${keyPath.slice(i + 1)}`, null];
}

/**
 * READ ONE BACK: given an update entry, the plain path it deletes, or null when it is an ordinary
 * write of a value.
 *
 * ⚠ IT LIVES BESIDE ITS MAKER because `deletionEntry` spells a deletion two ways depending on the
 * core, so anything that has to RECOGNISE one (undoing a write, which must tell a person taken off
 * the board from one who was moved) has to know both. A reader that knew only the v14 spelling would
 * read every v13 deletion as an ordinary write of `null`, and undoing it would put a `null` into the
 * document where a key used to be.
 *
 * @returns {string|null} the dotted path that entry removes, with no `-=` left on it.
 */
export function deletionTarget(keyPath, value) {
	if (typeof keyPath !== "string" || !keyPath) return null;
	const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
	if (ForcedDeletion && value instanceof ForcedDeletion) return keyPath;
	const i = keyPath.lastIndexOf(".");
	const leaf = keyPath.slice(i + 1);
	// ⚠ THE VALUE IS PART OF THE QUESTION. A person on a board could be named `-=x`; only the pairing
	// of that leaf with a `null` is the deletion this core's `deletionEntry` writes.
	if (value !== null || !leaf.startsWith("-=")) return null;
	return `${keyPath.slice(0, i + 1)}${leaf.slice(2)}`;
}

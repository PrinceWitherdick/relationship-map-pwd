// What a sidebar directory row looks like, and how to tell a world directory from a compendium's.

/** A document row in any sidebar directory, matching core's own directory partials
 *  (templates/sidebar/partials/). A copied selector that drifts does not fail loudly: it just stops
 *  matching. */
export const DIRECTORY_ROW_SELECTOR = "li.directory-item.document[data-entry-id]";

/**
 * Is this app a rendered WORLD directory for `documentName` (not a compendium's index view)?
 *
 * Duck-typed, because ApplicationV2 fires a render hook for every class in the inheritance chain, so
 * the stable hook name is the parent's (`renderDocumentDirectory`) and every sidebar tab reaches a
 * handler registered on it. `index` is what tells a CompendiumCollection from a world collection.
 */
export function isWorldDirectory(app, documentName) {
	const collection = app?.collection;
	return collection?.documentName === documentName
		&& typeof collection.get === "function"
		&& !collection.index;
}

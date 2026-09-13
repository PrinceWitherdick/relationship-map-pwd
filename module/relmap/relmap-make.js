// HOW A RELATIONSHIP MAP COMES INTO EXISTENCE, and which one "open the maps" lands on.
//
// THE FIRST MAP IS MADE WITHOUT A QUESTION. Pressing "Relationship Maps" in a world that has none IS
// the asking: the map arrives under the plain name "Relationship Map", the party seats itself on a
// board of its own as the window opens, and the map can be renamed from that window. A name box in
// front of it only stood between the table and the board they were about to start on.
//
// EVERY MAP AFTER THE FIRST IS STILL ASKED FOR BY NAME, from the chooser, because by then the name is
// what tells one map from another.

import { format, localize } from "../utils/i18n.js";
import { pickContentOption, promptForText } from "../dialogs/content-picker.js";
import {
	canCreateRelationshipMap, createRelationshipMap, listRelationshipMaps, listVisibleMapPages,
} from "./relmap-doc.js";
import { defaultBoard } from "./relmap-last.js";

/** The chooser's row for making a new map. Not an id any document can have. */
export const NEW_MAP_CHOICE = "__new__";

/** The first map's create while it is in flight, so a second press joins it instead of making another. */
let makingFirst = null;

/**
 * Make a world's first map, under the plain name, without asking anything.
 *
 * ⚠ ONE CREATE PER PRESS, HOWEVER MANY PRESSES. The name box used to stand in front of this and
 * swallow a double-click; without it, two clicks on the sidebar button inside one round trip would
 * both find no map and make two. So a press made while the create is still out gets the same promise.
 *
 * @returns {Promise<JournalEntry|null>}  the new map, or null when this reader may not make one.
 */
export function makeFirstRelationshipMap() {
	if (!canCreateRelationshipMap()) return Promise.resolve(null);
	makingFirst ??= createRelationshipMap(localize("RELMAP.untitled"))
		.finally(() => { makingFirst = null; });
	return makingFirst;
}

/**
 * Ask what the new map is called, and make it.
 *
 * ⚠ THE BOX OPENS EMPTY. The example names are the PLACEHOLDER, which is a hint about what belongs in
 * the field rather than a value that gets saved by pressing Enter.
 *
 * AN EMPTY NAME IS TAKEN, NOT REFUSED, exactly as `mapPageName` takes an empty board name: it falls
 * back to "Relationship Map", and the map can be renamed from its own window. A dialog that rejects
 * the save over a blank field has to explain itself, for a mistake that costs one rename to fix.
 *
 * @returns {Promise<JournalEntry|null>}  the new map, or null when the reader dismissed the box or
 *          may not make one.
 */
export async function promptForNewRelationshipMap() {
	// Asked BEFORE the box opens, not only inside `createRelationshipMap`, so a reader who may not
	// make a map is never asked to name one.
	if (!canCreateRelationshipMap()) return null;
	const name = await promptForText({
		title: localize("RELMAP.maps.newTitle"),
		buttonLabel: localize("RELMAP.maps.newGo"),
		placeholder: localize("RELMAP.maps.namePlaceholder"),
	});
	// null is the dismissal and "" is a name nobody typed; only the first means "never mind".
	if (name === null) return null;
	return await createRelationshipMap(name || localize("RELMAP.untitled"));
}

/**
 * Which map, and which of its boards, an open lands on: `{ entry, pageId }`, or null when the world
 * has no maps at all (the caller offers to make the first one).
 *
 * A map named by id or by name wins; anything else goes where this reader was last (relmap-last.js).
 */
export function mapToOpen(which = null, maps = listRelationshipMaps()) {
	if (which) {
		const wanted = maps.find(map => map.id === which || map.name === which);
		if (wanted) return { entry: wanted, pageId: null };
	}
	return defaultBoard(maps);
}

/**
 * Ask which map to open, or to make a new one.
 *
 * The one way to reach a second map, since maps are kept out of the Journal sidebar
 * (hooks/journal-directory-maps.js). The map the reader is already on is the row picked to begin with.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.current]  the id of the map the reader is on, if any.
 * @returns {Promise<JournalEntry|null>}  the map to open, or null when they backed out.
 */
export async function chooseRelationshipMap({ current = null } = {}) {
	const maps = listRelationshipMaps();
	const rows = maps.map(entry => ({
		id: entry.id,
		label: entry.name,
		icon: "fa-diagram-project",
		hint: format("RELMAP.maps.boardCount", { count: Math.max(1, listVisibleMapPages(entry).length) }),
	}));
	if (canCreateRelationshipMap()) {
		rows.push({
			id: NEW_MAP_CHOICE,
			label: localize("RELMAP.maps.new"),
			icon: "fa-plus",
			hint: localize("RELMAP.maps.newHint"),
		});
	}
	if (!rows.length) return null;
	const pick = await pickContentOption({
		title: localize("RELMAP.maps.chooseTitle"),
		options: rows,
		buttonLabel: localize("RELMAP.maps.chooseGo"),
		selected: current,
	});
	if (!pick) return null;
	if (pick === NEW_MAP_CHOICE) return promptForNewRelationshipMap();
	return maps.find(entry => entry.id === pick) ?? null;
}

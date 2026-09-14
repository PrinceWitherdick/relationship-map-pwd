// HOW A RELATIONSHIP MAP COMES INTO EXISTENCE, and which one "open the maps" lands on.
//
// NOTHING IS MADE FOR A WORLD UNASKED. The first time somebody opens the maps in a world that has
// none, they are asked what the first collection is called, and so is every collection after it. A
// collection arrives with no maps in it at all: every map in it is one somebody added with the "+".

import { format, localize } from "../utils/i18n.js";
import { pickContentOption, promptForText } from "../dialogs/content-picker.js";
import {
	canCreateRelationshipMap, createRelationshipMap, listRelationshipMaps, resolveMapBoard,
} from "./relmap-doc.js";
import { defaultBoard } from "./relmap-last.js";

/** The chooser's row for making a new map. Not an id any document can have. */
export const NEW_MAP_CHOICE = "__new__";

/** The name box and the create behind it while they are out, so a second press joins them. */
let asking = null;

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
 * ⚠ ONE BOX PER PRESS, HOWEVER MANY PRESSES. The box is not modal, so two clicks on the sidebar
 * button in a world with no collection yet would each open one, and each could make a collection. A
 * press made while the box is up, or while the collection it named is still being made, gets the
 * first press's answer. (Both presses then open that collection, which utils/open-or-focus.js turns
 * into one window.)
 *
 * @returns {Promise<JournalEntry|null>}  the new map, or null when the reader dismissed the box or
 *          may not make one.
 */
export function promptForNewRelationshipMap() {
	// Asked BEFORE the box opens, not only inside `createRelationshipMap`, so a reader who may not
	// make a map is never asked to name one.
	if (!canCreateRelationshipMap()) return Promise.resolve(null);
	asking ??= askForNewRelationshipMap().finally(() => { asking = null; });
	return asking;
}

/** The box itself, and the create behind it. See `promptForNewRelationshipMap`. */
async function askForNewRelationshipMap() {
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
	const rows = maps.map(entry => {
		// The maps this reader can open, and none for a collection nobody has added one to: nothing is
		// made for a collection any more. The one map with no page behind it is a version 1 board.
		// Asked of `resolveMapBoard`, the one place those shapes are told apart, rather than worked out
		// again here in an order of its own.
		const { pages, kind } = resolveMapBoard(entry);
		return {
			id: entry.id,
			label: entry.name,
			icon: "fa-diagram-project",
			hint: format("RELMAP.maps.boardCount", { count: kind === "legacy" ? 1 : pages.length }),
		};
	});
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
	// ⚠ LOOKED UP AGAIN, AND NOT IN THE LIST THE CHOOSER WAS BUILT FROM. The chooser is not modal, and a
	// collection the GM deleted while it was up is still in that list: opened from it, the window came up
	// over a deleted document, with every tool enabled and every write failing.
	return listRelationshipMaps().find(entry => entry.id === pick) ?? null;
}

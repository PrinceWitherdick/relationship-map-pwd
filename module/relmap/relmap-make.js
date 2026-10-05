// HOW A RELATIONSHIP MAP COMES INTO EXISTENCE, and which one "open the maps" lands on.
//
// NOTHING IS MADE FOR A WORLD UNASKED. The first time somebody opens the maps in a world that has
// none, they are asked what the first collection is called AND what its first map is called, in one
// window, and so is every collection after it. Both are named by the reader: nothing arrives that
// nobody asked for, and the window opens on a map rather than on an empty collection.

import { format, localize } from "../utils/i18n.js";
import { pickContentOption, promptForTexts } from "../dialogs/content-picker.js";
import {
	canCreateRelationshipMap, createMapPage, createRelationshipMap, listRelationshipMaps, resolveMapBoard,
} from "./relmap-doc.js";
import { defaultBoard } from "./relmap-last.js";

/** The chooser's row for making a new map. Not an id any document can have. */
export const NEW_MAP_CHOICE = "__new__";

/** The name box and the create behind it while they are out, so a second press joins them. */
let asking = null;

/**
 * Ask what the new collection and its first map are called, and make both.
 *
 * ⚠ ONE WINDOW, TWO NAMES (user, 2026-10-04). A collection used to be named on its own and arrive
 * empty, and the window then asked for a map's name again: in a new world that read as the first
 * answer having gone nowhere. The collection is made first and the map inside it straight after, so
 * a window opened on the result lands on that map.
 *
 * ⚠ THE BOXES OPEN EMPTY. The example names are the PLACEHOLDERS, which are a hint about what belongs
 * in each field rather than a value that gets saved by pressing Enter.
 *
 * AN EMPTY NAME IS TAKEN, NOT REFUSED, in either box: the document layer names a blank collection
 * "Relationship Map" and a blank map "New map", and both can be renamed from the window. A dialog that
 * rejects the save over a blank field has to explain itself, for a mistake that costs one rename to fix.
 *
 * ⚠ ONE BOX PER PRESS, HOWEVER MANY PRESSES. The box is not modal, so two clicks on the sidebar
 * button in a world with no collection yet would each open one, and each could make a collection. A
 * press made while the box is up, or while the collection it named is still being made, gets the
 * first press's answer. (Both presses then open that collection, which utils/open-or-focus.js turns
 * into one window.)
 *
 * @returns {Promise<JournalEntry|null>}  the new collection, or null when the reader dismissed the
 *          box or may not make one.
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
	const names = await promptForTexts({
		title: localize("RELMAP.maps.newTitle"),
		icon: "fa-solid fa-plus",
		buttonLabel: localize("RELMAP.maps.newGo"),
		lead: localize("RELMAP.maps.newLead"),
		fields: [
			{
				name: "collection",
				label: localize("RELMAP.maps.nameLabel"),
				placeholder: localize("RELMAP.maps.namePlaceholder"),
			},
			{
				name: "map",
				label: localize("RELMAP.pages.firstLabel"),
				placeholder: localize("RELMAP.pages.placeholder"),
			},
		],
	});
	// null is the dismissal and "" is a name nobody typed; only the first means "never mind". A blank
	// is named by the document layer, through the same rule a rename keeps.
	if (!names) return null;
	const entry = await createRelationshipMap(names.collection);
	if (!entry) return null;
	// ⚠ THE COLLECTION STANDS EITHER WAY. If its first map cannot be made, refused or thrown, the reader
	// is told so and the window still opens on the empty collection, where New map tries again. A throw
	// let through here would leave the collection made and no window to find it in.
	let page = null;
	try {
		page = await createMapPage(entry, names.map);
	} catch (err) {
		console.error("Relationship Map | the first map of a new collection could not be made", err);
	}
	if (!page) ui.notifications?.warn?.(localize("RELMAP.pages.firstFailed"));
	return entry;
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
		icon: "fa-solid fa-diagram-project",
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

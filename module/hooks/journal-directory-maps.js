import { MODULE_ID } from "../module-id.js";
import { RELMAP_FLAG } from "../relmap/relmap-store.js";
import { RELMAP_FOLDER_NAME } from "../relmap/relmap-doc.js";
import { localize } from "../utils/i18n.js";
import { DIRECTORY_ROW_SELECTOR, isWorldDirectory } from "./directory-rows.js";

/**
 * KEEP THE RELATIONSHIP MAPS OUT OF THE JOURNAL SIDEBAR, AND PUT A WAY IN WHERE THEY WOULD HAVE BEEN.
 *
 * A map is a JournalEntry and has to be one: writing a world setting needs SETTINGS_MODIFY, which is
 * an assistant-GM right, so a map kept in a setting is a map no player can draw on, while a document
 * the whole table OWNS is one anybody may edit, with the server broadcasting each change for free.
 * The long version of that argument is at the top of relmap/relmap-doc.js.
 *
 * WHAT DOES NOT FOLLOW is that the storage has to be furniture in the Journal tab. A map is not read
 * as a journal entry by anyone, so its rows are taken out of the render, and nothing about the
 * document changes: ownership, editing, broadcast, `@UUID` links, the sheet class and the folder are
 * all exactly as they were. That is also why this is a render hook and not an ownership change:
 * hiding by permission would take the map away from the players who are meant to be drawing on it.
 *
 * ⚠ AND IT IS A SCREEN, NOT A VAULT. Foundry ships every world JournalEntry to every client; this
 * hides what is DRAWN.
 *
 * In their place the directory gets one button, "Relationship Maps", which opens the board this
 * reader was last on (or offers to make the first map). Renaming, deleting and switching maps are on
 * the map window itself.
 */

/** Row selectors, matching core's own directory partials (templates/sidebar/partials/). */
const ENTRY_ROW = DIRECTORY_ROW_SELECTOR;
const FOLDER_ROW = "li.directory-item.folder[data-folder-id]";

/** Is this app a rendered WORLD Journal directory (not a compendium's index view)? */
export function isJournalDirectory(app) {
	return isWorldDirectory(app, "JournalEntry");
}

/** Is this entry one of our relationship maps? By the flag, never by the name or the folder: the
 * flag is what `listRelationshipMaps` goes by, and a GM is free to rename either. */
export function isRelationshipMapEntry(doc) {
	return !!doc?.getFlag?.(MODULE_ID, RELMAP_FLAG);
}

/**
 * Should this folder go too?
 *
 * ONLY WHEN NOTHING ELSE IS IN IT. A GM who files a page of prose beside their maps has made the
 * folder theirs, and a folder that vanished with their notes inside it would be this module hiding
 * somebody else's work. So: no subfolders, and every entry in it a map.
 *
 * ⚠ AN EMPTY ONE GOES ONLY IF IT IS STILL CALLED WHAT WE CALLED IT. An empty folder somebody renamed
 * is a folder they are using for something.
 */
export function isRelationshipMapFolder(folder) {
	if (!folder) return false;
	if (folder.getSubfolders?.(false)?.length ?? folder.children?.length) return false;
	const contents = folder.contents ?? [];
	if (!contents.length) return folder.name === RELMAP_FOLDER_NAME;
	return contents.every(isRelationshipMapEntry);
}

/**
 * Take the map rows out of one rendered Journal directory.
 *
 * REMOVED RATHER THAN HIDDEN, because core's search filter works by setting `hidden` on rows and
 * clearing it again on the next keystroke, so a row we merely hid would come back the moment anybody
 * typed in the search box.
 *
 * @param {Application} app
 * @param {HTMLElement|jQuery} element
 */
export function hideRelationshipMapRows(app, element) {
	if (!isJournalDirectory(app)) return;
	const root = element?.jquery ? element[0] : element;
	if (!root?.querySelectorAll) return;

	for (const li of root.querySelectorAll(ENTRY_ROW)) {
		if (isRelationshipMapEntry(app.collection.get(li.dataset.entryId))) li.remove();
	}
	// ⚠ THE FOLDERS AFTER THE ENTRIES, and the question is asked of the DOCUMENT, not of what is left
	// standing in the list: "is this folder row empty now" is also true of a folder the GM collapsed.
	for (const li of root.querySelectorAll(FOLDER_ROW)) {
		if (isRelationshipMapFolder(game.folders?.get(li.dataset.folderId))) li.remove();
	}
}

/**
 * Put the "Relationship Maps" button into one rendered Journal directory, under core's own create
 * buttons.
 *
 * A ROW OF ITS OWN rather than a third button squeezed into core's row: that row is sized for two, and
 * a third would cut every label short. Written once per render and never twice, since a directory
 * re-renders on every change to any journal entry.
 *
 * @param {Application} app
 * @param {HTMLElement|jQuery} element
 * @param {Function} onOpen  what a press does.
 */
export function addOpenMapsButton(app, element, onOpen) {
	if (!isJournalDirectory(app)) return;
	const root = element?.jquery ? element[0] : element;
	const header = root?.querySelector?.(".directory-header");
	if (!header || header.querySelector("[data-relmap-open-maps]")) return;

	const row = document.createElement("div");
	row.className = "header-actions action-buttons flexrow relmap-directory-actions";
	const button = document.createElement("button");
	button.type = "button";
	button.dataset.relmapOpenMaps = "";
	const icon = document.createElement("i");
	icon.className = "fa-solid fa-diagram-project";
	icon.setAttribute("inert", "");
	const label = document.createElement("span");
	label.textContent = localize("RELMAP.directory.open");
	button.append(icon, label);
	button.addEventListener("click", ev => {
		ev.preventDefault();
		onOpen?.();
	});
	row.append(button);

	const actions = header.querySelector(".header-actions");
	if (actions) actions.after(row);
	else header.prepend(row);
}

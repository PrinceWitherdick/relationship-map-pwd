// Relationship Map - by PWD
//
// A shared board of who knows whom: portraits joined by curved, labelled, coloured lines, one map per
// JournalEntry and one named board per page, that every player at the table can draw on.
//
// Everything this file does is wiring. The maps live in module/relmap/, the window in
// module/dialogs/RelationshipMapWindow.js, and the stylesheet in styles/relationship-map.css.

import { MODULE_ID } from "./module/module-id.js";
import { registerSettings } from "./module/settings.js";
import { createRelationshipMapEntrySheetClass } from "./module/journal/RelationshipMapEntrySheet.js";
import { RELMAP_SHEET_CLASS, canCreateRelationshipMap, getRelationshipMap } from "./module/relmap/relmap-doc.js";
import { chooseRelationshipMap, mapToOpen, promptForNewRelationshipMap } from "./module/relmap/relmap-make.js";
import { openRelationshipMap } from "./module/dialogs/RelationshipMapWindow.js";
import { addOpenMapsButton, hideRelationshipMapRows } from "./module/hooks/journal-directory-maps.js";
import { installThemeFollower, refreshOpenWindows } from "./module/utils/window-theme.js";
import { installWindowRestore } from "./module/utils/window-restore.js";
import { localize } from "./module/utils/i18n.js";

/** The templates the window renders, fetched once at init rather than on the first open. */
const TEMPLATES = [
	"modules/relationship-map-pwd/templates/dialogs/relationship-map.hbs",
	"modules/relationship-map-pwd/templates/dialogs/partials/relationship-map-board.hbs",
	"modules/relationship-map-pwd/templates/dialogs/person-picker.hbs",
];

/**
 * Open the maps: a named map where one is asked for, otherwise the board this reader was last on, and
 * in a world with no maps yet, the question of what the first one is called.
 *
 * @param {string|null} [which]  a map's id or name.
 * @returns {Promise<Application|null>}
 */
async function openMaps(which = null) {
	const landing = mapToOpen(which);
	if (landing) {
		return openRelationshipMap(landing.entry, landing.pageId ? { pageId: landing.pageId } : {});
	}
	if (!canCreateRelationshipMap()) {
		ui.notifications?.info?.(localize("RELMAP.maps.cannotCreate"));
		return null;
	}
	const made = await promptForNewRelationshipMap();
	return made ? openRelationshipMap(made) : null;
}

Hooks.once("init", () => {
	registerSettings({ onHighContrast: () => refreshOpenWindows() });
	installThemeFollower();

	// THE SHEET A MAP'S JOURNAL ENTRY OPENS AS: a bouncer that opens the board instead of a blank
	// prose sheet. `makeDefault: false`, because core clears every other sheet's default for the type
	// when a new default is registered, so `true` here would hijack every journal in the world.
	const JournalSheetV1 = foundry.appv1?.sheets?.JournalSheet ?? globalThis.JournalSheet;
	const RelationshipMapSheet = createRelationshipMapEntrySheetClass(JournalSheetV1);
	const sheets = foundry.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
	sheets.registerSheet(JournalEntry, MODULE_ID, RelationshipMapSheet, {
		types: ["base"],
		makeDefault: false,
		label: "RELMAP.sheetLabel",
	});
	// Every map stores this registration id in `flags.core.sheetClass`. If a rename ever splits the two,
	// those entries fall back to the generic sheet with no error anywhere, so they are checked here.
	if (RELMAP_SHEET_CLASS !== `${MODULE_ID}.${RelationshipMapSheet.name}`) {
		console.error("Relationship Map | the map sheet id does not match RELMAP_SHEET_CLASS");
	}

	const loadTemplates = foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
	loadTemplates?.(TEMPLATES);

	installWindowRestore((entry, options) => (
		getRelationshipMap(entry?.id) ? openRelationshipMap(entry, options) : null
	));

	// The maps are taken out of the Journal sidebar, and one button put in their place.
	Hooks.on("renderDocumentDirectory", (app, element) => {
		hideRelationshipMapRows(app, element);
		addOpenMapsButton(app, element, () => openMaps());
	});
});

Hooks.once("ready", () => {
	// For macros and other modules:
	//   game.modules.get("relationship-map-pwd").api.open()            the board you were last on
	//   game.modules.get("relationship-map-pwd").api.open("The Court")  a map by name or id
	//   game.modules.get("relationship-map-pwd").api.choose()          pick a map from a list
	const api = {
		open: which => openMaps(which ?? null),
		choose: async () => {
			const chosen = await chooseRelationshipMap();
			return chosen ? openRelationshipMap(chosen) : null;
		},
	};
	const module = game.modules.get(MODULE_ID);
	if (module) module.api = api;
});

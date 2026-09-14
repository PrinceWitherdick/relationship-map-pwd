// Where a relationship map LIVES: one JournalEntry per map, in a folder of its own.
//
// WHY A JOURNAL ENTRY AND NOT A WORLD SETTING. A map cannot be a world setting, because every player
// at the table edits these. `Setting.canUserCreate` requires
// SETTINGS_MODIFY, which is an assistant-GM right, so a player writing a world setting is refused
// by the server no matter what the window lets them click. A document they OWN is different:
// JournalEntry inherits `update: "OWNER"` from the base document, so an entry whose default
// ownership is OWNER can be written by anybody at the table — and the server broadcasts the change
// to every other client for free, which is the whole live-repaint story with no socket of ours.
//
// THE ONE ASYMMETRY, and it is a real one: CREATING a JournalEntry needs JOURNAL_CREATE, which is
// TRUSTED by default. So a plain player can edit every map in the world and cannot make a new one.
// That is gated honestly (`canCreateRelationshipMap`) rather than papered over by quietly widening
// the permission — journal creation reaches far beyond this feature, and a module that grants it
// behind the GM's back to ship a mind map has overstepped.
//
// ── AND WHY EACH BOARD IS A PAGE ────────────────────────────────────────────────────────────────
//
// One map is several NAMED BOARDS, and each board is a JournalEntryPage of that entry carrying its
// own graph. A page is its own board outright: its own people, its own lines, its own layout. The
// same person may sit on two pages at once, in different places, with different lines drawn to
// them, because "the family at home" and "who owes the smith money" are different pictures and
// forcing them onto one sheet is how a board gets too crowded to read.
//
// PAGES ARE WHERE THE ASYMMETRY ABOVE STOPS. `BaseJournalEntryPage.metadata.permissions` is
// `{create: "OWNER", delete: "OWNER"}` and update inherits "OWNER" from the base document; a page's
// own ownership is INHERIT, so `getUserLevel` defers to the entry, and the entry is owned by the
// whole table. The server tests exactly that (`canUserModify(user, "create")` on the page, with its
// parent set) — so a plain PLAYER who cannot make a new map can add, rename and delete the pages of
// every map they already have. That is not a workaround; it is the reason to store a board this way
// rather than as another object inside the entry's own flag.
//
// WHAT ELSE COMES FREE with a real document, and would otherwise have had to be built: a name that
// core validates and the sidebar search can find, a `sort` that orders the strip, a delete that is
// a delete rather than a nested `-=` inside an object-typed flag (which the two live cores disagree
// about — see utils/foundry-compat.js), and a change broadcast per board, so a table working on
// two pages at once is not repainting each other's.

import { MODULE_ID } from "../module-id.js";
import { localize } from "../utils/i18n.js";
import { clipText } from "../utils/strings.js";
import { deletionEntry } from "../utils/foundry-compat.js";
import { moveWithin, insertionIndexIn } from "../utils/list-reorder.js";
import {
	RELMAP_FLAG, RELMAP_VERSION, emptyGraph, normalizeGraph, relmapPath,
} from "./relmap-store.js";

/** The folder every map is filed under, in a colour of its own so it is easy to find. */
export const RELMAP_FOLDER_NAME = "Relationship Maps";
export const RELMAP_FOLDER_COLOR = "#7E6BA8";

/** The registered sheet id stamped onto every map so the sidebar opens the board and not a blank
 * prose entry. Kept beside the creator that writes it; the registration reads the same constant. */
export const RELMAP_SHEET_CLASS = `${MODULE_ID}.RelationshipMapSheet`;

/**
 * The maps folder if this world has one, or null.
 *
 * READ-ONLY, and separate from `ensure`, because a player
 * opening a map must never conjure a folder just by asking. `Folder.canUserCreate` is role-gated
 * on its own, so for most of the table the create would fail anyway, noisily, in the middle of
 * something else.
 */
export function findRelationshipMapFolder() {
	return (game.folders?.contents ?? [])
		.find(f => f.type === "JournalEntry" && f.name === RELMAP_FOLDER_NAME) ?? null;
}

/**
 * Find or create the maps folder.
 *
 * Returns null rather than throwing when this user may not create folders, so the caller can file
 * the map at the root instead. A map in the wrong place is a tidiness problem; a thrown error in
 * the middle of "add a map" is a broken button.
 */
export async function ensureRelationshipMapFolder() {
	const existing = findRelationshipMapFolder();
	if (existing) return existing;
	if (!globalThis.Folder?.canUserCreate?.(game.user)) return null;
	return await Folder.create({
		name: RELMAP_FOLDER_NAME, type: "JournalEntry", color: RELMAP_FOLDER_COLOR,
	}) ?? null;
}

/**
 * Every relationship map in this world.
 *
 * Found by the FLAG, not by folder membership. A GM who drags a map into another folder, or renames
 * the folder, or files it beside the front it belongs to, has not stopped it being a map — and a
 * lookup that went by folder would quietly lose it. The folder is filing, the flag is identity.
 */
export function listRelationshipMaps() {
	return (game.journal?.contents ?? [])
		.filter(entry => !!entry.getFlag?.(MODULE_ID, RELMAP_FLAG))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Is there a map in this world at all?
 *
 * Separate from {@link listRelationshipMaps} because a caller that only wants the yes/no can be on a
 * render path, and the list pays a full walk of the journal plus a `localeCompare` sort to
 * answer a question the first hit settles.
 */
export function hasRelationshipMap() {
	return (game.journal?.contents ?? []).some(entry => !!entry.getFlag?.(MODULE_ID, RELMAP_FLAG));
}

/** One map by id, or null when it is not one of ours. */
export function getRelationshipMap(id) {
	const entry = game.journal?.get?.(id) ?? null;
	return entry?.getFlag?.(MODULE_ID, RELMAP_FLAG) ? entry : null;
}

/** May this user make a new map? Editing needs only OWNER; creating needs TRUSTED. */
export function canCreateRelationshipMap() {
	// Through globalThis, because these document classes are globals that may simply not be there:
	// this is read while a sheet builds its context, which happens on clients and in suites where
	// the world is only half up, and a bare reference throws a ReferenceError rather than answering
	// no. Nobody can create a map before JournalEntry exists, so absent means false.
	return !!globalThis.JournalEntry?.canUserCreate?.(game.user);
}

/**
 * May this user change THIS map, or THIS board of it? The question every control is gated on.
 *
 * ⚠ TAKES EITHER DOCUMENT, the way `readGraph` does and for a related reason. Asked of the ENTRY it
 * means "may I add and remove BOARDS", which is what the page strip's tools need; asked of a PAGE it
 * means "may I put people on THIS board", which is what everything on the board itself needs. They
 * are not the same question now that a board carries its own ownership, and the server answers the
 * second one: an update to a page is checked against the PAGE. A shown board inherits the map's
 * ownership, so on the ordinary map the two agree and every player who can see a board can edit it.
 * They part company the moment a GM reaches for core's own ownership dialog on a page, and a window
 * that asked only the entry would then offer a player every tool over a board whose every write the
 * server refuses.
 */
export function canEditRelationshipMap(doc) {
	return !!doc?.isOwner;
}

/**
 * Make a new collection, owned by everybody, with no maps in it.
 *
 * ONE create call carrying all four things: the mark that makes it a collection, the ownership that
 * lets the table edit it, the sheet class that makes a link to it open the window, and the folder.
 * Written together because a collection that arrives without any one of them is subtly broken in a
 * way nobody notices until a player tries to move a portrait.
 *
 * ⚠ AND NO PAGE. A collection used to arrive with an empty board named after itself, and then grew
 * "The Party" in front of it on the first open: two tabs nobody had asked for, one of them empty.
 * Every map in a collection is now one somebody added, and the window says so while there are none.
 * `hasLegacyBoard` is how a collection with no maps in it is told from a version 1 map.
 */
export async function createRelationshipMap(name) {
	if (!canCreateRelationshipMap()) return null;
	const folder = await ensureRelationshipMapFolder();
	return await globalThis.JournalEntry.create({
		// THROUGH THE RULE A RENAME KEEPS, so a collection is born with a name it could have been renamed
		// to: trimmed, never blank, and no longer than `RELMAP_MAP_NAME_MAX`. Stored whole, a pasted
		// paragraph stayed a paragraph until somebody opened the rename box and saved it untouched, which
		// cut it short and announced a rename nobody had made.
		name: relationshipMapName(name),
		folder: folder?.id ?? null,
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
		flags: {
			core: { sheetClass: RELMAP_SHEET_CLASS },
			// The MARK, not a graph: on the entry this flag says only "this is a map". See
			// RELMAP_FLAG in relmap-store.js, which is the one place the two meanings are written
			// down together.
			[MODULE_ID]: { [RELMAP_FLAG]: { version: RELMAP_VERSION } },
		},
	}) ?? null;
}

/**
 * The longest a MAP may be named.
 *
 * Its own bound rather than the pages' (`RELMAP_PAGE_NAME_MAX`), because the two names are read in
 * different places and cut for different reasons: a board's name is a TAB in a strip that has to
 * hold several across one window, while a map's is a window title with a whole title bar to itself.
 * Trimmed on the way in rather than refused, as every name in this feature is: silently losing the
 * tail of a name is kinder than rejecting somebody's save.
 */
export const RELMAP_MAP_NAME_MAX = 60;

/** A map's name, made safe to store: trimmed, shortened, and never blank, since core's `name` field
 * refuses an empty one outright and would throw rather than answer. */
export function relationshipMapName(raw) {
	const want = clipText(String(raw ?? "").trim(), RELMAP_MAP_NAME_MAX).trim();
	return want || localize("RELMAP.untitled");
}

/**
 * Rename a whole map.
 *
 * Gated on OWNER like every other write here, so the table can rename the map they all draw on.
 * Nothing is written for a name that came back the same, so a reader who opens the box and saves
 * without typing does not broadcast a change to everybody — the rule `renameMapPage` keeps.
 *
 * ⚠ THIS AND THE DELETE BELOW ARE HERE BECAUSE THE SIDEBAR NO LONGER OFFERS THEM. Map rows are
 * taken out of the Journal directory (hooks/journal-directory-maps.js), and renaming or deleting a
 * whole map was the one thing that list was still good for; without these two the map window would
 * be a window onto a document with no way left to name or be rid of it.
 */
export async function renameRelationshipMap(entry, name) {
	if (!entry || !canEditRelationshipMap(entry)) return false;
	const want = relationshipMapName(name);
	if (want === entry.name) return false;
	await entry.update({ name: want });
	return true;
}

/**
 * May this reader rub out a whole map?
 *
 * ⚠ A GM ALONE, AND THAT IS STRICTER THAN THE SERVER. A map is owned by the whole table so that
 * anybody may draw on it, and core's own rule for deleting a JournalEntry is that same OWNER — so
 * the server would take this delete from any player at the table. That is a fine rule for a
 * document one person made and a poor one for the shared board everybody has been drawing on all
 * campaign: one mis-aimed click by anybody, and the map every other player is looking at is gone.
 * The same asymmetry the eye keeps (`canHideMapPages`), for the same reason.
 */
export function canDeleteRelationshipMap(entry) {
	return !!entry && !!game?.user?.isGM;
}

/** Rub out a whole map, boards and all. The caller confirms with the reader; this is the rule
 * underneath that, because the confirm dialog is UI and this is not. */
export async function deleteRelationshipMap(entry) {
	if (!canDeleteRelationshipMap(entry)) return false;
	await entry.delete();
	return true;
}

// ── The pages a map is made of ──────────────────────────────────────────────────────────────────

/**
 * The longest a page may be named.
 *
 * Core would take very much more — `name` is a plain StringField — but the strip these are drawn
 * in is one row of tabs across the top of a board, and one page called after a paragraph pushes
 * every other page off the end of it. Trimmed on the way in rather than refused, exactly as a
 * link's caption is: silently losing the tail of a name is kinder than rejecting the save.
 */
export const RELMAP_PAGE_NAME_MAX = 40;

/**
 * The gap left between one page's `sort` and the next.
 *
 * Core's own spacing for sortable documents, and the reason to leave a gap at all is that a page
 * dropped between two others wants a number to land on without renumbering the strip.
 */
const PAGE_SORT_STEP = 100000;

/** Is this page one of ours, rather than a prose page somebody filed on the same entry? */
export function isMapPage(page) {
	return !!page?.getFlag?.(MODULE_ID, RELMAP_FLAG);
}

/**
 * A map's boards, in the order the strip draws them.
 *
 * BY THE FLAG, for the reason `listRelationshipMaps` goes by the flag: a GM is perfectly entitled
 * to file a page of ordinary prose on a map — notes about the town, a scrap of read-aloud — and
 * a strip that drew a tab for it would offer a board that is not one. What makes a page a board is
 * carrying a graph.
 *
 * SORTED BY `sort` AND THEN BY NAME. The tie-break is not decoration: `sort` is only unique because
 * this file keeps it so, and two pages created in the same second by two people at opposite ends of
 * the table can land on the same number. Object order would then differ per client, and the two
 * readers would be looking at strips in different orders while talking to each other about "the
 * third tab".
 */
export function listMapPages(entry) {
	return (entry?.pages?.contents ?? [])
		.filter(isMapPage)
		.sort((a, b) => ((Number(a.sort) || 0) - (Number(b.sort) || 0))
			|| String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

// ── Which boards the players may look at ────────────────────────────────────────────────────────
//
// A board is hidden or shown one page at a time, and it is CORE'S OWN OWNERSHIP that says which,
// rather than a flag of ours. A flag would have been a line shorter and wrong in three ways: the
// server enforces ownership and refuses a hidden board's write outright, where a flag only asks our
// own window nicely; core's journal sheet, its search and its content links all already read
// ownership, so a page our board called hidden would still turn up in the sidebar under a flag; and
// a GM who reaches for the ownership dialog on a page is entitled to have it mean what it says.
//
// HIDDEN IS `default: NONE`, AND SHOWN IS `default: INHERIT`. Shown is not OBSERVER: the map entry
// is owned by everybody at the table (see `createRelationshipMap`), and a board that inherits that
// is a board the players may EDIT, which is most of the point of a map they share. A flat OBSERVER
// would have quietly turned every board the GM revealed read-only.
//
// ⚠ THE MAKER KEEPS THEIR OWN BOARD, and it costs us nothing to arrange: core's server writes
// `ownership[creator] = OWNER` into every document as it is created, whatever the default beside it
// says. So a player pressing "+" on a map they may edit gets a board they can still see, hidden
// from the rest of the table until the GM shows it. Without that, a new page would vanish the
// instant it was made, which is the shape this defaulting would otherwise have taken for everybody
// but the GM.
//
// ⚠ AND IT IS UI-LEVEL HIDING, stated honestly here rather than discovered later. Foundry ships
// every world JournalEntry to every client in full, pages and all, and gates only what is DRAWN, so
// a determined player at a console can read a hidden board. That is true of every hidden thing in
// Foundry and is not something a system can fix from this side. It is a screen, not a vault.

/** Core's ownership numbers, with the literals behind them. Read through a function rather than
 * held at module scope because this module is loaded by suites where `CONST` is not up yet, and a
 * bare reference there throws a ReferenceError rather than answering. */
function ownershipLevels() {
	return globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS
		?? { INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };
}

/**
 * Is this board hidden from the players?
 *
 * ⚠ READ OFF THE RECORDED OWNERSHIP AND NOT THROUGH `testUserPermission`, because the only reader
 * ever asked this is a GM, and a GM tests as OWNER over everything in the world. Asked the
 * permission question instead, the eye would report every board visible and the GM would have no
 * way at all to tell which ones the table can actually see.
 */
export function isMapPageHidden(page) {
	const levels = ownershipLevels();
	return (page?.ownership?.default ?? levels.INHERIT) === levels.NONE;
}

/**
 * May THIS reader look at this board?
 *
 * Fails open for a document that cannot answer: a map still on version 1 is the ENTRY itself, whose
 * own ownership has already been tested by everything that got this far.
 */
export function canSeeMapPage(page, user = undefined) {
	return page?.testUserPermission?.(user ?? game?.user, "OBSERVER") ?? true;
}

/**
 * The boards this reader may look at, in strip order.
 *
 * ⚠ THIS AND `listMapPages` ARE NOT INTERCHANGEABLE, and the split is the load-bearing part of the
 * whole feature. Everything a reader SEES goes through this one; everything the document layer
 * REASONS about goes through the raw one. `resolveMapBoard` asks both, because through this one
 * alone a collection whose every map is hidden from the reader and a collection with no maps in it
 * at all look exactly the same.
 */
export function listVisibleMapPages(entry) {
	return listMapPages(entry).filter(page => canSeeMapPage(page));
}

/** May this user hide and show boards? Only a GM. Core's own sanitizer refuses an `ownership`
 * change from anybody else outright, so the button offered to a player would be a button that
 * throws on the server; and it is the right rule on its own terms besides. */
export function canHideMapPages() {
	return !!game?.user?.isGM;
}

/**
 * Hide this board from the players, or show it to them.
 *
 * Writes nothing when the board is already the way it is being asked for, so a GM pressing the eye
 * twice does not broadcast the same state to the whole table twice over.
 *
 * ⚠ THE OBJECT AND NOT A DOTTED KEY. `ownership` is an ObjectField, whose update merges rather than
 * replaces, so this changes `default` and leaves every per-user grant beside it standing. Which
 * matters most for the grant core wrote itself: the player who made the board keeps it.
 */
export async function setMapPageHidden(page, hidden) {
	if (!page || !canHideMapPages()) return false;
	if (isMapPageHidden(page) === !!hidden) return false;
	const levels = ownershipLevels();
	await page.update({ ownership: { default: hidden ? levels.NONE : levels.INHERIT } });
	return true;
}

/** One page of a map by id, or null when it is not a board of this map, or not one this reader may
 * look at. Never falls back to another page: a caller asking for a named page and being handed a
 * different one silently is how a write meant for one board lands on another. */
export function getMapPage(entry, pageId) {
	return listVisibleMapPages(entry).find(page => page.id === pageId) ?? null;
}

/**
 * Does this map still carry its board ON THE ENTRY, from before boards were pages?
 *
 * The one way to tell a version 1 map, whose whole board is the entry's own flag and is perfectly
 * readable and editable, from a collection that simply has no maps in it yet. Neither has a page;
 * only the first has anything on the entry to draw on or to carry onto a page (`ensureFirstMapPage`).
 * A collection made since is marked `{ version }` alone.
 */
export function hasLegacyBoard(entry) {
	const flag = entry?.getFlag?.(MODULE_ID, RELMAP_FLAG);
	return !!flag && typeof flag === "object" && (flag.nodes != null || flag.edges != null);
}

/**
 * WHAT A READER IS STANDING ON IN ONE COLLECTION, and the one place its four shapes are told apart.
 *
 * `{ pages, page, doc, kind }`: the maps this reader may look at, the one they are on, the document
 * that board is read from and written to, and which shape this is --
 *
 *  • "page": an ordinary map. `doc` is its page.
 *  • "legacy": a map still on version 1, whose whole board is the entry's own flag and is perfectly
 *    readable and editable. `doc` is the ENTRY, and the flag is the same shape there, so the legacy
 *    board needs no second code path anywhere.
 *  • "unshared": the collection has maps and none of them is this reader's to see. `doc` is null.
 *  • "none": the collection has no maps in it at all. `doc` is null.
 *
 * Falls back to the first page when the id names nothing, which is the honest answer to a page
 * being deleted at the far end of the table while this reader was looking at it.
 *
 * ⚠ AND ONLY EVER TO A BOARD THIS READER MAY LOOK AT. It is the reader's handle, so it walks the
 * visible strip: a player whose GM has just hidden the board under them falls through to the next
 * one they can see, exactly as they would if it had been deleted, rather than to a board that is
 * not theirs to read.
 *
 * ⚠ NULL WHERE THERE IS NO BOARD, AND NEVER THE ENTRY. On anything but a version 1 map the entry's
 * flag is only the mark that says it is a collection, and a board resolving to it is a board every
 * write in the window lands on: a portrait nudged a moment before the last map was rubbed out would
 * be written into the mark, and the collection would open next time as a version 1 map with a
 * nameless face on it. With nothing to resolve to, a write has nowhere to go.
 *
 * ONE WALK OF THE STRIP. This is what every read and every write in the window goes through, so it
 * is asked several times per render and again on every repaint; the entry's own flag is only read
 * for a reader with no page at all.
 */
export function resolveMapBoard(entry, pageId = null) {
	const all = listMapPages(entry);
	const pages = all.filter(page => canSeeMapPage(page));
	const page = pages.find(one => one.id === pageId) ?? pages[0] ?? null;
	if (page) return { pages, page, doc: page, kind: "page" };
	if (all.length) return { pages, page: null, doc: null, kind: "unshared" };
	if (hasLegacyBoard(entry)) return { pages, page: null, doc: entry, kind: "legacy" };
	return { pages, page: null, doc: null, kind: "none" };
}

/** A page's name, made safe to store: trimmed, shortened, and never blank — core's `name` field
 * refuses a blank one outright, so a caller handing us an empty string would throw rather than
 * being told no. */
export function mapPageName(raw) {
	const want = clipText(String(raw ?? "").trim(), RELMAP_PAGE_NAME_MAX).trim();
	return want || localize("RELMAP.pages.untitled");
}

/** What one page is created from. `text` because a page must be SOME core type and this is the
 * only one that needs nothing else to be valid; nobody ever renders it as prose, since the entry's
 * sheet class bounces every click straight to the board (journal/RelationshipMapEntrySheet.js).
 *
 * `marks` IS TAKEN HERE rather than merged by the caller, and that is not tidiness. A caller that
 * spells its own `flags` out overwrites this whole object, so it has to restate the graph as well
 * as its mark -- and `createPartyPage`, which did, was building the seeded graph twice over with
 * only the second copy surviving. One place builds the scope's object; a caller says what to put
 * beside the board in it.
 *
 * ⚠ A NEW BOARD IS BORN HIDDEN FROM THE PLAYERS, and this is the one place that is decided. What a
 * board is FOR is a picture the GM is still working out: who the party has not met yet, who is
 * lying to whom, who answers to something the players have not found yet. A board that arrived
 * shared would show all of that the moment it had a single face on it, which is the wrong way round
 * for the one control this feature adds. So every board starts as the GM's own and is shown with
 * the eye when it is ready. See the ownership section above, including why the maker keeps theirs.
 *
 * `shown: true` is for the one board that is not new: the version 1 conversion, which is moving a
 * board the table could already see and must not take it away from them. */
function mapPageData(name, graph, sort, marks = {}, { shown = false } = {}) {
	const levels = ownershipLevels();
	// ⚠ THE MAKER'S OWN GRANT IS WRITTEN HERE and not left to the server. Core's `_preCreate` adds
	// `ownership[creator] = OWNER` to a document it is handed on its own, which covers the "+" on an
	// open map; it does NOT reach a page created INSIDE its parent's create, which is how a map's
	// first board arrives (`createRelationshipMap`). Left to core, a trusted player making a map
	// would be handed one whose only board they cannot see. Spelt for every page rather than only
	// that one, so the two creation paths land on the same document. Core's sanitizer allows a
	// non-GM to set their OWN key at creation time, and only their own.
	const mine = game?.user?.id;
	return {
		name: mapPageName(name),
		type: "text",
		sort,
		ownership: {
			default: shown ? levels.INHERIT : levels.NONE,
			...(mine ? { [mine]: levels.OWNER } : {}),
		},
		flags: { [MODULE_ID]: { [RELMAP_FLAG]: graph, ...marks } },
	};
}

/**
 * Give a map its first page if it has none, moving whatever the entry was carrying onto it.
 *
 * THIS IS THE WHOLE OF THE VERSION 1 STORY, and it is deliberately not a world migration. A map is
 * converted the first time somebody who may edit it opens it, one map at a time, as an ordinary
 * write anybody at the table is allowed to make — so a world with forty maps pays for the two its
 * table actually uses, and a GM who never opens the rest never has them rewritten underneath them.
 *
 * IN THIS ORDER, and it matters: the page is created FIRST and the entry is stripped only once it
 * exists. The other way round, a create that failed — a lost connection, a permission lowered
 * between the two calls — would have already thrown the graph away.
 *
 * THE MARK STAYS. `listRelationshipMaps` finds every map in the world by the entry's flag being
 * truthy, so the version is written in the same update that removes the graph; an entry left with
 * an empty object, or with no flag at all, would stop being a map the moment it became one with
 * pages.
 *
 * Returns null, and writes nothing, for a reader who may not edit. They see the entry's own graph
 * instead (`resolveMapBoard` resolves a version 1 map to it), read-only, which is exactly what they
 * had before.
 *
 * ONE KNOWN RACE, and it is left alone deliberately: two people opening the same version 1 map
 * within the same round trip both find no pages and both make one, so the board arrives duplicated
 * across two tabs. It costs one delete to put right, it can only happen to a map made before pages
 * existed, and it can only happen ONCE to any given map. The cure — a deterministic page id so the
 * second create is refused by the server — would leave the losing client rendering a board it
 * cannot see yet, which is a worse thing to be wrong about than a spare tab.
 */
export async function ensureFirstMapPage(entry) {
	if (!entry) return null;
	const already = listMapPages(entry);
	if (already.length) return already[0];
	if (!canEditRelationshipMap(entry)) return null;
	// A COLLECTION WITH NO MAPS IN IT IS LEFT THAT WAY. Only a version 1 map has a board to carry onto
	// a page; a collection nobody has added a map to yet gets none made for it on open.
	if (!hasLegacyBoard(entry)) return null;

	const carried = normalizeGraph(entry.getFlag?.(MODULE_ID, RELMAP_FLAG));
	// ⚠ SHOWN, AND THE ONLY BOARD IN THE SYSTEM THAT IS MADE THAT WAY. Every new board starts hidden
	// (see `mapPageData`), but this one is not new: it is the board the whole table has been looking
	// at since before pages existed, being carried onto a page underneath them. Made hidden it would
	// read as the conversion having stolen the map, and for whoever happened to open it first rather
	// than as anybody's decision.
	const made = await entry.createEmbeddedDocuments?.("JournalEntryPage", [
		mapPageData(entry.name, carried, 0, {}, { shown: true }),
	]);
	const page = made?.[0] ?? null;
	if (!page) return null;

	// The graph is on the page now, so the copy on the entry is a second truth waiting to be read
	// by something that has not heard about pages. Dropped through `deletionEntry`, because a
	// nested key inside an object-typed flag is removed differently on the two live cores and the
	// v13 spelling is silently ignored on v14 (utils/foundry-compat.js).
	await entry.update(Object.fromEntries([
		[relmapPath("version"), RELMAP_VERSION],
		deletionEntry(relmapPath("nodes")),
		deletionEntry(relmapPath("edges")),
		deletionEntry(relmapPath("shape")),
	]));
	return page;
}

/**
 * Add a board to a map.
 *
 * Gated on OWNER and nothing else — which is the point of pages being documents. A player who
 * cannot make a new MAP can make as many boards on this one as the table needs.
 *
 * Sorted AFTER the last page rather than at the end of nothing: a new page belongs on the end of
 * the strip, where the reader pressed the button, and a sort of 0 would put it at the front.
 */
export async function createMapPage(entry, name) {
	if (!canEditRelationshipMap(entry)) return null;
	// ⚠ THE FIRST BOARD BEFORE THE SECOND. A map still on version 1 has its whole board on the
	// ENTRY and no page at all, and adding a second board to it would leave `resolveMapBoard` resolving
	// to the new EMPTY page — the map would look as though pressing "New page" had swept everybody
	// off it. The window converts on open, but that can have failed (it swallows its error on
	// purpose, so a map with no page still opens readable), and this is the one call where a
	// failure downstream is destructive rather than untidy.
	await ensureFirstMapPage(entry);
	const pages = listMapPages(entry);
	const last = pages[pages.length - 1];
	const sort = (Number(last?.sort) || 0) + PAGE_SORT_STEP;
	const made = await entry.createEmbeddedDocuments?.("JournalEntryPage", [
		mapPageData(name, emptyGraph(), sort),
	]);
	return made?.[0] ?? null;
}

/** Rename one board. Nothing is written for a name that came back the same, so a reader who opens
 * the rename box and presses save without typing does not broadcast a change to the whole table. */
export async function renameMapPage(page, name) {
	if (!page) return false;
	const want = mapPageName(name);
	if (want === page.name) return false;
	await page.update({ name: want });
	return true;
}

/**
 * Rub out one board, and everything on it.
 *
 * THE LAST ONE TOO. A collection with no maps in it is an ordinary state now, and nothing refills one
 * on the next open (`ensureFirstMapPage` only carries a version 1 board), so rubbing out the last map
 * leaves a collection that says it is empty. The caller confirms with the reader; this is the
 * ownership rail underneath that, because the confirm dialog is UI and this is the rule.
 */
export async function deleteMapPage(page) {
	const entry = page?.parent ?? null;
	if (!entry || !canEditRelationshipMap(entry)) return false;
	await entry.deleteEmbeddedDocuments?.("JournalEntryPage", [page.id]);
	return true;
}

// ── Putting the strip in an order ───────────────────────────────────────────────────────────────
//
// WHAT ORDER THE BOARDS ARE IN IS THE TABLE'S, and it is stored where every other thing about a
// board is: on the document, as core's own `sort`. Not per reader. Two people talking to each other
// about "the third tab" have to be looking at the same third tab, which is the same reason
// `listMapPages` breaks a tie on the name rather than leaving object order to decide it.
//
// ⚠ AND IT IS AN EDIT LIKE ANY OTHER, gated on OWNER and not on being the GM. A player who can add,
// rename and delete the boards of a map (see the ownership section at the top of this file) can put
// them in an order too; a strip only the GM could arrange would be the one page tool that stopped
// working for the table the rest of them were built for.

/**
 * WHERE ONE BOARD LANDS when it is dropped somewhere else on the strip, as `sort` numbers.
 *
 * Pure, and separate from the write, because the arithmetic is the half that can be got wrong and
 * the half a test can hold still.
 *
 * ONE PAGE MOVES AND THE REST ARE LEFT ALONE, which is what the gap between two sorts is for
 * (`PAGE_SORT_STEP`): a board dropped between two others takes the number halfway between them and
 * nothing else on the strip is rewritten. Only when that halfway point has run out of room, which
 * takes seventeen drops into the same gap, is the whole strip renumbered by the step. The other
 * spelling, renumbering every time, is a write per board on every drop, broadcast to every client
 * at the table, for a change that moved one tab.
 *
 * ⚠ THE PAGES HANDED IN ARE THE ONES THE READER CAN SEE, never `listMapPages`. A player cannot
 * write a board the GM has kept back, so a plan that renumbered one would be a drop that half
 * failed. It does mean a hidden board keeps its old number and can end up between two boards a
 * player has just put next to each other, which the GM sees and the player never does; that is the
 * honest cost of boards the two of them are looking at different sets of.
 *
 * @param {Array<JournalEntryPage>} pages  the strip as it stands, in the order it is drawn.
 * @param {string} movedId  the board being dropped.
 * @param {string|null} beforeId  the board it is dropped in FRONT of, or null for the far end.
 * @returns {Array<{page, sort}>}  what to write. Empty when nothing would move.
 */
export function planPageMove(pages, movedId, beforeId = null) {
	const strip = (pages ?? []).filter(page => page?.id);
	const moved = strip.find(page => page.id === movedId);
	if (!moved || movedId === beforeId) return [];
	// Through the two reorder primitives, including moveWithin's no-op contract, rather
	// than a third hand-written splice: the destination is computed against a list the board has
	// already been taken OUT of (aiming at the original would land every forward drop one place
	// short), and moveWithin then does the removal itself from the original index.
	const from = strip.findIndex(page => page.id === movedId);
	const without = strip.filter((_, i) => i !== from);
	const index = insertionIndexIn(without, beforeId, without.length);
	// Dropped back where it already was: the two ends of the tab it came from both name it.
	const order = moveWithin(strip, from, index);
	if (!order) return [];

	const sortOf = page => (Number(page?.sort) || 0);
	const before = index > 0 ? sortOf(order[index - 1]) : null;
	const after = index < order.length - 1 ? sortOf(order[index + 1]) : null;
	if (before === null && after === null) return [{ page: moved, sort: 0 }];
	if (before === null) return [{ page: moved, sort: after - PAGE_SORT_STEP }];
	if (after === null) return [{ page: moved, sort: before + PAGE_SORT_STEP }];
	// A gap of two or more has a whole number strictly inside it. A gap of one, of none, or of a
	// pair that only sorted in that order because their names broke the tie, has not.
	if (after - before >= 2) return [{ page: moved, sort: Math.floor((before + after) / 2) }];
	return order
		.map((page, i) => ({ page, sort: i * PAGE_SORT_STEP }))
		.filter(row => sortOf(row.page) !== row.sort);
}

/**
 * Put one board somewhere else on the strip.
 *
 * ONE WRITE FOR THE WHOLE MOVE, through the parent rather than page by page: a renumbered strip
 * arriving as eight separate updates is eight repaints at the far end of the table, with the order
 * visibly wrong in between. `updateEmbeddedDocuments` is one round trip and one broadcast.
 *
 * @returns {Promise<boolean>} whether anything moved.
 */
export async function moveMapPage(entry, movedId, beforeId = null) {
	if (!entry || !canEditRelationshipMap(entry)) return false;
	const rows = planPageMove(listVisibleMapPages(entry), movedId, beforeId);
	if (!rows.length) return false;
	await entry.updateEmbeddedDocuments?.("JournalEntryPage",
		rows.map(row => ({ _id: row.page.id, sort: row.sort })));
	return true;
}

/**
 * A board's graph, normalized. Never trusts what it reads: see `normalizeGraph`.
 *
 * TAKES EITHER DOCUMENT, and that is not laziness. On a converted map it is handed a page; on one
 * still on version 1 it is handed the entry, and the flag it reads is the same shape either way.
 * One reader for both is what keeps the legacy map a board somebody can still look at rather than
 * a special case threaded through the window.
 */
export function readGraph(doc) {
	return normalizeGraph(doc?.getFlag?.(MODULE_ID, RELMAP_FLAG));
}

/**
 * Apply one patch built by relmap-store.js.
 *
 * Everything funnels through here so the failure has one voice. A write can fail for a reason the
 * reader can act on (their ownership was lowered while the window was open) and for reasons they
 * cannot, and either way the board they are looking at is now out of step with the world — so the
 * caller is told, rather than left believing the drag landed.
 */
export async function applyPatch(doc, patch) {
	if (!doc || !patch || !Object.keys(patch).length) return false;
	await doc.update(patch);
	return true;
}

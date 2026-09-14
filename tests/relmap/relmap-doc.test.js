import { describe, it, expect, beforeEach, vi } from "vitest";

// The window itself is proved by tests/dialogs/relationship-map-window.test.js. What matters here
// is only that the bouncer reaches for it and never paints, so it is stubbed out.
vi.mock("../../module/dialogs/RelationshipMapWindow.js", () => ({
	openRelationshipMap: vi.fn(),
}));

import { openRelationshipMap } from "../../module/dialogs/RelationshipMapWindow.js";
import {
	RELMAP_FOLDER_NAME, RELMAP_PAGE_NAME_MAX, RELMAP_SHEET_CLASS, canCreateRelationshipMap,
	canHideMapPages, canSeeMapPage, createMapPage, createRelationshipMap, deleteMapPage,
	ensureFirstMapPage, ensureRelationshipMapFolder, findRelationshipMapFolder, getMapPage,
	getRelationshipMap, hasLegacyBoard, isMapPageHidden, listMapPages,
	listRelationshipMaps, listVisibleMapPages, mapPageName, resolveMapBoard,
	RELMAP_MAP_NAME_MAX, canDeleteRelationshipMap, deleteRelationshipMap, relationshipMapName,
	renameRelationshipMap,
	moveMapPage, planPageMove,
	readGraph, renameMapPage, setMapPageHidden,
} from "../../module/relmap/relmap-doc.js";
import { RELMAP_VERSION } from "../../module/relmap/relmap-store.js";
import { createRelationshipMapEntrySheetClass } from "../../module/journal/RelationshipMapEntrySheet.js";

/** The document a reader's board resolves to, which is all most of these ask `resolveMapBoard` for. */
const boardDocOf = (entry, pageId = null) => resolveMapBoard(entry, pageId).doc;

// Where a relationship map lives, and the two permission facts the whole feature is shaped around:
// EDITING one needs only OWNER (so every player can), while CREATING one needs the journal-create
// right (so a plain player cannot).

const OWNER = 3;
// The two ends of "may the players look at this board": INHERIT takes the map's own ownership,
// which on a map is OWNER for everybody at the table, and NONE is the GM keeping a board back.
const INHERIT = -1;
const NONE = 0;

/** The real English table, kept from before the suite's `beforeEach` replaces `globalThis.game`,
 * so a page named by the code under test is asserted against the words a player would see. */
const TABLE = globalThis.game.i18n;

let nextPageId = 0;

/**
 * Apply one dotted leaf patch the way a real document does.
 *
 * ⚠ THE FAKE USED TO ONLY RECORD PATCHES, and that is exactly the kind of shortcut that certifies
 * code the real thing never runs correctly: every write in this feature is a DOTTED PATH TO A LEAF
 * (relmap-store.js explains why at length), so a fake that never walks one cannot show that reading
 * the flag back afterwards finds what was written. Two tests wanted precisely that round trip --
 * "the mark survives" and "a newcomer appears on the board" -- and both would have passed against a
 * function that wrote nothing at all.
 *
 * Handles the `-=key` deletion spelling too, which is what `deletionEntry` produces.
 */
function applyDotted(doc, patch) {
	for (const [path, value] of Object.entries(patch ?? {})) {
		const parts = path.split(".");
		const leaf = parts.pop();
		let at = doc;
		for (const part of parts) {
			if (at[part] === null || typeof at[part] !== "object") at[part] = {};
			at = at[part];
		}
		if (leaf.startsWith("-=")) delete at[leaf.slice(2)];
		else at[leaf] = value;
	}
}

/**
 * A JournalEntryPage stand-in: ONE BOARD of a map.
 *
 * `graph` of null makes a page that is NOT one of ours — a page of ordinary prose somebody filed
 * on the same entry, which the strip must not offer as a board.
 */
function pageDoc(name, graph, {
	id = null, sort = 0, parent = null, flags: extraFlags = null, ownership = null,
} = {}) {
	const flags = extraFlags ?? (graph === null ? {} : { "relationship-map-pwd": { relationshipMap: graph } });
	const doc = {
		id: id ?? `page${++nextPageId}`,
		name,
		sort,
		parent,
		updates: [],
		flags,
		// A board the table can see inherits the map's own ownership, which on a map is OWNER for
		// everybody; one the GM has kept back carries NONE. See relmap/relmap-doc.js.
		ownership: ownership ?? { default: INHERIT },
		getFlag: (scope, key) => flags[scope]?.[key] ?? null,
		// Core's rule, near enough for this: a GM is OWNER over everything, an explicit level for
		// this user beats the default, and INHERIT defers to the parent entry.
		testUserPermission(user, permission) {
			if (user?.isGM) return true;
			const level = doc.ownership?.[user?.id] ?? doc.ownership?.default ?? INHERIT;
			if (level === INHERIT) return !!doc.parent?.isOwner;
			return level >= (permission === "OWNER" ? OWNER : 2);
		},
		// ⚠ DERIVED AND NOT SET, exactly as core derives it: `isOwner` is
		// `testUserPermission(game.user, "OWNER")`. A fake carrying it as a flag of its own would
		// certify a caller asking the wrong document, because both would say yes.
		get isOwner() { return doc.testUserPermission(game?.user, "OWNER"); },
		update(patch) {
			doc.updates.push(patch);
			if ("name" in patch) doc.name = patch.name;
			if (patch.ownership) Object.assign(doc.ownership, patch.ownership);
			applyDotted(doc, patch);
			return Promise.resolve(doc);
		},
	};
	return doc;
}

/** A JournalEntry stand-in, with the embedded collection and the two calls the page layer makes. */
const entry = (name, flags = {}, extra = {}) => {
	const pages = [];
	const doc = {
		id: name.toLowerCase().replace(/\W+/g, ""),
		name,
		flags,
		isOwner: true,
		updates: [],
		// The shape `listMapPages` reads: core's EmbeddedCollection exposes `.contents`.
		pages: { get contents() { return pages; } },
		getFlag: (scope, key) => flags[scope]?.[key] ?? null,
		update(patch) {
			doc.updates.push(patch);
			applyDotted(doc, patch);
			return Promise.resolve(doc);
		},
		createEmbeddedDocuments(type, rows) {
			// ⚠ THE WHOLE FLAG OBJECT, not just the graph. A page can carry a second flag beside its
			// graph, and a fake that dropped it would certify a lookup that can never find anything.
			const made = rows.map(row => pageDoc(row.name, row.flags?.["relationship-map-pwd"]?.relationshipMap ?? null,
				{
					sort: row.sort, parent: doc, flags: row.flags ?? null,
					// ⚠ CARRIED THROUGH, like the flags beside it. Whether a new board arrives hidden
					// from the players is written in the create, and a fake that dropped it would
					// certify the defaulting no matter which way round it was spelt.
					ownership: row.ownership ?? null,
				}));
			pages.push(...made);
			return Promise.resolve(made);
		},
		// ONE CALL FOR SEVERAL PAGES, which is how the strip is reordered: a renumbered strip
		// arriving as one write is one broadcast, where page-by-page it is one per board with the
		// order visibly wrong in between. Each row still goes through the page's own `update`, so
		// what a page records of having been written to is the same either way.
		updateEmbeddedDocuments(type, rows) {
			const done = [];
			for (const row of rows ?? []) {
				const page = pages.find(p => p.id === row._id);
				if (!page) continue;
				const { _id, ...patch } = row;
				page.update(patch);
				done.push(page);
			}
			return Promise.resolve(done);
		},
		deleteEmbeddedDocuments(type, ids) {
			const gone = pages.filter(p => ids.includes(p.id));
			for (const p of gone) pages.splice(pages.indexOf(p), 1);
			return Promise.resolve(gone);
		},
		...extra,
	};
	return doc;
};

/** A map with the boards named, in the order given. Sorted apart so the strip's own ordering is
 * the thing under test rather than the order they happened to be pushed in. */
function mapWith(name, boards) {
	const map = entry(name, { "relationship-map-pwd": { relationshipMap: { version: 2 } } });
	boards.forEach((board, i) => map.pages.contents.push(
		pageDoc(board.name, board.graph ?? { nodes: {}, edges: {} },
			{
				id: board.id, sort: board.sort ?? i * 100000, parent: map,
				// `hidden: true` is a board the GM has kept back from the table.
				ownership: board.hidden ? { default: NONE } : null,
			}),
	));
	return map;
}

let created;
let folders;
let journals;
let canCreateJournal;
let canCreateFolder;

beforeEach(() => {
	created = [];
	folders = [];
	journals = [];
	nextPageId = 0;
	canCreateJournal = true;
	canCreateFolder = true;
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { INHERIT, NONE, LIMITED: 1, OBSERVER: 2, OWNER } };
	globalThis.game = {
		user: { id: "u1" },
		i18n: TABLE,
		folders: { get contents() { return folders; } },
		journal: {
			get contents() { return journals; },
			get: id => journals.find(j => j.id === id) ?? null,
		},
	};
	globalThis.JournalEntry = {
		canUserCreate: () => canCreateJournal,
		create: data => { created.push(data); const made = entry(data.name, data.flags); folders.push; journals.push(made); return Promise.resolve(made); },
	};
	globalThis.Folder = {
		canUserCreate: () => canCreateFolder,
		create: data => { const made = { id: "f1", ...data }; folders.push(made); return Promise.resolve(made); },
	};
});

describe("the folder maps are filed in", () => {
	it("finds nothing, and creates nothing, in a world that has none", () => {
		expect(findRelationshipMapFolder()).toBeNull();
		expect(folders).toEqual([]);
	});

	it("creates it once and finds it thereafter", async () => {
		const made = await ensureRelationshipMapFolder();
		expect(made.name).toBe(RELMAP_FOLDER_NAME);
		expect(made.type).toBe("JournalEntry");
		expect(await ensureRelationshipMapFolder()).toBe(made);
		expect(folders).toHaveLength(1);
	});

	// Creating a Folder is its own role-gated right. A player who may edit every map in the world
	// still may not make a folder, and this must hand back null for the caller to file at the root
	// rather than throwing in the middle of "add a map".
	it("hands back null rather than throwing when this user may not create folders", async () => {
		canCreateFolder = false;
		expect(await ensureRelationshipMapFolder()).toBeNull();
	});

	// The read-only lookup is separate precisely so a player opening a map never conjures a folder
	// just by asking.
	it("has a lookup that creates nothing", () => {
		findRelationshipMapFolder();
		expect(folders).toEqual([]);
	});
});

describe("finding the maps in a world", () => {
	// By the FLAG, not by folder membership: a GM who files a map beside the front it belongs to,
	// or renames the folder, has not stopped it being a map.
	it("finds a map wherever it has been filed", () => {
		journals = [
			entry("A map", { "relationship-map-pwd": { relationshipMap: { nodes: {} } } }),
			entry("Session notes", {}),
			entry("Another map", { "relationship-map-pwd": { relationshipMap: { nodes: {} } } }),
		];
		expect(listRelationshipMaps().map(m => m.name)).toEqual(["A map", "Another map"]);
	});

	it("does not mistake an ordinary journal for one", () => {
		journals = [entry("Session notes", {})];
		expect(listRelationshipMaps()).toEqual([]);
		expect(getRelationshipMap("sessionnotes")).toBeNull();
	});

	it("reads a stored graph back through the normalizer", () => {
		const map = entry("A map", {
			"relationship-map-pwd": { relationshipMap: { nodes: { "bad.id": { x: 1, y: 1 } } } },
		});
		expect(readGraph(map).nodes).toEqual({});
	});
});

describe("making a new map", () => {
	// The asymmetry the whole feature is shaped around, asserted directly.
	it("is refused when this user may not create journals", async () => {
		canCreateJournal = false;
		expect(canCreateRelationshipMap()).toBe(false);
		expect(await createRelationshipMap("Mine")).toBeNull();
		expect(created).toEqual([]);
	});

	it("is owned by everybody, so the whole table can edit it", async () => {
		await createRelationshipMap("The people of Stillwater");
		expect(created[0].ownership).toEqual({ default: OWNER });
	});

	// The entry's own flag is the MARK that says "this is a map", not a graph: the graph lives on
	// the page below. What matters is that it stays TRUTHY, because `listRelationshipMaps` finds
	// every map in the world by exactly that.
	it("carries the mark and its sheet class from the very first write", async () => {
		await createRelationshipMap("The people of Stillwater");
		expect(created[0].flags.core.sheetClass).toBe(RELMAP_SHEET_CLASS);
		expect(created[0].flags["relationship-map-pwd"].relationshipMap).toEqual({ version: RELMAP_VERSION });
		expect(created[0].flags["relationship-map-pwd"].relationshipMap).toBeTruthy();
	});

	// Every map in a collection is one somebody added. A collection used to arrive with an empty board
	// named after itself, and then grow "The Party" in front of it: two tabs nobody had asked for.
	it("arrives with no maps in it", async () => {
		await createRelationshipMap("The people of Stillwater");
		expect(created[0].pages ?? []).toEqual([]);
	});

	// And that is how it is told from a version 1 map: its flag is the mark, with no board on it, so
	// opening it carries nothing onto a page.
	it("carries no board on the entry either, so opening it makes no map", async () => {
		await createRelationshipMap("The people of Stillwater");
		const made = entry("The people of Stillwater", created[0].flags);
		expect(hasLegacyBoard(made)).toBe(false);
		expect(await ensureFirstMapPage(made)).toBeNull();
	});


	it("files it in the folder", async () => {
		await createRelationshipMap("Mine");
		expect(created[0].folder).toBe("f1");
	});

	// The rule a rename keeps, from the first write. A collection born with a name no rename could give
	// it is one the first untouched save of the rename box cuts short and announces as renamed.
	it("names it the way a rename would: trimmed, never blank, never over the limit", async () => {
		await createRelationshipMap(`  ${"x".repeat(RELMAP_MAP_NAME_MAX + 20)}  `);
		await createRelationshipMap("   ");
		expect(created[0].name).toHaveLength(RELMAP_MAP_NAME_MAX);
		expect(created[1].name).toBe("Relationship Map");
	});

	it("still makes the map when there is no folder to file it in", async () => {
		canCreateFolder = false;
		await createRelationshipMap("Mine");
		expect(created[0].folder).toBeNull();
	});
});

// ── The pages a map is made of ──────────────────────────────────────────────────────────────────
//
// One map is several NAMED BOARDS, each a JournalEntryPage carrying its own graph. The permission
// story is the reason to store them this way: a page's create, update and delete are all gated on
// the PARENT entry's ownership, so a plain player who cannot make a new map can make as many boards
// on this one as the table needs.

describe("the boards a map is made of", () => {
	it("lists them in strip order, by sort and then by name", () => {
		const map = mapWith("A map", [
			{ name: "Marshford", sort: 200000 },
			{ name: "Stillwater", sort: 0 },
			{ name: "The Masons", sort: 100000 },
		]);
		expect(listMapPages(map).map(p => p.name)).toEqual(["Stillwater", "The Masons", "Marshford"]);
	});

	// The tie-break is not decoration. `sort` is only unique because this file keeps it so, and two
	// people at opposite ends of the table adding a page in the same second land on the same
	// number — after which object order differs per client, and two readers talking to each other
	// about "the third tab" are looking at different boards.
	it("breaks a tie on sort by name, so every client sees the same order", () => {
		const map = mapWith("A map", [
			{ name: "Zither", sort: 0 },
			{ name: "Anvil", sort: 0 },
		]);
		expect(listMapPages(map).map(p => p.name)).toEqual(["Anvil", "Zither"]);
	});

	// A GM is entitled to file a page of ordinary prose on a map. A strip that drew a tab for it
	// would offer a board that is not one.
	it("ignores a page of prose filed on the same entry", () => {
		const map = mapWith("A map", [{ name: "Stillwater" }]);
		map.pages.contents.push(pageDoc("Notes for tonight", null, { parent: map }));
		expect(listMapPages(map).map(p => p.name)).toEqual(["Stillwater"]);
	});

	// Handed a name it does not know, this must never quietly hand back a different board: a write
	// meant for one page landing on another is the worst failure this layer has.
	it("hands back nothing at all for a page id it does not know", () => {
		const map = mapWith("A map", [{ name: "Stillwater", id: "p1" }]);
		expect(getMapPage(map, "p1").name).toBe("Stillwater");
		expect(getMapPage(map, "nope")).toBeNull();
	});
});

describe("the document a board is read from and written to", () => {
	it("is the page that was asked for", () => {
		const map = mapWith("A map", [{ name: "Stillwater", id: "p1" }, { name: "Marshford", id: "p2" }]);
		expect(boardDocOf(map, "p2").name).toBe("Marshford");
	});

	// Somebody at the far end of the table can rub out the board this reader is standing on.
	it("falls through to the first board when that page has gone", () => {
		const map = mapWith("A map", [{ name: "Stillwater", id: "p1" }, { name: "Marshford", id: "p2" }]);
		expect(boardDocOf(map, "gone").name).toBe("Stillwater");
	});

	// ⚠ THE WHOLE OF THE VERSION 1 STORY, from the window's point of view. A map written before
	// pages existed keeps its graph on the entry, and the flag is the same shape there — so the
	// window reads and writes through one handle and needs no second code path anywhere.
	it("is the ENTRY itself on a map that still has no pages", () => {
		const legacy = entry("Old map", {
			"relationship-map-pwd": { relationshipMap: { version: 1, nodes: { a: { x: 5, y: 5 } } } },
		});
		expect(boardDocOf(legacy, null)).toBe(legacy);
		expect(Object.keys(readGraph(boardDocOf(legacy, null)).nodes)).toEqual(["a"]);
		expect(resolveMapBoard(legacy).kind).toBe("legacy");
	});

	// ⚠ AND NOTHING AT ALL WHERE THERE IS NO BOARD. On a collection with no maps in it the entry's flag
	// is only the mark, and resolved to it, every write in the window would land there: a nudge still
	// waiting when the last map was rubbed out would reopen the collection as a version 1 map.
	it("is nothing at all on a collection with no maps in it", () => {
		const empty = mapWith("A collection", []);
		expect(boardDocOf(empty, null)).toBeNull();
		expect(resolveMapBoard(empty).kind).toBe("none");
	});

	it("is nothing at all for a reader whose every map is hidden", () => {
		const map = mapWith("A collection", [{ id: "p1", name: "Stillwater", hidden: true }]);
		expect(boardDocOf(map, "p1")).toBeNull();
		expect(resolveMapBoard(map, "p1").kind).toBe("unshared");
	});
});

describe("giving a version 1 map its first page", () => {
	const legacyMap = () => entry("The people of Stillwater", {
		"relationship-map-pwd": {
			relationshipMap: {
				version: 1,
				shape: "clusters",
				nodes: { a: { name: "Ordga", x: 10, y: 20 } },
				edges: {},
			},
		},
	});

	it("moves the whole board onto a page named after the map", async () => {
		const map = legacyMap();
		const page = await ensureFirstMapPage(map);
		expect(page.name).toBe("The people of Stillwater");
		const moved = readGraph(page);
		expect(moved.nodes.a).toMatchObject({ name: "Ordga", x: 10, y: 20 });
	});

	// The entry keeps the MARK and loses the graph. Both halves matter: a second copy of the board
	// left on the entry is a second truth waiting to be read by something that has not heard about
	// pages, and an entry with no flag at all stops being a map the moment it becomes one.
	it("strips the graph off the entry and leaves the mark behind", async () => {
		const map = legacyMap();
		await ensureFirstMapPage(map);
		expect(map.updates[0]).toEqual({
			"flags.relationship-map-pwd.relationshipMap.version": RELMAP_VERSION,
			"flags.relationship-map-pwd.relationshipMap.-=nodes": null,
			"flags.relationship-map-pwd.relationshipMap.-=edges": null,
			"flags.relationship-map-pwd.relationshipMap.-=shape": null,
		});
	});

	// Every window on the map runs this. A second one that made a second page would open the map
	// with its board duplicated across two tabs.
	it("does nothing at all the second time", async () => {
		const map = legacyMap();
		const first = await ensureFirstMapPage(map);
		const again = await ensureFirstMapPage(map);
		expect(again).toBe(first);
		expect(listMapPages(map)).toHaveLength(1);
		expect(map.updates).toHaveLength(1);
	});

	// A reader who may only look must not rewrite somebody else's map by opening it. They see the
	// entry's own graph instead, which is exactly what they had before.
	it("writes nothing for a reader who may not edit", async () => {
		const map = legacyMap();
		map.isOwner = false;
		expect(await ensureFirstMapPage(map)).toBeNull();
		expect(listMapPages(map)).toEqual([]);
		expect(map.updates).toEqual([]);
	});
});

describe("adding, renaming and rubbing out a board", () => {
	it("adds one after the last, so it lands where the reader pressed the button", async () => {
		const map = mapWith("A map", [{ name: "Stillwater", sort: 0 }, { name: "Marshford", sort: 100000 }]);
		const made = await createMapPage(map, "The Masons");
		expect(made.sort).toBeGreaterThan(100000);
		expect(listMapPages(map).map(p => p.name))
			.toEqual(["Stillwater", "Marshford", "The Masons"]);
		expect(readGraph(made)).toMatchObject({ nodes: {}, edges: {} });
	});

	it("is refused for a reader who may not edit the map", async () => {
		const map = mapWith("A map", [{ name: "Stillwater" }]);
		map.isOwner = false;
		expect(await createMapPage(map, "Nope")).toBeNull();
		expect(listMapPages(map)).toHaveLength(1);
	});

	// Core's `name` refuses a blank outright, so a reader who saves the box without typing would
	// throw rather than be told no.
	it("names an unnamed board rather than refusing it", async () => {
		const map = mapWith("A map", [{ name: "Stillwater" }]);
		const made = await createMapPage(map, "   ");
		expect(made.name).toBe(TABLE.localize("RELMAP.pages.untitled"));
	});

	it("shortens a name too long for the strip rather than refusing it", () => {
		expect(mapPageName("x".repeat(200))).toHaveLength(RELMAP_PAGE_NAME_MAX);
	});

	it("renames a board", async () => {
		const map = mapWith("A map", [{ name: "Stillwater" }]);
		const [page] = listMapPages(map);
		expect(await renameMapPage(page, "  The people of Stillwater  ")).toBe(true);
		expect(page.updates[0]).toEqual({ name: "The people of Stillwater" });
	});

	// A reader who opens the rename box and saves without typing must not broadcast a change to
	// every other client at the table.
	it("writes nothing for a name that came back the same", async () => {
		const map = mapWith("A map", [{ name: "Stillwater" }]);
		const [page] = listMapPages(map);
		expect(await renameMapPage(page, "Stillwater")).toBe(false);
		expect(page.updates).toEqual([]);
	});

	it("rubs one out", async () => {
		const map = mapWith("A map", [{ name: "Stillwater", id: "p1" }, { name: "Marshford", id: "p2" }]);
		expect(await deleteMapPage(getMapPage(map, "p2"))).toBe(true);
		expect(listMapPages(map).map(p => p.name)).toEqual(["Stillwater"]);
	});

	// THE LAST ONE TOO. A collection with no maps in it is an ordinary state, and nothing refills it.
	it("rubs out the last board too, leaving a collection with no maps in it", async () => {
		const map = mapWith("A map", [{ name: "Stillwater", id: "p1" }]);
		expect(await deleteMapPage(getMapPage(map, "p1"))).toBe(true);
		expect(listMapPages(map)).toEqual([]);
	});

	it("refuses to rub one out for a reader who may not edit the map", async () => {
		const map = mapWith("A map", [{ name: "Stillwater", id: "p1" }, { name: "Marshford", id: "p2" }]);
		map.isOwner = false;
		expect(await deleteMapPage(getMapPage(map, "p2"))).toBe(false);
		expect(listMapPages(map)).toHaveLength(2);
	});
});

// ── Putting the strip in an order ───────────────────────────────────────────────────────────────
//
// The order is the TABLE'S: it is written to the pages as core's own `sort`, so a tab dragged on
// one client moves on every other. What is proved here is the arithmetic (one write for an ordinary
// move, a renumber only when the gap has run out), and the gate.

describe("putting the boards in an order", () => {
	const NAMES = map => listMapPages(map).map(page => page.name);
	const strip = () => mapWith("A map", [
		{ name: "Stillwater", id: "p1" }, { name: "Marshford", id: "p2" }, { name: "The Masons", id: "p3" },
	]);

	it("puts one board in front of another, and writes only that one", async () => {
		const map = strip();
		expect(await moveMapPage(map, "p3", "p2")).toBe(true);
		expect(NAMES(map)).toEqual(["Stillwater", "The Masons", "Marshford"]);
		// ONE PAGE MOVED AND THE REST LEFT ALONE, which is what the gap between two sorts is for:
		// the whole strip renumbered on every drop is a write per board, broadcast to the table.
		const [p1, p2, p3] = listMapPages(map);
		expect(p1.updates).toEqual([]);
		expect(p3.updates).toEqual([]);
		expect(p2.updates).toEqual([{ sort: 50000 }]);
	});

	it("puts one board on the far end when it is dropped past the last tab", async () => {
		const map = strip();
		expect(await moveMapPage(map, "p1", null)).toBe(true);
		expect(NAMES(map)).toEqual(["Marshford", "The Masons", "Stillwater"]);
	});

	it("puts one board at the front when it is dropped in front of the first tab", async () => {
		const map = strip();
		expect(await moveMapPage(map, "p3", "p1")).toBe(true);
		expect(NAMES(map)).toEqual(["The Masons", "Stillwater", "Marshford"]);
	});

	// Seventeen drops into the same gap is where halving runs out of whole numbers. The renumber is
	// the rail under that, and it must write every board whose number actually changed and no other.
	it("renumbers the strip when the gap it is dropped into has no room left", async () => {
		const map = mapWith("A map", [
			{ name: "Stillwater", id: "p1", sort: 0 },
			{ name: "Marshford", id: "p2", sort: 1 },
			{ name: "The Masons", id: "p3", sort: 2 },
		]);
		expect(await moveMapPage(map, "p3", "p2")).toBe(true);
		expect(NAMES(map)).toEqual(["Stillwater", "The Masons", "Marshford"]);
		expect(listMapPages(map).map(page => page.sort)).toEqual([0, 100000, 200000]);
		// Stillwater was already where the renumber wanted it, so nothing was written to it.
		expect(getMapPage(map, "p1").updates).toEqual([]);
	});

	it("writes nothing at all when a board is dropped where it already is", async () => {
		const map = strip();
		expect(await moveMapPage(map, "p2", "p2")).toBe(false);
		expect(await moveMapPage(map, "p2", "p3")).toBe(false);
		expect(map.updates).toEqual([]);
		expect(listMapPages(map).flatMap(page => page.updates)).toEqual([]);
	});

	it("is refused for a reader who may not edit the map", async () => {
		const map = strip();
		map.isOwner = false;
		expect(await moveMapPage(map, "p3", "p1")).toBe(false);
		expect(NAMES(map)).toEqual(["Stillwater", "Marshford", "The Masons"]);
	});

	// ⚠ A PLAYER CANNOT WRITE A BOARD THE GM HAS KEPT BACK, so the plan is made from the boards the
	// reader can SEE. A drop that tried to renumber a hidden one would half fail on the server.
	it("leaves a board this reader cannot see out of the arithmetic", async () => {
		const map = mapWith("A map", [
			{ name: "Stillwater", id: "p1" },
			{ name: "The GM's own", id: "p2", hidden: true },
			{ name: "Marshford", id: "p3" },
		]);
		game.user = { id: "u1" };
		expect(await moveMapPage(map, "p3", "p1")).toBe(true);
		expect(listMapPages(map).find(page => page.id === "p2").updates).toEqual([]);
		expect(listVisibleMapPages(map).map(page => page.name)).toEqual(["Marshford", "Stillwater"]);
	});

	it("plans nothing for a board that is not on the strip", () => {
		expect(planPageMove(listMapPages(strip()), "nobody", "p1")).toEqual([]);
	});
});

// The join nothing else checks, and whose failure is silent: core stores the sheet id as
// `scope.ClassName`, every map carries that string in its own flag, and a class rename would drop
// every existing map onto Foundry's generic prose sheet with no error anywhere.
describe("the sheet the sidebar row opens", () => {
	class FakeBase {
		constructor(doc) { this.document = doc; }
		static get defaultOptions() { return {}; }
	}

	it("has the exact class name the stored sheet id names", () => {
		const cls = createRelationshipMapEntrySheetClass(FakeBase);
		expect(`relationship-map-pwd.${cls.name}`).toBe(RELMAP_SHEET_CLASS);
	});

	it("opens the board instead of painting itself", async () => {
		const cls = createRelationshipMapEntrySheetClass(FakeBase);
		const doc = entry("A map", { "relationship-map-pwd": { relationshipMap: { nodes: {} } } });
		const sheet = new cls(doc);
		sheet.close = vi.fn().mockResolvedValue(undefined);
		// The bouncer must never call up into the base render, or the blank prose window it exists
		// to prevent flashes up anyway.
		const painted = vi.fn();
		FakeBase.prototype._render = painted;
		await sheet._render(true, {});
		await new Promise(r => setTimeout(r, 0));
		expect(openRelationshipMap).toHaveBeenCalledWith(doc, {});
		expect(painted).not.toHaveBeenCalled();
		expect(sheet.close).toHaveBeenCalled();
	});

	// utils/window-restore.js reopens a saved window by rendering `doc.sheet` at the geometry it was
	// left in, and for a map `doc.sheet` is the bouncer. A bouncer that swallowed its options would
	// put every restored board back in the middle of the screen at its default size.
	it("forwards the geometry it was rendered at to the board", async () => {
		const cls = createRelationshipMapEntrySheetClass(FakeBase);
		const doc = entry("A map", { "relationship-map-pwd": { relationshipMap: { nodes: {} } } });
		const sheet = new cls(doc);
		sheet.close = vi.fn().mockResolvedValue(undefined);
		const where = { left: 10, top: 20, width: 900, height: 700 };
		await sheet._render(true, where);
		expect(openRelationshipMap).toHaveBeenCalledWith(doc, where);
	});

	// Window restore minimizes the sheet it rendered the instant it renders it. Here that sheet
	// painted nothing and is about to close, and `Application#minimize` does nothing at all for a
	// window that is not on screen yet — so a board left minimized would come back full size.
	it("hands a minimize on to the board, which holds it until it has rendered", async () => {
		const board = { openMinimized: vi.fn() };
		openRelationshipMap.mockReturnValueOnce(board);
		const cls = createRelationshipMapEntrySheetClass(FakeBase);
		const doc = entry("A map", { "relationship-map-pwd": { relationshipMap: { nodes: {} } } });
		const sheet = new cls(doc);
		sheet.close = vi.fn().mockResolvedValue(undefined);
		await sheet._render(true, {});
		await sheet.minimize();
		expect(board.openMinimized).toHaveBeenCalled();
	});
});

// ⚠ THE FIRST BOARD BEFORE THE SECOND. A map still on version 1 has its whole board on the entry
// and no page at all. Adding a second board to it without moving the first onto a page would leave
// the board document resolving to the new EMPTY page: pressing "New page" would look exactly like
// sweeping everybody off the map.
describe("adding a board to a map that has never had one", () => {
	const legacyMap = () => entry("The people of Stillwater", {
		"relationship-map-pwd": {
			relationshipMap: { version: 1, nodes: { a: { name: "Ordga", x: 10, y: 20 } }, edges: {} },
		},
	});

	it("moves the existing board onto a page first", async () => {
		const map = legacyMap();
		await createMapPage(map, "Marshford");
		const names = listMapPages(map).map(p => p.name);
		expect(names).toEqual(["The people of Stillwater", "Marshford"]);
	});

	it("leaves the people where they were rather than on the new board", async () => {
		const map = legacyMap();
		const made = await createMapPage(map, "Marshford");
		const [first] = listMapPages(map);
		expect(Object.keys(readGraph(first).nodes)).toEqual(["a"]);
		expect(Object.keys(readGraph(made).nodes)).toEqual([]);
		// And the board the window would open on is the one with everybody on it.
		expect(boardDocOf(map, null).name).toBe("The people of Stillwater");
	});
});

// ── Which boards the players may look at ────────────────────────────────────────────────────────
//
// A board is hidden or shown one page at a time, and it is core's own ownership that says which:
// NONE for a board the GM is keeping back, INHERIT for one the table can see, which on a map owned
// by everybody is a board they may also edit. Every new board starts hidden.
describe("hiding a board from the players", () => {
	const asGM = () => { globalThis.game.user = { id: "gm1", isGM: true }; };
	const asPlayer = () => { globalThis.game.user = { id: "u1", isGM: false }; };

	// THE DEFAULT, AND THE WHOLE REASON THE FEATURE HAS ONE. A board is a picture the GM is still
	// working out, and one that arrived shared would give it away the moment it had a face on it.
	it("makes every new board hidden from the players", async () => {
		const map = mapWith("Stillwater", [{ name: "Stillwater" }]);
		const page = await createMapPage(map, "Marshford");
		expect(page.ownership.default).toBe(NONE);
		expect(isMapPageHidden(page)).toBe(true);
	});

	// ⚠ AND THE MAKER KEEPS THEIRS. Core's server adds this to a document it is handed on its own,
	// but not to a page created inside its parent's create, which is how a map's first board
	// arrives: without it a trusted player making a map would be handed one they cannot see.
	it("leaves the board with whoever made it", async () => {
		asPlayer();
		const map = mapWith("Stillwater", [{ name: "Stillwater" }]);
		const page = await createMapPage(map, "Marshford");
		expect(page.ownership.u1).toBe(OWNER);
		expect(page.testUserPermission({ id: "u1" }, "OWNER")).toBe(true);
		expect(page.testUserPermission({ id: "u2" }, "OBSERVER")).toBe(false);
	});


	// ⚠ THE ONE EXCEPTION, and it is not a new board at all: the version 1 conversion is carrying a
	// board the whole table has been looking at onto a page underneath them. Made hidden it would
	// read as the conversion having stolen the map, and by whoever happened to open it first.
	it("leaves a converted version 1 board shown, because it always was", async () => {
		const legacy = entry("Old map", {
			"relationship-map-pwd": { relationshipMap: { nodes: { a: { name: "Jaspar" } }, edges: {} } },
		});
		const page = await ensureFirstMapPage(legacy);
		expect(page.ownership.default).toBe(INHERIT);
		expect(isMapPageHidden(page)).toBe(false);
	});

	// WHAT THE READER SEES AND WHAT THE DOCUMENT LAYER REASONS ABOUT ARE TWO LISTS, and this is the
	// split the whole feature rests on.
	it("keeps a hidden board out of the visible strip and in the whole one", () => {
		asPlayer();
		const map = mapWith("Stillwater", [
			{ id: "p1", name: "Stillwater" },
			{ id: "p2", name: "Marshford", hidden: true },
		]);
		expect(listMapPages(map).map(p => p.id)).toEqual(["p1", "p2"]);
		expect(listVisibleMapPages(map).map(p => p.id)).toEqual(["p1"]);
		asGM();
		expect(listVisibleMapPages(map).map(p => p.id)).toEqual(["p1", "p2"]);
	});

	// A reader's handle never resolves to a board that is not theirs: it falls through to the next
	// one they may see, exactly as it would if the board had been deleted.
	it("never hands a reader a board they may not look at", () => {
		asPlayer();
		const map = mapWith("Stillwater", [
			{ id: "p1", name: "Stillwater" },
			{ id: "p2", name: "Marshford", hidden: true },
		]);
		expect(getMapPage(map, "p2")).toBeNull();
		expect(boardDocOf(map, "p2").id).toBe("p1");
		asGM();
		expect(getMapPage(map, "p2").name).toBe("Marshford");
		expect(boardDocOf(map, "p2").id).toBe("p2");
	});

	// A GM tests as OWNER over everything in the world, so the eye cannot ask the permission
	// question: it would report every board visible and the GM would have no way to tell.
	it("reads the recorded ownership rather than asking what the GM may do", () => {
		asGM();
		const map = mapWith("Stillwater", [{ id: "p1", name: "Stillwater", hidden: true }]);
		const [page] = listMapPages(map);
		expect(canSeeMapPage(page)).toBe(true);
		expect(isMapPageHidden(page)).toBe(true);
	});

	it("hides and shows a board for a GM", async () => {
		asGM();
		const map = mapWith("Stillwater", [{ id: "p1", name: "Stillwater" }]);
		const [page] = listMapPages(map);
		expect(await setMapPageHidden(page, true)).toBe(true);
		expect(page.updates).toEqual([{ ownership: { default: NONE } }]);
		expect(await setMapPageHidden(page, false)).toBe(true);
		expect(page.ownership.default).toBe(INHERIT);
	});

	// Nothing is written for a board that is already the way it is being asked for, so a GM pressing
	// the eye twice does not broadcast the same state to the whole table twice over.
	it("writes nothing when the board is already that way", async () => {
		asGM();
		const map = mapWith("Stillwater", [{ id: "p1", name: "Stillwater", hidden: true }]);
		const [page] = listMapPages(map);
		expect(await setMapPageHidden(page, true)).toBe(false);
		expect(page.updates).toEqual([]);
	});

	// Core's own sanitizer refuses an ownership change from anybody but a GM, so this is a rail
	// under a button that is not offered rather than a second opinion about it.
	it("refuses a player, however much of the map they own", async () => {
		asPlayer();
		expect(canHideMapPages()).toBe(false);
		const map = mapWith("Stillwater", [{ id: "p1", name: "Stillwater" }]);
		const [page] = listMapPages(map);
		expect(await setMapPageHidden(page, true)).toBe(false);
		expect(page.updates).toEqual([]);
	});

	// ⚠ THE PLACE THAT MUST NOT ASK THE VISIBLE LIST. A conversion that found no pages on a map whose
	// every board is hidden would helpfully make a fresh one and sweep the entry's flags past it.
	it("reasons about every board, and not only the ones in front of the reader", async () => {
		asPlayer();
		const map = mapWith("Stillwater", [
			{ id: "p1", name: "Stillwater", hidden: true },
			{ id: "p2", name: "Marshford", hidden: true },
		]);
		expect(await ensureFirstMapPage(map)).toBe(listMapPages(map)[0]);
		expect(listMapPages(map)).toHaveLength(2);
	});
});

// ── Naming and rubbing out a whole map ───────────────────────────────────────────
//
// The map's rows are taken out of the Journal sidebar (hooks/journal-directory-maps.js), which is
// where a GM used to rename and delete one. These two are what replaced that list, so the rules
// they keep are the whole of what is left guarding a map.

describe("naming and rubbing out a whole map", () => {
	const asGM = () => { globalThis.game.user = { id: "gm1", isGM: true }; };
	const asPlayer = () => { globalThis.game.user = { id: "u1", isGM: false }; };
	/** A map that can be deleted, which the shared fake has no call for otherwise. */
	const deletableMap = (name = "Stillwater") => {
		const map = mapWith(name, [{ id: "p1", name }]);
		map.deleted = false;
		map.delete = () => { map.deleted = true; return Promise.resolve(map); };
		return map;
	};

	it("trims a name, holds it to the bound, and never stores a blank one", () => {
		expect(relationshipMapName("  The people of Stillwater  ")).toBe("The people of Stillwater");
		expect(relationshipMapName("x".repeat(RELMAP_MAP_NAME_MAX + 20))).toHaveLength(RELMAP_MAP_NAME_MAX);
		// Core's `name` field refuses an empty string outright, so a blank has to become something.
		expect(relationshipMapName("   ")).toBe("Relationship Map");
		expect(relationshipMapName(null)).toBe("Relationship Map");
	});

	it("renames the map for anybody who may edit it", async () => {
		const map = deletableMap();
		expect(await renameRelationshipMap(map, "  Who owes whom  ")).toBe(true);
		expect(map.name).toBe("Who owes whom");
	});

	// The rule `renameMapPage` keeps, for the same reason: a reader who opens the box and saves
	// without typing must not broadcast a change to the whole table.
	it("writes nothing for a name that came back the same", async () => {
		const map = deletableMap();
		map.updates.length = 0;
		expect(await renameRelationshipMap(map, "Stillwater")).toBe(false);
		expect(map.updates).toEqual([]);
	});

	it("is refused to a reader who may not edit the map", async () => {
		const map = deletableMap();
		map.isOwner = false;
		expect(await renameRelationshipMap(map, "Mine now")).toBe(false);
		expect(map.name).toBe("Stillwater");
	});

	// ⚠ STRICTER THAN THE SERVER, and deliberately: core would take this delete from any player at
	// the table, because the map is owned by everybody so that everybody can draw on it.
	it("is a GM alone who may delete one, though every player owns it", () => {
		asPlayer();
		const map = deletableMap();
		expect(map.isOwner).toBe(true);
		expect(canDeleteRelationshipMap(map)).toBe(false);
		asGM();
		expect(canDeleteRelationshipMap(map)).toBe(true);
		expect(canDeleteRelationshipMap(null)).toBe(false);
	});

	it("deletes for a GM and refuses everybody else", async () => {
		asPlayer();
		const mine = deletableMap();
		expect(await deleteRelationshipMap(mine)).toBe(false);
		expect(mine.deleted).toBe(false);

		asGM();
		const theirs = deletableMap();
		expect(await deleteRelationshipMap(theirs)).toBe(true);
		expect(theirs.deleted).toBe(true);
	});
});

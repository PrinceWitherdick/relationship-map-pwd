import { describe, it, expect, beforeEach, vi } from "vitest";

// HOW A MAP COMES TO EXIST, and which one "open the maps" lands on.
//
// The rules asserted here are about restraint, and each fails silently in the wrong direction:
//
//  • nothing is made for a world unasked, and the window a new collection and its first map are
//    named in opens EMPTY; both are made from that one answer;
//  • a reader who may not make a map is never asked to name one;
//  • a map asked for by name or id wins, and anything else goes where this reader was last.
//
// Everything this module touches is stubbed: the document layer is proved in relmap-doc.test.js and
// the remembered board in relmap-last.test.js. What belongs here is only which calls are made, in what
// order, and under which guard.

const world = { maps: [], canCreate: true, made: { id: "made", name: "" }, pages: {}, legacy: {} };
vi.mock("../../module/relmap/relmap-doc.js", () => ({
	listRelationshipMaps: vi.fn(() => world.maps),
	resolveMapBoard: vi.fn(entry => {
		const pages = world.pages[entry.id] ?? [];
		const kind = pages.length ? "page" : world.legacy[entry.id] ? "legacy" : "none";
		return { pages, page: pages[0] ?? null, doc: pages[0] ?? null, kind };
	}),
	canCreateRelationshipMap: vi.fn(() => world.canCreate),
	createRelationshipMap: vi.fn(name => {
		if (!world.canCreate) return Promise.resolve(null);
		world.made = { id: "made", name };
		return Promise.resolve(world.made);
	}),
	createMapPage: vi.fn((entry, name) => Promise.resolve(world.pageFails ? null : { id: "page", name })),
}));

// What the reader puts in the box, and what they pick off the chooser. `null` is the window dismissed,
// which is the one answer that must never become a map.
const box = { typed: { collection: "The Court", map: "Who owes whom" }, asked: [], picked: null, offered: [] };
vi.mock("../../module/dialogs/content-picker.js", () => ({
	promptForTexts: vi.fn(args => {
		box.asked.push(args);
		return Promise.resolve(box.typed);
	}),
	pickContentOption: vi.fn(args => {
		box.offered.push(args);
		return Promise.resolve(box.picked);
	}),
}));

const last = { landing: null };
vi.mock("../../module/relmap/relmap-last.js", () => ({
	defaultBoard: vi.fn(() => last.landing),
}));

import { canCreateRelationshipMap, createMapPage, createRelationshipMap } from "../../module/relmap/relmap-doc.js";
import { pickContentOption, promptForTexts } from "../../module/dialogs/content-picker.js";
import { defaultBoard } from "../../module/relmap/relmap-last.js";
import {
	NEW_MAP_CHOICE, chooseRelationshipMap, mapToOpen, promptForNewRelationshipMap,
} from "../../module/relmap/relmap-make.js";

const court = { id: "court", name: "The Court" };
const docks = { id: "docks", name: "The Docks" };

beforeEach(() => {
	vi.clearAllMocks();
	world.maps = [];
	world.canCreate = true;
	world.made = { id: "made", name: "" };
	world.pages = {};
	world.legacy = {};
	world.pageFails = false;
	globalThis.ui = { notifications: { warn: vi.fn() } };
	box.typed = { collection: "The Court", map: "Who owes whom" };
	box.asked = [];
	box.picked = null;
	box.offered = [];
	last.landing = null;
});

describe("the map somebody asks for", () => {
	it("makes the collection under the name that was typed", async () => {
		const made = await promptForNewRelationshipMap();
		expect(createRelationshipMap).toHaveBeenCalledWith("The Court");
		expect(made).toBe(world.made);
	});

	// A collection used to arrive empty, and the window then asked for a map's name again: in a new world
	// that read as the first answer having gone nowhere. Both names are asked once, and both are made.
	it("makes the first map in it, under its own name, from the same answer", async () => {
		await promptForNewRelationshipMap();
		expect(createMapPage).toHaveBeenCalledTimes(1);
		expect(createMapPage).toHaveBeenCalledWith(world.made, "Who owes whom");
		expect(createRelationshipMap.mock.invocationCallOrder[0])
			.toBeLessThan(createMapPage.mock.invocationCallOrder[0]);
	});

	// The example names are a hint about what belongs in each field, never a value saved by Enter.
	it("asks both names in one window that opens empty, with the example names only as placeholders", async () => {
		await promptForNewRelationshipMap();
		expect(promptForTexts).toHaveBeenCalledTimes(1);
		const asked = box.asked[0];
		expect(asked.title).toBe("New relationship map");
		expect(asked.buttonLabel).toBe("Make it");
		expect(asked.lead).toMatch(/collection holds one or more maps/i);
		expect(asked.fields.map(field => [field.name, field.label, field.value ?? "", field.placeholder])).toEqual([
			["collection", "Collection", "", "The campaign, the city, the court"],
			["map", "First map", "", "The court, the docks, who owes whom"],
		]);
	});

	// The collection is there either way, and the window shows an empty one with New map to try again.
	it("keeps the collection, and says so, when its first map could not be made", async () => {
		world.pageFails = true;
		expect(await promptForNewRelationshipMap()).toBe(world.made);
		expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
		// Not the New map warning, which blames a lost permission on a collection the reader just made.
		expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringMatching(/collection was made/i));
		expect(ui.notifications.warn.mock.calls[0][0]).not.toMatch(/permission/i);
	});

	// A throw let through would leave the collection made and no window opened on it.
	it("keeps the collection, and says so, when making its first map throws", async () => {
		const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
		createMapPage.mockRejectedValueOnce(new Error("refused"));
		expect(await promptForNewRelationshipMap()).toBe(world.made);
		expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
		expect(quiet).toHaveBeenCalled();
		quiet.mockRestore();
	});

	// Taken rather than refused, exactly as an empty board name is: both can be renamed from the window,
	// and a dialog that rejects a save over a blank field has to explain itself. The names given instead
	// are the document layer's to choose, through the rule a rename keeps.
	it("makes both when nothing was typed, and leaves naming the blanks to the document layer", async () => {
		box.typed = { collection: "", map: "" };
		await promptForNewRelationshipMap();
		expect(createRelationshipMap).toHaveBeenCalledWith("");
		expect(createMapPage).toHaveBeenCalledWith(world.made, "");
	});

	it("makes nothing when the box is dismissed", async () => {
		box.typed = null;
		expect(await promptForNewRelationshipMap()).toBeNull();
		expect(createRelationshipMap).not.toHaveBeenCalled();
		expect(createMapPage).not.toHaveBeenCalled();
	});

	it("makes no map when the collection could not be made", async () => {
		createRelationshipMap.mockResolvedValueOnce(null);
		expect(await promptForNewRelationshipMap()).toBeNull();
		expect(createMapPage).not.toHaveBeenCalled();
	});

	// Making a map and editing one are different rights. Asking somebody to name a map they may not make
	// is a dialog whose only outcome is a refusal.
	it("never asks somebody who may not make a map", async () => {
		world.canCreate = false;
		expect(await promptForNewRelationshipMap()).toBeNull();
		expect(canCreateRelationshipMap).toHaveBeenCalled();
		expect(promptForTexts).not.toHaveBeenCalled();
	});

	// The box is not modal. Two presses on the sidebar button in a world with no collection yet would
	// each open one, and each could make a collection under the same name.
	it("opens one box, and makes one collection, however often it is asked for while that box is up", async () => {
		const [first, second] = await Promise.all([
			promptForNewRelationshipMap(), promptForNewRelationshipMap(),
		]);
		expect(promptForTexts).toHaveBeenCalledTimes(1);
		expect(createRelationshipMap).toHaveBeenCalledTimes(1);
		expect(createMapPage).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});

	it("asks again once the first box has been answered", async () => {
		await promptForNewRelationshipMap();
		await promptForNewRelationshipMap();
		expect(promptForTexts).toHaveBeenCalledTimes(2);
	});
});

describe("which map an open lands on", () => {
	it("goes to a map named by its id, without asking where the reader was", () => {
		world.maps = [court, docks];
		expect(mapToOpen("docks")).toEqual({ entry: docks, pageId: null });
		expect(defaultBoard).not.toHaveBeenCalled();
	});

	it("goes to a map named by its name", () => {
		world.maps = [court, docks];
		expect(mapToOpen("The Court")).toEqual({ entry: court, pageId: null });
	});

	it("goes where this reader was last when nothing is named, or the name matches no map", () => {
		world.maps = [court, docks];
		last.landing = { entry: docks, pageId: "p2" };
		expect(mapToOpen()).toEqual({ entry: docks, pageId: "p2" });
		expect(mapToOpen("The Sewers")).toEqual({ entry: docks, pageId: "p2" });
	});

	it("answers null in a world with no maps, so the caller can offer to make one", () => {
		expect(mapToOpen()).toBeNull();
	});
});

describe("choosing a map", () => {
	it("offers every map, starting on the one the reader is on, and a row to make another", async () => {
		world.maps = [court, docks];
		world.pages = { court: [{ id: "a" }, { id: "b" }], docks: [{ id: "c" }] };
		box.picked = "docks";
		expect(await chooseRelationshipMap({ current: "court" })).toBe(docks);
		const offer = box.offered[0];
		expect(offer.selected).toBe("court");
		expect(offer.options.map(row => row.id)).toEqual(["court", "docks", NEW_MAP_CHOICE]);
		expect(offer.options[0].hint).toBe("2 map(s)");
	});

	// Nothing is made for a collection any more, so one with no maps in it is ordinary, and it says so
	// rather than claiming the map every collection used to arrive with.
	it("counts a collection with no maps in it as having none", async () => {
		world.maps = [court];
		await chooseRelationshipMap();
		expect(box.offered[0].options[0].hint).toBe("0 map(s)");
	});

	it("counts a version 1 board, which has no page behind it, as one map", async () => {
		world.maps = [court];
		world.legacy = { court: true };
		await chooseRelationshipMap();
		expect(box.offered[0].options[0].hint).toBe("1 map(s)");
	});

	it("leaves the make-a-map row off for somebody who may not make one", async () => {
		world.maps = [court];
		world.canCreate = false;
		await chooseRelationshipMap();
		expect(box.offered[0].options.map(row => row.id)).toEqual(["court"]);
	});

	it("asks what the new map is called when that row is picked", async () => {
		world.maps = [court];
		box.picked = NEW_MAP_CHOICE;
		expect(await chooseRelationshipMap()).toBe(world.made);
		expect(promptForTexts).toHaveBeenCalledTimes(1);
		expect(createMapPage).toHaveBeenCalledTimes(1);
	});

	// The chooser is not modal. A collection the GM deleted while it was up is still in the list it was
	// built from, and opened from there the window comes up over a document that no longer exists.
	it("opens nothing for a collection deleted while the chooser was up", async () => {
		world.maps = [court, docks];
		box.picked = "docks";
		pickContentOption.mockImplementationOnce(args => {
			box.offered.push(args);
			world.maps = [court];
			return Promise.resolve(box.picked);
		});
		expect(await chooseRelationshipMap()).toBeNull();
	});

	it("opens nothing when the chooser is dismissed", async () => {
		world.maps = [court];
		expect(await chooseRelationshipMap()).toBeNull();
	});

	it("asks nothing at all when there is no map to open and none may be made", async () => {
		world.canCreate = false;
		expect(await chooseRelationshipMap()).toBeNull();
		expect(pickContentOption).not.toHaveBeenCalled();
	});
});

import { describe, it, expect, beforeEach, vi } from "vitest";

// HOW A MAP COMES TO EXIST, and which one "open the maps" lands on.
//
// The rules asserted here are about restraint, and each fails silently in the wrong direction:
//
//  • a world's first map is made without a question, and only once however many times it is asked for;
//  • every map after it is named in a box that opens EMPTY;
//  • a reader who may not make a map is never asked to name one;
//  • a map asked for by name or id wins, and anything else goes where this reader was last.
//
// Everything this module touches is stubbed: the document layer is proved in relmap-doc.test.js and
// the remembered board in relmap-last.test.js. What belongs here is only which calls are made, in what
// order, and under which guard.

const world = { maps: [], canCreate: true, made: { id: "made", name: "" }, pages: {} };
vi.mock("../../module/relmap/relmap-doc.js", () => ({
	listRelationshipMaps: vi.fn(() => world.maps),
	listVisibleMapPages: vi.fn(entry => world.pages[entry.id] ?? []),
	canCreateRelationshipMap: vi.fn(() => world.canCreate),
	createRelationshipMap: vi.fn(name => {
		if (!world.canCreate) return Promise.resolve(null);
		world.made = { id: "made", name };
		return Promise.resolve(world.made);
	}),
}));

// What the reader puts in the box, and what they pick off the chooser. `null` is the window dismissed,
// which is the one answer that must never become a map.
const box = { typed: "The Court", asked: [], picked: null, offered: [] };
vi.mock("../../module/dialogs/content-picker.js", () => ({
	promptForText: vi.fn(args => {
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

import { canCreateRelationshipMap, createRelationshipMap } from "../../module/relmap/relmap-doc.js";
import { pickContentOption, promptForText } from "../../module/dialogs/content-picker.js";
import { defaultBoard } from "../../module/relmap/relmap-last.js";
import {
	NEW_MAP_CHOICE, chooseRelationshipMap, makeFirstRelationshipMap, mapToOpen, promptForNewRelationshipMap,
} from "../../module/relmap/relmap-make.js";

const court = { id: "court", name: "The Court" };
const docks = { id: "docks", name: "The Docks" };

beforeEach(() => {
	vi.clearAllMocks();
	world.maps = [];
	world.canCreate = true;
	world.made = { id: "made", name: "" };
	world.pages = {};
	box.typed = "The Court";
	box.asked = [];
	box.picked = null;
	box.offered = [];
	last.landing = null;
});

describe("a world's first map", () => {
	// Pressing the sidebar button in a world with no maps is the asking. The party seats itself on its
	// own board as the window opens, so a name box in front of the first map only delayed the board.
	it("is made under the plain name without asking anything", async () => {
		const made = await makeFirstRelationshipMap();
		expect(promptForText).not.toHaveBeenCalled();
		expect(createRelationshipMap).toHaveBeenCalledWith("Relationship Map");
		expect(made).toBe(world.made);
	});

	it("is not made by somebody who may not make a map", async () => {
		world.canCreate = false;
		expect(await makeFirstRelationshipMap()).toBeNull();
		expect(createRelationshipMap).not.toHaveBeenCalled();
	});

	// The name box used to swallow a double-click. Without it, two presses inside one round trip would
	// both find no map, and the world would start with two.
	it("is made once when the button is pressed twice before the first create comes back", async () => {
		const [first, second] = await Promise.all([makeFirstRelationshipMap(), makeFirstRelationshipMap()]);
		expect(createRelationshipMap).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});

	it("can be made again once the first create has come back", async () => {
		await makeFirstRelationshipMap();
		await makeFirstRelationshipMap();
		expect(createRelationshipMap).toHaveBeenCalledTimes(2);
	});
});

describe("the map somebody asks for", () => {
	it("makes it under the name that was typed", async () => {
		const made = await promptForNewRelationshipMap();
		expect(createRelationshipMap).toHaveBeenCalledWith("The Court");
		expect(made).toBe(world.made);
	});

	// The example names are a hint about what belongs in the field, never a value saved by Enter.
	it("opens the box empty, with the example names only as its placeholder", async () => {
		await promptForNewRelationshipMap();
		expect(promptForText).toHaveBeenCalledTimes(1);
		const asked = box.asked[0];
		expect(asked.value ?? "").toBe("");
		expect(asked.placeholder).toBe("The party, the court, who owes whom");
		expect(asked.title).toBe("What is this map called?");
		expect(asked.buttonLabel).toBe("Make the map");
	});

	// Taken rather than refused, exactly as an empty board name is: the map can be renamed from its own
	// window, and a dialog that rejects a save over a blank field has to explain itself.
	it("falls back to a plain name when nothing was typed", async () => {
		box.typed = "";
		await promptForNewRelationshipMap();
		expect(createRelationshipMap).toHaveBeenCalledWith("Relationship Map");
	});

	it("makes nothing when the box is dismissed", async () => {
		box.typed = null;
		expect(await promptForNewRelationshipMap()).toBeNull();
		expect(createRelationshipMap).not.toHaveBeenCalled();
	});

	// Making a map and editing one are different rights. Asking somebody to name a map they may not make
	// is a dialog whose only outcome is a refusal.
	it("never asks somebody who may not make a map", async () => {
		world.canCreate = false;
		expect(await promptForNewRelationshipMap()).toBeNull();
		expect(canCreateRelationshipMap).toHaveBeenCalled();
		expect(promptForText).not.toHaveBeenCalled();
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
		expect(offer.options[0].hint).toBe("2 board(s)");
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
		expect(promptForText).toHaveBeenCalledTimes(1);
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

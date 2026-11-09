import { describe, it, expect, beforeEach, vi } from "vitest";

import {
	changedSavedFace, everyBoard, freshFacePatch, keepDeadChipsCurrent, keepSavedFacesCurrent, sweepStaleFaces,
} from "../../module/relmap/relmap-faces.js";
import { readGraph } from "../../module/relmap/relmap-doc.js";
import { deathEffectActor, isDeadActor } from "../../module/relmap/relmap-dead.js";

// Each person on a board keeps a saved copy of their name and picture, shown only once their actor is
// deleted. A rename or new art has to reach that copy on every board, written by exactly one client.

const OWNER = 3;
const INHERIT = -1;
const NONE = 0;

function applyDotted(doc, patch) {
	for (const [path, value] of Object.entries(patch ?? {})) {
		const parts = path.split(".");
		const leaf = parts.pop();
		let at = doc;
		for (const part of parts) {
			if (at[part] === null || typeof at[part] !== "object") at[part] = {};
			at = at[part];
		}
		// A deletion in either core's spelling (utils/foundry-compat.js `deletionEntry`).
		if (leaf.startsWith("-=")) delete at[leaf.slice(2)];
		else if (value?.constructor?.name === "ForcedDeletion") delete at[leaf];
		else at[leaf] = value;
	}
}

/** A board page. `hidden` is a board the GM kept back: players cannot write it. */
function page(name, nodes, { parent, hidden = false } = {}) {
	const flags = { "relationship-map-pwd": { relationshipMap: { version: 2, nodes, edges: {} } } };
	const doc = {
		name, parent, flags, updates: [],
		ownership: { default: hidden ? NONE : INHERIT },
		getFlag: (scope, key) => flags[scope]?.[key] ?? null,
		testUserPermission(user, permission) {
			if (user?.isGM) return true;
			const level = doc.ownership[user?.id] ?? doc.ownership.default;
			if (level === INHERIT) return true;
			return level >= (permission === "OWNER" ? OWNER : 2);
		},
		get isOwner() { return doc.testUserPermission(game.user, "OWNER"); },
		update(patch) { doc.updates.push(patch); applyDotted(doc, patch); return Promise.resolve(doc); },
	};
	return doc;
}

function map(name, boards = [], legacy = null) {
	const pages = [];
	const flags = { "relationship-map-pwd": { relationshipMap: legacy ?? { version: 2 } } };
	const entry = {
		name, flags, updates: [],
		pages: { get contents() { return pages; } },
		getFlag: (scope, key) => flags[scope]?.[key] ?? null,
		get isOwner() { return true; },
		testUserPermission: () => true,
		update(patch) { entry.updates.push(patch); applyDotted(entry, patch); return Promise.resolve(entry); },
	};
	for (const b of boards) pages.push(page(b.name, b.nodes, { parent: entry, hidden: b.hidden }));
	return entry;
}

const ELROY = "Actor.elroy";
const node = (uuid, name, img = "old.webp", extra = {}) => ({ uuid, name, img, x: 50, y: 50, ...extra });
const renamed = (name = "Lord Elroy the Bold", img = "old.webp") => ({ uuid: ELROY, name, img });

const PLAYER = { id: "p1", isGM: false, active: true };
const GM = { id: "gm", isGM: true, active: true };

let journals;
function asUser(user) {
	globalThis.game.user = user;
}

beforeEach(() => {
	journals = [];
	globalThis.game = {
		...globalThis.game,
		user: PLAYER,
		users: Object.assign([GM, PLAYER], { activeGM: GM, get: id => [GM, PLAYER].find(u => u.id === id) }),
		journal: { get contents() { return journals; } },
	};
});

describe("which actor changes reach the saved copy", () => {
	it("is a name or a picture, and nothing else", () => {
		expect(changedSavedFace({ name: "x" })).toBe(true);
		expect(changedSavedFace({ img: "x.webp" })).toBe(true);
		expect(changedSavedFace({ system: { hp: { value: 3 } } })).toBe(false);
		// The crop is read live off the actor and never saved on the node.
		expect(changedSavedFace({ flags: { "relationship-map-pwd": { portraitFrame: {} } } })).toBe(false);
		expect(changedSavedFace(null)).toBe(false);
	});
});

describe("the patch that refreshes one board", () => {
	const graph = nodes => readGraph({ getFlag: () => ({ nodes, edges: {} }) });

	it("writes only the fields that differ, for every node standing for that actor", () => {
		const g = graph({ a: node(ELROY, "Lord Elroy"), b: node(ELROY, "Lord Elroy", "new.webp"), c: node("Actor.vera", "Vera") });
		const patch = freshFacePatch(g, ELROY, { name: "Lord Elroy the Bold", img: "new.webp" });
		expect(patch).toEqual({
			"flags.relationship-map-pwd.relationshipMap.nodes.a.name": "Lord Elroy the Bold",
			"flags.relationship-map-pwd.relationshipMap.nodes.a.img": "new.webp",
			"flags.relationship-map-pwd.relationshipMap.nodes.b.name": "Lord Elroy the Bold",
		});
	});

	it("is null when the copy already matches, or the actor is not on the board", () => {
		const g = graph({ a: node(ELROY, "Lord Elroy") });
		expect(freshFacePatch(g, ELROY, { name: "Lord Elroy", img: "old.webp" })).toBeNull();
		expect(freshFacePatch(g, "Actor.nobody", { name: "X", img: "" })).toBeNull();
	});

	it("never writes a blank name over a good one", () => {
		const g = graph({ a: node(ELROY, "Lord Elroy") });
		expect(freshFacePatch(g, ELROY, { name: "", img: "old.webp" })).toBeNull();
	});

	it("keeps the label and the place", () => {
		const g = graph({ a: node(ELROY, "Lord Elroy", "old.webp", { subtitle: "Iron Knight", x: 20 }) });
		const patch = freshFacePatch(g, ELROY, { name: "Elroy", img: "old.webp" });
		expect(Object.keys(patch)).toEqual(["flags.relationship-map-pwd.relationshipMap.nodes.a.name"]);
	});
});

describe("every board in the world", () => {
	it("is each map's pages, hidden ones included, and a version 1 map's own entry", () => {
		const shown = map("Village", [{ name: "Home", nodes: {} }, { name: "Secret", nodes: {}, hidden: true }]);
		const legacy = map("Old", [], { nodes: { a: node(ELROY, "Lord Elroy") }, edges: {} });
		const empty = map("Empty");
		journals.push(shown, legacy, empty, { name: "Notes", getFlag: () => null });
		// In no order that matters: every caller walks them all for their data.
		const boards = everyBoard();
		expect(boards.map(b => b.name).sort()).toEqual(["Home", "Old", "Secret"]);
	});
});

describe("a rename or new art", () => {
	let village;
	let home;
	let secret;
	beforeEach(() => {
		village = map("Village", [
			{ name: "Home", nodes: { a: node(ELROY, "Lord Elroy"), v: node("Actor.vera", "Vera") } },
			{ name: "Secret", nodes: { s: node(ELROY, "Lord Elroy") }, hidden: true },
		]);
		[home, secret] = village.pages.contents;
		journals.push(village);
	});

	it("is written by the client that made it, to every board it may edit", async () => {
		asUser(PLAYER);
		const wrote = await keepSavedFacesCurrent(renamed(), { name: "Lord Elroy the Bold" }, {}, PLAYER.id);
		expect(wrote).toBe(1);
		expect(readGraph(home).nodes.a.name).toBe("Lord Elroy the Bold");
		expect(readGraph(home).nodes.v.name).toBe("Vera");
		expect(home.updates).toHaveLength(1);
		expect(secret.updates).toHaveLength(0);
	});

	it("leaves the primary GM to write the boards that client could not", async () => {
		asUser(GM);
		const wrote = await keepSavedFacesCurrent(renamed(), { name: "Lord Elroy the Bold" }, {}, PLAYER.id);
		expect(wrote).toBe(1);
		expect(home.updates).toHaveLength(0);
		expect(readGraph(secret).nodes.s.name).toBe("Lord Elroy the Bold");
	});

	it("is written once in all when the GM made it", async () => {
		asUser(GM);
		expect(await keepSavedFacesCurrent(renamed("Elroy", "new.webp"), { img: "new.webp" }, {}, GM.id)).toBe(2);
		expect(readGraph(home).nodes.a.img).toBe("new.webp");
		expect(readGraph(secret).nodes.s.img).toBe("new.webp");
	});

	it("is not written by a player who did not make it, nor by a GM who is not the primary one", async () => {
		asUser(PLAYER);
		expect(await keepSavedFacesCurrent(renamed(), { name: "x" }, {}, "someone-else")).toBe(0);
		const other = { id: "gm2", isGM: true, active: true };
		asUser(other);
		expect(await keepSavedFacesCurrent(renamed(), { name: "x" }, {}, PLAYER.id)).toBe(0);
		expect(home.updates).toHaveLength(0);
		expect(secret.updates).toHaveLength(0);
	});

	it("does nothing for a change no saved copy holds", async () => {
		asUser(GM);
		expect(await keepSavedFacesCurrent(renamed(), { system: { hp: 3 } }, {}, GM.id)).toBe(0);
		expect(home.updates).toHaveLength(0);
	});

	it("reports a refused write rather than throwing", async () => {
		asUser(GM);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		home.update = () => Promise.reject(new Error("refused"));
		expect(await keepSavedFacesCurrent(renamed(), { name: "x" }, {}, GM.id)).toBe(1);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe("the primary GM's sweep on load", () => {
	const actors = {
		[ELROY]: { documentName: "Actor", name: "Lord Elroy the Bold", img: "new.webp" },
		"Actor.vera": { documentName: "Actor", name: "Vera", img: "old.webp" },
	};
	const resolve = uuid => actors[uuid] ?? null;

	it("brings every stale copy up to its actor in one write per board, and leaves the rest", async () => {
		asUser(GM);
		const village = map("Village", [
			{ name: "Home", nodes: { a: node(ELROY, "Lord Elroy"), v: node("Actor.vera", "Vera"), g: node("Actor.gone", "Simon") } },
			{ name: "Fine", nodes: { v: node("Actor.vera", "Vera") } },
		]);
		journals.push(village);
		expect(await sweepStaleFaces({ resolve })).toBe(1);
		const [home, fine] = village.pages.contents;
		expect(home.updates).toHaveLength(1);
		expect(readGraph(home).nodes.a).toMatchObject({ name: "Lord Elroy the Bold", img: "new.webp" });
		// A deleted actor keeps the copy it has: that is what the copy is for.
		expect(readGraph(home).nodes.g.name).toBe("Simon");
		expect(fine.updates).toHaveLength(0);
	});

	it("skips compendium people and anything that is not an actor", async () => {
		asUser(GM);
		const village = map("Village", [{ name: "Home", nodes: {
			c: node("Compendium.x.Actor.y", "Old"), i: node("Actor.index", "Old"),
		} }]);
		journals.push(village);
		const look = vi.fn(uuid => (uuid === "Actor.index" ? { name: "New", img: "" } : actors[uuid]));
		expect(await sweepStaleFaces({ resolve: look })).toBe(0);
		expect(look).not.toHaveBeenCalledWith("Compendium.x.Actor.y", expect.anything());
	});

	// The same person stands on several boards, and on several spots of one: looked up once.
	it("looks each actor up once for the whole sweep, and writes every board it needs to", async () => {
		asUser(GM);
		const village = map("Village", [
			{ name: "Home", nodes: { a: node(ELROY, "Lord Elroy"), b: node(ELROY, "Lord Elroy") } },
			{ name: "Away", nodes: { a: node(ELROY, "Lord Elroy"), v: node("Actor.vera", "Vera") } },
		]);
		journals.push(village);
		const look = vi.fn(resolve);
		expect(await sweepStaleFaces({ resolve: look })).toBe(2);
		expect(look.mock.calls.filter(([uuid]) => uuid === ELROY)).toHaveLength(1);
		const [home, away] = village.pages.contents;
		expect(home.updates).toHaveLength(1);
		expect(readGraph(home).nodes.b.name).toBe("Lord Elroy the Bold");
		expect(readGraph(away).nodes.a.name).toBe("Lord Elroy the Bold");
	});

	it("runs only on the primary GM", async () => {
		const village = map("Village", [{ name: "Home", nodes: { a: node(ELROY, "Lord Elroy") } }]);
		journals.push(village);
		asUser(PLAYER);
		expect(await sweepStaleFaces({ resolve })).toBe(0);
		asUser({ id: "gm2", isGM: true, active: true });
		expect(await sweepStaleFaces({ resolve })).toBe(0);
		expect(village.pages.contents[0].updates).toHaveLength(0);
	});
});

// THE DEAD CHIP FOLLOWS A DEATH (relmap/relmap-dead.js): somebody marked with core's Defeated status
// gets it on every board they stand on, somebody brought back loses it, by the same one-writer rule as
// the saved faces.
describe("a death or a return", () => {
	const defeated = (on = true) => ({ statuses: new Set(["dead"]), disabled: !on });
	const elroy = (dead = true) => ({ uuid: ELROY, type: "character", name: "Lord Elroy", effects: dead ? [defeated()] : [] });
	let home;
	let secret;
	beforeEach(() => {
		const village = map("Village", [
			{ name: "Home", nodes: { a: node(ELROY, "Lord Elroy"), v: node("Actor.vera", "Vera") } },
			{ name: "Secret", nodes: { s: node(ELROY, "Lord Elroy") }, hidden: true },
		]);
		[home, secret] = village.pages.contents;
		journals.push(village);
	});

	it("puts Dead on them, defining it on a board that has never had it, and on nobody else", async () => {
		asUser(GM);
		const wrote = await keepDeadChipsCurrent(elroy(), GM.id);
		expect(wrote).toBe(2);
		expect(readGraph(home).chips.dead).toMatchObject({ icon: "fa-skull", ink: "crimson" });
		expect(readGraph(home).nodes.a.chips).toEqual({ dead: true });
		expect(readGraph(home).nodes.v.chips).toEqual({});
		expect(readGraph(secret).nodes.s.chips).toEqual({ dead: true });
	});

	it("takes it off again when they come back, and writes nothing a second time", async () => {
		asUser(GM);
		await keepDeadChipsCurrent(elroy(), GM.id);
		expect(await keepDeadChipsCurrent(elroy(), GM.id)).toBe(0);
		expect(await keepDeadChipsCurrent(elroy(false), GM.id)).toBe(2);
		expect(readGraph(home).nodes.a.chips).toEqual({});
		// The chip stays on the board for the next person.
		expect(readGraph(home).chips.dead).toBeTruthy();
	});

	it("follows the one-writer rule: the player who made it writes the boards they may", async () => {
		asUser(PLAYER);
		expect(await keepDeadChipsCurrent(elroy(), PLAYER.id)).toBe(1);
		expect(secret.updates).toHaveLength(0);
	});

	it("leaves the boards alone while the primary GM is not the one who made the change", async () => {
		asUser({ id: "gm2", isGM: true, active: true });
		expect(await keepDeadChipsCurrent(elroy(), GM.id)).toBe(0);
		expect(home.updates).toHaveLength(0);
	});

	it("counts a switched-off effect as no death", async () => {
		asUser(GM);
		const vera = { uuid: "Actor.vera", type: "npc", name: "Vera", effects: [defeated(false)] };
		expect(await keepDeadChipsCurrent(vera, GM.id)).toBe(0);
		expect(readGraph(home).nodes.v.chips).toEqual({});
	});
});

// WHICH EFFECT CHANGES ARE A DEATH (relmap/relmap-dead.js `deathEffectActor`), as the ready hook asks.
describe("an effect that could be a death", () => {
	const actor = { documentName: "Actor", uuid: ELROY };
	const effect = (statuses, parent = actor) => ({ parent, statuses: new Set(statuses), disabled: false });

	it("is one holding the Defeated status, on an actor or on an item the actor carries", () => {
		expect(deathEffectActor(effect(["dead"]))).toBe(actor);
		expect(deathEffectActor(effect(["dead"], { documentName: "Item", parent: actor }))).toBe(actor);
	});

	it("is an update that changed what an effect marks, whatever it marks now, or switched a Defeated one", () => {
		expect(deathEffectActor(effect([]), { statuses: [] })).toBe(actor);
		expect(deathEffectActor(effect(["dead"]), { disabled: true })).toBe(actor);
		// Switching an effect that never held the status cannot change anyone's death.
		expect(deathEffectActor(effect(["prone"]), { disabled: true })).toBeNull();
		expect(deathEffectActor(effect(["prone"]), { name: "Down" })).toBeNull();
	});

	it("is never one on an item nobody carries, or with nothing to do with death", () => {
		expect(deathEffectActor(effect(["dead"], { documentName: "Item", parent: null }))).toBeNull();
		expect(deathEffectActor(effect(["prone"]))).toBeNull();
		expect(deathEffectActor(null)).toBeNull();
	});

	it("reads the system's own Defeated status where it names one", () => {
		const was = globalThis.CONFIG;
		globalThis.CONFIG = { ...was, specialStatusEffects: { DEFEATED: "defeated" } };
		try {
			expect(deathEffectActor(effect(["defeated"]))).toBe(actor);
			expect(deathEffectActor(effect(["dead"]))).toBeNull();
			expect(isDeadActor({ effects: [{ statuses: new Set(["defeated"]) }] })).toBe(true);
		} finally {
			globalThis.CONFIG = was;
		}
	});

	it("reads an actor's death off its effects, item effects included", () => {
		const statuses = new Set(["dead"]);
		expect(isDeadActor({ allApplicableEffects: () => [{ statuses }] })).toBe(true);
		expect(isDeadActor({ effects: [{ statuses, disabled: true }] })).toBe(false);
		expect(isDeadActor(null)).toBe(false);
	});
});

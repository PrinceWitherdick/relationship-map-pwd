import { describe, it, expect } from "vitest";
import {
	RELMAP_DEAD_CHIP, deadArrivalPatch, deadChipPatch, isDeadActor, seatPatch,
} from "../../module/relmap/relmap-dead.js";
import { addNodesPatch, normalizeGraph, relmapPath } from "../../module/relmap/relmap-store.js";

// THE DEAD CHIP, PUT ON BY THE ACTOR: who counts as dead (core's Defeated status), and the patches
// that put it on a newcomer or bring a whole board in line. The hook's half, and which effect changes
// count, are relmap-faces.test.js's.

const effect = (statuses, disabled = false) => ({ statuses: new Set(statuses), disabled });
const actor = (...effects) => ({ type: "character", effects });
const dead = () => actor(effect(["dead"]));
const living = () => actor();

describe("who is dead", () => {
	it("is an actor with an enabled effect holding the Defeated status", () => {
		expect(isDeadActor(dead())).toBe(true);
		expect(isDeadActor(actor(effect(["prone"]), effect(["dead"])))).toBe(true);
		expect(isDeadActor(actor(effect(["dead"], true)))).toBe(false);
		expect(isDeadActor(actor(effect(["prone"])))).toBe(false);
		expect(isDeadActor(living())).toBe(false);
	});

	it("is not an actor whose only Defeated effect is suppressed, an unequipped item's", () => {
		expect(isDeadActor(actor({ ...effect(["dead"]), isSuppressed: true }))).toBe(false);
	});

	it("reads a status list given as an array, as a document's source holds it", () => {
		expect(isDeadActor({ effects: [{ statuses: ["dead"] }] })).toBe(true);
	});

	it("is nothing that cannot say", () => {
		expect(isDeadActor(null)).toBe(false);
		expect(isDeadActor({})).toBe(false);
		expect(isDeadActor({ allApplicableEffects: () => { throw new Error("half-built"); } })).toBe(false);
	});
});

describe("a dead newcomer", () => {
	const actors = { "Actor.d": dead(), "Actor.l": living() };
	const resolve = uuid => actors[uuid] ?? null;
	const arriving = { n1: { uuid: "Actor.d" }, n2: { uuid: "Actor.l" }, n3: { name: "A plain circle" } };

	it("arrives wearing Dead, the chip defined on a board that has never had it", () => {
		const patch = deadArrivalPatch(normalizeGraph({}), arriving, { resolve });
		expect(patch[relmapPath("nodes", "n1", "chips", RELMAP_DEAD_CHIP)]).toBe(true);
		expect(Object.keys(patch).some(key => key.includes(".n2.") || key.includes(".n3."))).toBe(false);
		expect(patch[relmapPath("chips", RELMAP_DEAD_CHIP, "icon")]).toBe("fa-skull");
	});

	it("leaves a board's own Dead alone (it may have been recoloured)", () => {
		const graph = normalizeGraph({ chips: { dead: { name: "Fallen", icon: "fa-ghost", ink: "slate" } } });
		const patch = deadArrivalPatch(graph, arriving, { resolve });
		expect(Object.keys(patch)).toEqual([relmapPath("nodes", "n1", "chips", RELMAP_DEAD_CHIP)]);
	});

	it("writes nothing when nobody arriving is dead", () => {
		expect(deadArrivalPatch(normalizeGraph({}), { n2: { uuid: "Actor.l" } }, { resolve })).toEqual({});
	});

	it("is part of the one write that seats them, so no seating can leave it out", () => {
		const seating = { n1: { uuid: "Actor.d", name: "D" }, n2: { uuid: "Actor.l", name: "L" } };
		const patch = seatPatch(normalizeGraph({}), seating, { resolve });
		expect(patch).toMatchObject(addNodesPatch(seating));
		expect(patch[relmapPath("nodes", "n1", "chips", RELMAP_DEAD_CHIP)]).toBe(true);
		expect(patch[relmapPath("chips", RELMAP_DEAD_CHIP, "name")]).toBeTruthy();
		// Seating only the living writes nothing about the chip.
		expect(seatPatch(normalizeGraph({}), { n2: seating.n2 }, { resolve })).toEqual(addNodesPatch({ n2: seating.n2 }));
		expect(seatPatch(normalizeGraph({}), {}, { resolve })).toEqual({});
	});
});

describe("bringing a board in line with one death", () => {
	const board = normalizeGraph({
		nodes: { a: { uuid: "Actor.d", name: "D" }, b: { uuid: "Actor.d", name: "D again" }, c: { uuid: "Actor.x", name: "X", chips: { dead: true } } },
		chips: { dead: { name: "Dead", icon: "fa-skull", ink: "crimson" } },
	});

	it("puts Dead on everyone standing for them who lacks it, and touches nobody else", () => {
		const patch = deadChipPatch(board, "Actor.d", true);
		expect(Object.keys(patch).sort()).toEqual([
			relmapPath("nodes", "a", "chips", "dead"), relmapPath("nodes", "b", "chips", "dead"),
		]);
	});

	it("takes it off when they are not dead, and does nothing when nothing differs", () => {
		const off = deadChipPatch(board, "Actor.x", false);
		expect(Object.keys(off).some(key => key.includes(".c.chips."))).toBe(true);
		expect(deadChipPatch(board, "Actor.x", true)).toBeNull();
		expect(deadChipPatch(board, "Actor.d", false)).toBeNull();
	});
});

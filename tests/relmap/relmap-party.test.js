import { describe, it, expect } from "vitest";
import { partyBoardPlan } from "../../module/relmap/relmap-party.js";
import { emptyGraph } from "../../module/relmap/relmap-store.js";

// "The Party": who the board seats, and what it writes down so that taking somebody off sticks.
//
// Pure: the document layer that writes the plan (and marks the map, and never makes a deleted board
// twice) is proved in relmap-doc.test.js.

/** An id minter that answers the same way every run. */
const ids = () => {
	let n = 0;
	return () => `n${++n}`;
};

const pc = name => ({ id: name.toLowerCase(), uuid: `Actor.${name.toLowerCase()}`, name, img: `${name}.webp` });
const aerin = pc("Aerin");
const bram = pc("Bram");
const cass = pc("Cass");

/** A board with these people already standing on it, at these spots. */
function boardWith(people) {
	const graph = emptyGraph();
	people.forEach(([person, x, y], i) => {
		graph.nodes[`k${i + 1}`] = { uuid: person.uuid, name: person.name, img: "", x, y, note: "" };
	});
	return graph;
}

describe("seating the party", () => {
	it("seats every player character on an empty board, in the order given, on the board", () => {
		const plan = partyBoardPlan(emptyGraph(), [aerin, bram, cass], {}, ids());
		expect(plan.addedPeople).toBe(3);
		expect(Object.keys(plan.nodes)).toEqual(["n1", "n2", "n3"]);
		expect(Object.values(plan.nodes).map(node => node.name)).toEqual(["Aerin", "Bram", "Cass"]);
		for (const node of Object.values(plan.nodes)) {
			expect(node.x).toBeGreaterThanOrEqual(0);
			expect(node.x).toBeLessThanOrEqual(100);
			expect(node.y).toBeGreaterThanOrEqual(0);
			expect(node.y).toBeLessThanOrEqual(100);
		}
	});

	it("writes down everybody it seats", () => {
		const plan = partyBoardPlan(emptyGraph(), [aerin, bram], {}, ids());
		expect(plan.seated).toEqual([aerin.uuid, bram.uuid]);
	});

	// It only ever ADDS: a board the table arranged is not re-seated underneath them.
	it("leaves somebody already standing on the board exactly where they are", () => {
		const graph = boardWith([[aerin, 10, 10]]);
		const plan = partyBoardPlan(graph, [aerin, bram], { seated: [aerin.uuid] }, ids());
		expect(plan.addedPeople).toBe(1);
		expect(Object.values(plan.nodes).map(node => node.uuid)).toEqual([bram.uuid]);
		expect(plan.nodes.k1).toBeUndefined();
	});

	// ⚠ THE LEDGER IS THE FEATURE. Who counts as a player character is a guess in a module that knows
	// nothing about the system, so a guess that included one actor too many must cost one removal, once.
	it("does not bring back somebody the table took off", () => {
		const plan = partyBoardPlan(emptyGraph(), [aerin, bram], { seated: [aerin.uuid, bram.uuid] }, ids());
		expect(plan.addedPeople).toBe(0);
		expect(plan.nodes).toEqual({});
		expect(plan.seated).toEqual([aerin.uuid, bram.uuid]);
	});

	it("accounts for a party member the table put on by hand, so taking them off sticks too", () => {
		const plan = partyBoardPlan(boardWith([[cass, 40, 40]]), [cass], { seated: [] }, ids());
		expect(plan.addedPeople).toBe(0);
		expect(plan.seated).toEqual([cass.uuid]);
	});

	it("seats a newcomer into the space left, without moving anybody already placed", () => {
		const graph = boardWith([[aerin, 20, 30], [bram, 70, 60]]);
		const plan = partyBoardPlan(graph, [aerin, bram, cass], { seated: [aerin.uuid, bram.uuid] }, ids());
		expect(Object.keys(plan.nodes)).toEqual(["n1"]);
		expect(plan.nodes.n1.uuid).toBe(cass.uuid);
		for (const other of Object.values(graph.nodes)) {
			expect(Math.hypot(plan.nodes.n1.x - other.x, plan.nodes.n1.y - other.y)).toBeGreaterThan(1);
		}
	});

	// By the actor and never by the words: a name rewritten on the board is still that person.
	it("recognises somebody by their actor, not by their name", () => {
		const graph = boardWith([[{ ...aerin, name: "Aerin the Bold" }, 50, 50]]);
		const plan = partyBoardPlan(graph, [aerin], {}, ids());
		expect(plan.addedPeople).toBe(0);
	});

	it("skips anybody with no actor behind them, and a ledger entry that is not an identity", () => {
		const plan = partyBoardPlan(emptyGraph(), [{ name: "Nobody" }, aerin], { seated: [null, 7, ""] }, ids());
		expect(plan.addedPeople).toBe(1);
		expect(plan.seated).toEqual([aerin.uuid]);
	});

	// What the player characters are to each other is the table's to say.
	it("draws no lines", () => {
		const plan = partyBoardPlan(emptyGraph(), [aerin, bram, cass], {}, ids());
		expect(plan).not.toHaveProperty("edges");
	});
});

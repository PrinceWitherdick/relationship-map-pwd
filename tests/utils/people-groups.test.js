import { afterEach, describe, expect, it } from "vitest";
import {
	PEOPLE_GROUP_OTHERS, PEOPLE_GROUP_PLAYERS, groupPeople, personNote,
} from "../../module/utils/people-groups.js";

// The lists the people picker offers, built from nothing but what every Foundry system declares: its
// actor types, their labels and icons, and who plays whom.

const SAVED_GAME = globalThis.game;
const SAVED_CONFIG = globalThis.CONFIG;

const actor = (id, name, type, extra = {}) => ({ id, name, type, hasPlayerOwner: false, ...extra });
const row = (name, doc = null) => ({ id: doc?.id ?? name, name, actor: doc });

/**
 * A world on a system declaring `types` in that order, with its type `labels` (i18n keys) and
 * `icons`. `table` adds strings to the language table, for a system that translates its labels.
 */
function world({ users = [], actors = [], types = [], labels = {}, icons = {}, table = {} } = {}) {
	globalThis.game = {
		...SAVED_GAME,
		i18n: { ...SAVED_GAME.i18n, localize: key => table[key] ?? SAVED_GAME.i18n.localize(key) },
		users: { contents: users },
		actors: { contents: actors },
		documentTypes: { Actor: ["base", ...types] },
		system: { documentTypes: { Actor: Object.fromEntries(types.map(type => [type, {}])) } },
	};
	globalThis.CONFIG = { ...SAVED_CONFIG, Actor: { typeLabels: labels, typeIcons: icons } };
}

afterEach(() => {
	globalThis.game = SAVED_GAME;
	globalThis.CONFIG = SAVED_CONFIG;
});

describe("groupPeople", () => {
	it("puts the player characters first, the system's kinds next in its own order, and the rest last", () => {
		const pim = actor("pim", "Pim", "character");
		const ezra = actor("ezra", "Ezra", "npc");
		const gull = actor("gull", "The Gull", "vehicle");
		world({
			users: [{ name: "Alex", isGM: false, character: pim }],
			actors: [pim, ezra, gull],
			types: ["character", "vehicle", "npc"],
		});
		const groups = groupPeople([row("A stranger"), row("Ezra", ezra), row("The Gull", gull), row("Pim", pim)]);
		expect(groups.map(group => group.key)).toEqual([PEOPLE_GROUP_PLAYERS, "type:vehicle", "type:npc", PEOPLE_GROUP_OTHERS]);
		expect(groups[0].label).toBe("Player characters");
		expect(groups[3].label).toBe("Everyone else");
	});

	// A rail with "Vehicles (0)" on it is a tab that can only disappoint.
	it("offers no list that nobody is on", () => {
		const ezra = actor("ezra", "Ezra", "npc");
		world({ actors: [ezra], types: ["character", "npc", "vehicle"] });
		expect(groupPeople([row("Ezra", ezra)]).map(group => group.key)).toEqual(["type:npc"]);
		expect(groupPeople([])).toEqual([]);
	});

	it("names a kind in the system's own words, and falls back to the type where it has none", () => {
		const ezra = actor("ezra", "Ezra", "npc");
		const gull = actor("gull", "The Gull", "vehicle");
		world({
			actors: [ezra, gull],
			types: ["npc", "vehicle"],
			labels: { npc: "TYPES.Actor.npc", vehicle: "TYPES.Actor.vehicle" },
			table: { "TYPES.Actor.npc": "Non-player character" },
		});
		const [npc, vehicle] = groupPeople([row("Ezra", ezra), row("The Gull", gull)]);
		expect(npc.label).toBe("Non-player character");
		// A label key the language table does not know comes back as the key itself, which is no name.
		expect(vehicle.label).toBe("Vehicle");
		expect(vehicle.hint).toBe("Vehicle actors in this world.");
	});

	it("uses the system's icon for a kind, and a plain figure where it has none", () => {
		const ezra = actor("ezra", "Ezra", "npc");
		const gull = actor("gull", "The Gull", "vehicle");
		world({ actors: [ezra, gull], types: ["npc", "vehicle"], icons: { vehicle: "fa-ship" } });
		const [npc, vehicle] = groupPeople([row("Ezra", ezra), row("The Gull", gull)]);
		expect(npc.icon).toBe("fa-user");
		expect(vehicle.icon).toBe("fa-ship");
	});

	it("puts a kind the system never declared after the ones it did", () => {
		const ezra = actor("ezra", "Ezra", "npc");
		const odd = actor("odd", "Odd", "homebrew");
		world({ actors: [ezra, odd], types: ["npc"] });
		expect(groupPeople([row("Odd", odd), row("Ezra", ezra)]).map(group => group.key))
			.toEqual(["type:npc", "type:homebrew"]);
	});

	it("sorts each list by name and keeps every field a row arrived with", () => {
		const bo = actor("bo", "Bo", "npc");
		const ash = actor("ash", "Ash", "npc");
		world({ actors: [ash, bo], types: ["npc"] });
		const [npc] = groupPeople([{ ...row("Bo", bo), img: "bo.webp" }, row("Ash", ash)]);
		expect(npc.people.map(person => person.name)).toEqual(["Ash", "Bo"]);
		expect(npc.people[1].img).toBe("bo.webp");
	});
});

describe("personNote", () => {
	it("says who plays a player character", () => {
		const pim = actor("pim", "Pim", "character");
		world({ users: [{ name: "Alex", isGM: false, character: pim }], actors: [pim], types: ["character"] });
		expect(personNote(pim)).toBe("Played by Alex");
	});

	// Every GM owns every actor, so owning one says nothing about who plays it.
	it("names every player who owns an actor, and never a GM", () => {
		const gull = actor("gull", "The Gull", "vehicle", {
			hasPlayerOwner: true,
			testUserPermission: (who, level) => level === "OWNER",
		});
		world({
			users: [{ name: "Alex", isGM: false }, { name: "Sam", isGM: false }, { name: "Gamemaster", isGM: true }],
			actors: [gull],
			types: ["vehicle"],
		});
		expect(personNote(gull)).toBe("Played by Alex, Sam");
	});

	it("falls back to the folder somebody is filed in, and to nothing", () => {
		world();
		expect(personNote(actor("ezra", "Ezra", "npc", { folder: { name: "The Docks" } }))).toBe("The Docks");
		expect(personNote(actor("odd", "Odd", "npc"))).toBe("");
		expect(personNote(null)).toBe("");
	});
});

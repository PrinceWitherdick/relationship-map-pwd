import { afterEach, describe, expect, it } from "vitest";
import { partyCharacters } from "../../module/utils/party.js";

// Who counts as a player character, in a world this module knows nothing else about. The rules are
// in the header of module/utils/party.js, and each one gets a small world of its own here.

const SAVED = globalThis.game;

const actor = (id, name, type = "character", { owned = false, pack = null } = {}) => ({
	id, name, type, hasPlayerOwner: owned, pack,
});
const user = (name, { gm = false, character = null } = {}) => ({ name, isGM: gm, character });

/** A world with these actors and users, on a system that declares these actor types. */
function world({ actors = [], users = [], types = null } = {}) {
	globalThis.game = {
		...SAVED,
		actors: { contents: actors },
		users: { contents: users },
		system: types ? { documentTypes: { Actor: Object.fromEntries(types.map(type => [type, {}])) } } : {},
	};
}

const ids = list => list.map(member => member.id);

afterEach(() => { globalThis.game = SAVED; });

describe("partyCharacters", () => {
	it("takes the character each player has been given", () => {
		const pim = actor("pim", "Pim");
		const sela = actor("sela", "Sela");
		world({ actors: [pim, sela], users: [user("Alex", { character: pim }), user("Sam", { character: sela })] });
		expect(ids(partyCharacters())).toEqual(["pim", "sela"]);
	});

	// A GM's own assigned character is somebody the GM plays, and the GM is not in the party.
	it("leaves out a character assigned to a GM", () => {
		const boss = actor("boss", "The Boss");
		world({ actors: [boss], users: [user("Gamemaster", { gm: true, character: boss })] });
		expect(partyCharacters()).toEqual([]);
	});

	// A player's horse, familiar or ship is theirs as well, and is not a member of the party.
	it("adds the other actors players own, of the kinds the party already is", () => {
		const pim = actor("pim", "Pim", "hero", { owned: true });
		const alt = actor("alt", "Alt", "hero", { owned: true });
		const horse = actor("horse", "Bess", "mount", { owned: true });
		world({ actors: [pim, alt, horse], users: [user("Alex", { character: pim })], types: ["hero", "mount", "npc"] });
		expect(ids(partyCharacters())).toEqual(["alt", "pim"]);
	});

	it("reads a table that assigns nobody by its player-owned `character` actors, where the system has that type", () => {
		const pim = actor("pim", "Pim", "character", { owned: true });
		const ship = actor("ship", "The Gull", "vehicle", { owned: true });
		const ezra = actor("ezra", "Ezra", "character");
		world({ actors: [pim, ship, ezra], types: ["character", "npc", "vehicle"] });
		expect(ids(partyCharacters())).toEqual(["pim"]);
	});

	it("takes every player-owned actor when nobody is assigned and the system has no `character` type", () => {
		const ash = actor("ash", "Ash", "pc", { owned: true });
		const bo = actor("bo", "Bo", "companion", { owned: true });
		const cy = actor("cy", "Cy", "pc");
		world({ actors: [ash, bo, cy], types: ["pc", "companion"] });
		expect(ids(partyCharacters())).toEqual(["ash", "bo"]);
	});

	// An assigned character still inside a compendium is not in the world, so there is nobody to seat.
	it("ignores an assigned character that lives in a compendium", () => {
		const packed = actor("packed", "Pim", "character", { pack: "world.heroes" });
		world({ users: [user("Alex", { character: packed })], types: ["character"] });
		expect(partyCharacters()).toEqual([]);
	});

	it("lists each actor once, however many ways it qualifies", () => {
		const pim = actor("pim", "Pim", "character", { owned: true });
		world({ actors: [pim], users: [user("Alex", { character: pim }), user("Sam", { character: pim })] });
		expect(ids(partyCharacters())).toEqual(["pim"]);
	});

	// Every client has to agree on the order, because the person chooser lists people in it.
	it("sorts by name, and breaks a tie by id", () => {
		const second = actor("b2", "Sam", "character", { owned: true });
		const first = actor("a1", "Sam", "character", { owned: true });
		const ada = actor("z", "Ada", "character", { owned: true });
		world({ actors: [second, ada, first], types: ["character"] });
		expect(ids(partyCharacters())).toEqual(["z", "a1", "b2"]);
	});

	it("answers an empty party in a world with nobody in it", () => {
		world();
		expect(partyCharacters()).toEqual([]);
	});
});
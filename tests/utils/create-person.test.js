import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPerson } from "../../module/utils/create-person.js";

// "New person" on the map goes through core's own Create Actor dialog. What this file adds is who
// else may see the result.
describe("making a new person through core's dialog", () => {
	let was;
	beforeEach(() => {
		was = { Actor: globalThis.Actor, game: globalThis.game, CONST: globalThis.CONST };
		globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
	});
	afterEach(() => Object.assign(globalThis, was));

	const withDialog = answer => {
		const createDialog = vi.fn(async () => answer);
		globalThis.Actor = { implementation: { createDialog } };
		return createDialog;
	};

	// A GM's new actor is prep, and keeps Foundry's own default.
	it("asks with no ownership of its own for a GM", async () => {
		globalThis.game = { user: { id: "gm", isGM: true } };
		const createDialog = withDialog({ name: "Newt" });
		await createPerson();
		expect(createDialog).toHaveBeenCalledWith({});
	});

	// A player's is somebody they just put in front of the whole table.
	it("makes a player's new actor visible to everyone", async () => {
		globalThis.game = { user: { id: "u1", isGM: false } };
		const createDialog = withDialog({ name: "Newt" });
		await createPerson();
		expect(createDialog).toHaveBeenCalledWith({ ownership: { default: 2 } });
	});

	it("hands back the actor made, and null for a dialog closed", async () => {
		globalThis.game = { user: { id: "gm", isGM: true } };
		withDialog({ name: "Newt" });
		expect(await createPerson()).toEqual({ name: "Newt" });
		withDialog(null);
		expect(await createPerson()).toBeNull();
	});

	it("answers null where there is no Actor class to ask", async () => {
		globalThis.game = { user: { id: "gm", isGM: true } };
		globalThis.Actor = undefined;
		expect(await createPerson()).toBeNull();
	});
});

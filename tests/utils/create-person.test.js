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
		expect(createDialog.mock.calls[0][0]).toEqual({});
	});

	// A player's is somebody they just put in front of the whole table.
	it("makes a player's new actor visible to everyone", async () => {
		globalThis.game = { user: { id: "u1", isGM: false } };
		const createDialog = withDialog({ name: "Newt" });
		await createPerson();
		expect(createDialog.mock.calls[0][0]).toEqual({ ownership: { default: 2 } });
	});

	// Core's questions in this module's frame, by its classes alone: core sets none of its own, so
	// no way a system merges them can cost core its `ok` callback or its title.
	it("asks core to draw its dialog in this module's frame, and hands it nothing else", async () => {
		globalThis.game = { user: { id: "gm", isGM: true } };
		const createDialog = withDialog({ name: "Newt" });
		await createPerson();
		const [, createOptions, dialog] = createDialog.mock.calls[0];
		expect(createOptions).toEqual({});
		expect(Object.keys(dialog)).toEqual(["classes"]);
		expect(dialog.classes).toEqual(expect.arrayContaining(["relmap-window", "relmap-dialog", "relmap-create-person-dialog"]));
	});

	it("hands back the actor made, and null for a dialog closed", async () => {
		globalThis.game = { user: { id: "gm", isGM: true } };
		const newt = { documentName: "Actor", name: "Newt" };
		withDialog(newt);
		expect(await createPerson()).toBe(newt);
		withDialog(null);
		expect(await createPerson()).toBeNull();
	});

	// A system's own createDialog may answer with anything, its button's action name included. That is
	// not somebody to put on the map.
	it("answers null when the dialog hands back anything that is not an actor", async () => {
		globalThis.game = { user: { id: "gm", isGM: true } };
		withDialog("ok");
		expect(await createPerson()).toBeNull();
		withDialog({ name: "Newt" });
		expect(await createPerson()).toBeNull();
	});

	it("answers null where there is no Actor class to ask", async () => {
		globalThis.game = { user: { id: "gm", isGM: true } };
		globalThis.Actor = undefined;
		expect(await createPerson()).toBeNull();
	});
});

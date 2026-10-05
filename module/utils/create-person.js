// MAKING SOMEBODY NEW FOR THE MAP, through Foundry's own Create Actor dialog.
//
// CORE'S DIALOG AND NOT ONE OF OURS. The module runs on any game system, and only the system knows
// what kinds of actor it has and what each needs; the sidebar's own dialog already asks exactly that
// (name, type, folder), in the words the table is used to.
//
// IN OUR FRAME, though, by its CLASSES ALONE. `createDialog`'s third argument is merged into core's own
// `DialogV2.prompt` options, and core sets no `classes` of its own, so ours cannot replace anything
// whether the merge is core's deep one or a system's shallow spread. The slate confirm and the glyph
// in the title bar are then the stylesheet's (`.relmap-create-person-dialog`). Handing core an `ok`
// or a `window` would put core's callback and title at the mercy of how a system merges: spread
// shallowly, the button would answer "ok" rather than make an actor. A system that overrides
// `createDialog` with the older two-argument signature simply never reads it.
//
// ⚠ THE NEW ACTOR'S SHEET OPENS. Core opens it on v14 whatever it is asked, so it is left to open on
// v13 too rather than behave two ways: a blank actor wants filling in, and the face is on the map
// behind it either way.

import { themedDialogClasses } from "./window-theme.js";

/**
 * Ask core's Create Actor dialog for a new actor.
 *
 * ⚠ A PLAYER'S IS VISIBLE TO EVERYONE. A GM's new actor is prep and keeps Foundry's default (hidden);
 * a player's is somebody they just put in front of the whole table on a shared map, and the default of
 * NONE would leave everyone else looking at a face they cannot open. So it is OBSERVER for all. The
 * creator still owns it outright: the server adds them as OWNER unless the data already names them.
 *
 * @returns {Promise<Actor|null>}  The new actor, or null if the dialog was closed or answered with
 *          anything that is not an actor.
 */
export async function createPerson() {
	const cls = globalThis.Actor?.implementation ?? globalThis.Actor;
	if (typeof cls?.createDialog !== "function") return null;
	const data = game.user?.isGM ? {} : { ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } };
	const dialog = { classes: themedDialogClasses("relmap-create-person-dialog") };
	// Only an Actor goes on the map as a person: a system's own dialog may answer with anything.
	const made = await cls.createDialog(data, {}, dialog);
	return made?.documentName === "Actor" ? made : null;
}

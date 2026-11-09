// THE DEAD CHIP, PUT ON AND TAKEN OFF BY THE ACTOR.
//
// Somebody on a board whose actor is dead wears the Dead chip (RELMAP_CHIP_PRESETS). "Dead" is core's
// own Defeated status (`CONFIG.specialStatusEffects.DEFEATED`, "dead" unless a system says otherwise):
// the skull on the token HUD, and whatever a system's own death puts on the actor through it. That is
// the one reading of death every game system shares. It is WRITTEN, not drawn from the actor on each
// paint, so from then on it is an ordinary chip the table may take off. Two moments write it:
//  • ARRIVING: a dead actor put on a board arrives wearing it (`seatPatch`, the one patch every
//    seating writes, so one undo takes both back and no way of seating people can leave it out);
//  • DYING OR COMING BACK: an Active Effect carrying the status put on, taken off, enabled or disabled
//    (`deathEffectActor`) puts the chip on (or takes it off) everyone standing for them on every board
//    (`deadChipPatch`, run by relmap-faces.js `keepDeadChipsCurrent`).
//
// ⚠ A BOARD STANDS FOR THE WORLD ACTOR. An unlinked token marked dead changes only its own copy of the
// actor, which no board points at, so it changes no chip.
//
// ⚠ NO DOCUMENT IMPORTS HERE. The window seats people through `seatPatch`, and relmap-faces.js (which
// imports relmap-doc.js) imports this, so anything this file imported from those would be a cycle.

import { resolveSync as defaultResolve } from "../utils/foundry-compat.js";
import { RELMAP_CHIP_PRESETS, addChipPatch, addNodesPatch, nodeChipsPatch } from "./relmap-store.js";

const DEAD = RELMAP_CHIP_PRESETS.find(preset => preset.id === "dead");

/** The Dead chip's id: the preset's. */
export const RELMAP_DEAD_CHIP = DEAD.id;

/** The status id core marks the dead with: the system's DEFEATED, else core's own "dead". */
export function defeatedStatusId() {
	const id = globalThis.CONFIG?.specialStatusEffects?.DEFEATED;
	return typeof id === "string" && id ? id : "dead";
}

/** Whether one Active Effect carries this status, enabled or not. A document's is a Set, its data's an Array. */
function holdsStatus(effect, id) {
	const statuses = effect?.statuses;
	if (statuses instanceof Set) return statuses.has(id);
	return Array.isArray(statuses) && statuses.includes(id);
}

/**
 * Whether one Active Effect, as it stands, marks its bearer dead: enabled, not suppressed (an item's
 * effect while the item is unequipped, say) and carrying the status.
 */
function marksDead(effect, id = defeatedStatusId()) {
	return !!effect && !effect.disabled && !effect.isSuppressed && holdsStatus(effect, id);
}

/**
 * Whether this actor is dead, as the map reads it: any enabled effect on it (or carried onto it by an
 * item) holds the Defeated status. A document that cannot say is not dead.
 *
 * READ OFF THE EFFECTS RATHER THAN `actor.statuses`, which is filled in when the actor's data is next
 * prepared: inside a `createActiveEffect` hook it can still hold the answer from before the change.
 */
export function isDeadActor(actor) {
	if (!actor) return false;
	try {
		const id = defeatedStatusId();
		const effects = typeof actor.allApplicableEffects === "function"
			? actor.allApplicableEffects()
			: actor.effects ?? [];
		for (const effect of effects) if (marksDead(effect, id)) return true;
	} catch { /* a half-built actor */ }
	return false;
}

/**
 * The actor whose death an Active Effect change could have changed, or null: an effect on an actor
 * (or on an item an actor carries) that holds the Defeated status, or an update that changed its
 * `statuses`, which may have just taken the status away. Switching an effect that does not hold the
 * status on or off cannot change anyone's death, so it is not one.
 *
 * @param {ActiveEffect} effect
 * @param {object} [changed]  the update's changes, for `updateActiveEffect`.
 * @returns {Actor|null}
 */
export function deathEffectActor(effect, changed = null) {
	if (!effect) return null;
	const parent = effect.parent;
	const actor = parent?.documentName === "Actor" ? parent
		: parent?.documentName === "Item" && parent.parent?.documentName === "Actor" ? parent.parent
			: null;
	if (!actor) return null;
	const touched = !!changed && typeof changed === "object" && "statuses" in changed;
	return holdsStatus(effect, defeatedStatusId()) || touched ? actor : null;
}

/** The Dead chip as a board stores it, named in the reader's language. */
export function deadChipDef() {
	const name = globalThis.game?.i18n?.localize?.(DEAD.nameKey);
	return { name: name && name !== DEAD.nameKey ? name : "Dead", icon: DEAD.icon, ink: DEAD.ink };
}

/** The Dead chip's definition onto a board that has none yet, ahead of a write that puts it on. */
function defineDead(graph, patch) {
	if (graph?.chips?.[RELMAP_DEAD_CHIP] || !patch) return patch;
	return { ...(addChipPatch(RELMAP_DEAD_CHIP, deadChipDef()) ?? {}), ...patch };
}

/** Which of these newcomers stand for a dead actor, by id. */
export function deadArrivalIds(nodes, { resolve = defaultResolve } = {}) {
	return Object.entries(nodes ?? {})
		.filter(([, node]) => node?.uuid && isDeadActor(resolve(node.uuid)))
		.map(([id]) => id);
}

/**
 * The Dead chip on whichever of these NEWCOMERS stand for a dead actor, or {} for none.
 *
 * @param {object} graph  the board before they arrive, normalized.
 * @param {Record<string, {uuid?: string}>} nodes  id -> the person being seated.
 * @param {Function} [resolve]  uuid -> actor.
 */
export function deadArrivalPatch(graph, nodes, { resolve = defaultResolve } = {}) {
	const ids = deadArrivalIds(nodes, { resolve });
	if (!ids.length) return {};
	const patch = {};
	for (const id of ids) Object.assign(patch, nodeChipsPatch(id, [RELMAP_DEAD_CHIP]) ?? {});
	return defineDead(graph, patch);
}

/**
 * THE WRITE THAT SEATS PEOPLE ON A BOARD: everybody in `nodes` (relmap-store.js `addNodesPatch`) and
 * the Dead chip on whoever among them is dead, in one patch. Every seating goes through this rather
 * than adding the two up itself, so the next way of seating people cannot forget the chip.
 *
 * @param {object} graph  the board before they arrive, normalized.
 * @param {Record<string, object>} nodes  id -> the fields `addNodePatch` takes.
 * @param {Function} [resolve]  uuid -> actor.
 * @returns {object}  {} when nobody could be seated.
 */
export function seatPatch(graph, nodes, { resolve = defaultResolve } = {}) {
	const seated = addNodesPatch(nodes);
	if (!Object.keys(seated).length) return seated;
	return { ...seated, ...deadArrivalPatch(graph, nodes, { resolve }) };
}

/**
 * The patch that brings one board in line with one actor's death: Dead on everybody standing for them
 * who lacks it (`dead`), or off everybody wearing it (not). Null when there is nothing to change.
 */
export function deadChipPatch(graph, uuid, dead) {
	if (!uuid) return null;
	let patch = null;
	for (const [id, node] of Object.entries(graph?.nodes ?? {})) {
		if (node.uuid !== uuid) continue;
		const wears = !!node.chips?.[RELMAP_DEAD_CHIP];
		if (dead === wears) continue;
		const one = dead ? nodeChipsPatch(id, [RELMAP_DEAD_CHIP]) : nodeChipsPatch(id, [], [RELMAP_DEAD_CHIP]);
		patch = { ...(patch ?? {}), ...(one ?? {}) };
	}
	return dead ? defineDead(graph, patch) : patch;
}

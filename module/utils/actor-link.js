/**
 * Resolving the actor behind a person on a board, and opening their sheet.
 *
 * Prefer the uuid (which survives a move into a folder), fall back to the world id, and warn when
 * neither finds anybody. A person's actor can be deleted between renders, or a world imported without
 * it, so every path has to handle "no longer there", which is why the notification lives in here
 * rather than being remembered separately at each call site.
 */

/** The i18n key for the "that person is gone" warning. */
export const ACTOR_LINK_MISSING = "RELMAP.gone";

/**
 * The Actor a link points at, or null.
 *
 * @param {HTMLElement|DOMStringMap|{actorUuid?: string, actorId?: string}} link
 * @returns {Promise<Actor|null>}
 */
export async function resolveLinkedActor(link) {
	const { actorUuid, actorId } = link?.dataset ?? link ?? {};
	return (actorUuid ? await fromUuid(actorUuid) : null)
		|| (actorId ? game.actors?.get(actorId) : null)
		|| null;
}

/**
 * Resolve a link and hand the actor to `use`, warning instead when it cannot be found.
 *
 * @param {HTMLElement|object} link
 * @param {Function} use       called with the resolved actor
 * @param {string} [missing]   i18n key for the warning
 */
export async function withLinkedActor(link, use, missing = ACTOR_LINK_MISSING) {
	const actor = await resolveLinkedActor(link);
	if (actor) return use(actor);
	ui.notifications?.warn?.(game.i18n.localize(missing));
	return undefined;
}

/** The common case: open the linked actor's sheet. */
export function openLinkedActorSheet(link, missing = ACTOR_LINK_MISSING) {
	return withLinkedActor(link, actor => actor.sheet?.render(true), missing);
}

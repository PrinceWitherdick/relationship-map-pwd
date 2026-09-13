// The two DOM stand-ins every fake element in the suite shares: which selectors a node matches, and
// its `classList`.
//
// The suite runs on the `node` environment with no DOM at all (vitest.config.js), and the map's
// listeners are DELEGATED: every one reaches what it acts on by walking up from `ev.target` with
// `closest`. What a node matches is the thing that walk depends on, so it is decided here, once, and
// `tests/fakes/pointer-board.js` builds its board out of these rather than out of a copy of its own.
// `tests/fakes/css.js` says in its own header that drift between copies is why `tests/fakes/` exists.

/**
 * Match `.class`, `[data-x]`, `[data-x='v']` and `:focus`, in any combination, comma-separated.
 *
 * Every selector form the code under test actually uses. An unknown form matches nothing rather than
 * throwing, which is the behaviour a real `matches` has for a selector that fits no node.
 */
export function matchesSelector(node, selector) {
	return selector.split(",").map(s => s.trim()).some(part => {
		const bits = part.match(/\.[\w-]+|\[[^\]]+\]|:focus/g) ?? [];
		if (!bits.length) return false;
		return bits.every(bit => {
			if (bit === ":focus") return !!node.focused;
			if (bit.startsWith(".")) return node.classes.includes(bit.slice(1));
			const [, key, val] = bit.match(/\[([\w-]+)(?:=['"]?([^'"\]]*)['"]?)?\]/) ?? [];
			const prop = key.replace(/^data-/, "").replace(/-(\w)/g, (_, c) => c.toUpperCase());
			const have = node.dataset[prop];
			return val === undefined ? have !== undefined : have === val;
		});
	});
}

/**
 * The four `classList` methods a caller reaches for, over a node's own `classes` array.
 *
 * SHARED RATHER THAN WRITTEN TWICE, for the reason `pointer-board.js` gives about
 * `matchesSelector` in its own header: a second copy is how two fakes drift into disagreeing about
 * the same production code.
 *
 * ⚠ `toggle` IS REAL AND NOT OPTIONAL. Production code calls `classList?.toggle(...)`, where
 * the `?.` guards a MISSING classList rather than a missing method, so a fake without it throws a
 * TypeError and the failure reads as a bug in the code under test.
 *
 * ⚠ AND `add` AND `remove` TAKE SEVERAL NAMES, as the real ones do. `applyTheme` takes both themes
 * off in one call, and a fake that heard only the first name would leave the second on and call the
 * result correct whenever the second happened not to be there.
 */
export function fakeClassList(node) {
	const list = {
		add(...names) {
			for (const name of names) if (!node.classes.includes(name)) node.classes.push(name);
		},
		remove(...names) {
			for (const name of names) {
				const at = node.classes.indexOf(name);
				if (at >= 0) node.classes.splice(at, 1);
			}
		},
		contains: name => node.classes.includes(name),
		toggle(name, force) {
			const want = force === undefined ? !node.classes.includes(name) : !!force;
			if (want) list.add(name);
			else list.remove(name);
			return want;
		},
	};
	return list;
}

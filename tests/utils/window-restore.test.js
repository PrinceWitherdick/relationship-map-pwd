import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Reopening map windows after a reload. The module follows the map windows through the render and
// close hooks AppV1 builds out of the window's class name, persists a snapshot of each to a client
// setting, and opens them again on ready. These tests drive it through the hooks it installs, over a
// fake settings store.
//
// The setting is one record for every world this browser opens, so it is kept per world: this client
// is in world "w1", and anything under another key belongs to somewhere else.

const hooks = new Map();
const once = new Map();
let store;

function fire(name, ...args) {
	for (const fn of hooks.get(name) ?? []) fn(...args);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.resetModules();
	hooks.clear();
	once.clear();
	store = { restoreWindowsOnReload: true, openWindowsState: {} };
	globalThis.Hooks = {
		on: (name, fn) => hooks.set(name, [...(hooks.get(name) ?? []), fn]),
		once: (name, fn) => once.set(name, fn),
	};
	globalThis.game = {
		...globalThis.game,
		user: { id: "me" },
		world: { id: "w1" },
		settings: {
			get: (_scope, key) => store[key],
			set: (_scope, key, value) => {
				store[key] = value;
				return Promise.resolve(value);
			},
		},
	};
	globalThis.window = { innerWidth: 1600, innerHeight: 900, addEventListener: vi.fn() };
});

afterEach(() => {
	vi.useRealTimers();
	delete globalThis.fromUuid;
	delete globalThis.window;
});

const load = () => import("../../module/utils/window-restore.js");

/** A map window as the restorer sees it: a document, a live position, and the board it is on. */
function mapWindow({
	uuid = "JournalEntry.map1", pack = null, pageId = "page1", minimized = false, popOut = true,
	position = { left: 10, top: 20, width: 900, height: 700, zIndex: 101 },
} = {}) {
	return { document: { uuid, pack }, position, restorePageId: pageId, _minimized: minimized, popOut };
}

describe("following the open map windows", () => {
	it("is watched under the hooks the window's own class name fires", async () => {
		const { installWindowRestore, RELMAP_WINDOW_CLASS } = await load();
		const { RelationshipMapWindow } = await import("../../module/dialogs/RelationshipMapWindow.js");
		// AppV1 builds a render hook out of `constructor.name`, so the two must never come apart.
		expect(RELMAP_WINDOW_CLASS).toBe(RelationshipMapWindow.name);
		installWindowRestore(() => null);
		expect(hooks.has("renderRelationshipMapWindow")).toBe(true);
		expect(hooks.has("closeRelationshipMapWindow")).toBe(true);
		expect(once.has("ready")).toBe(true);
	});

	it("saves a window's geometry, its depth in the stack, and the board it was on", async () => {
		const { installWindowRestore } = await load();
		installWindowRestore(() => null);
		fire("renderRelationshipMapWindow", mapWindow());
		vi.advanceTimersByTime(500);
		expect(store.openWindowsState).toEqual({
			w1: {
				"JournalEntry.map1": { left: 10, top: 20, width: 900, height: 700, zIndex: 101, pageId: "page1" },
			},
		});
	});

	it("saves that a window was minimized", async () => {
		const { installWindowRestore } = await load();
		installWindowRestore(() => null);
		fire("renderRelationshipMapWindow", mapWindow({ minimized: true }));
		vi.advanceTimersByTime(500);
		expect(store.openWindowsState.w1["JournalEntry.map1"].minimized).toBe(true);
	});

	it("forgets a window once it is closed", async () => {
		const { installWindowRestore } = await load();
		installWindowRestore(() => null);
		const app = mapWindow();
		fire("renderRelationshipMapWindow", app);
		vi.advanceTimersByTime(500);
		fire("closeRelationshipMapWindow", app);
		vi.advanceTimersByTime(500);
		expect(store.openWindowsState).toEqual({ w1: {} });
	});

	// ⚠ ONE SETTING FOR EVERY WORLD THIS BROWSER OPENS, and each save writes the whole of it. A save
	// that wrote only this world's windows wiped every other world's: a GM who spent an evening in a
	// second world came back to find nothing reopened in the first.
	it("keeps the windows another world saved when it saves this one's", async () => {
		store.openWindowsState = { w2: { "JournalEntry.theirs": { left: 1, top: 1 } } };
		const { installWindowRestore } = await load();
		installWindowRestore(() => null);
		fire("renderRelationshipMapWindow", mapWindow());
		vi.advanceTimersByTime(500);
		expect(store.openWindowsState.w2).toEqual({ "JournalEntry.theirs": { left: 1, top: 1 } });
		expect(Object.keys(store.openWindowsState.w1)).toEqual(["JournalEntry.map1"]);
	});

	it("follows nothing that is not a floating window over a world map", async () => {
		const { installWindowRestore } = await load();
		installWindowRestore(() => null);
		fire("renderRelationshipMapWindow", mapWindow({ uuid: "Compendium.x.y.JournalEntry.map2", pack: "x.y" }));
		fire("renderRelationshipMapWindow", mapWindow({ uuid: "JournalEntry.map3", popOut: false }));
		vi.advanceTimersByTime(500);
		expect(store.openWindowsState).toEqual({});
	});

	it("writes nothing while the reader has turned it off", async () => {
		store.restoreWindowsOnReload = false;
		const { installWindowRestore } = await load();
		installWindowRestore(() => null);
		fire("renderRelationshipMapWindow", mapWindow());
		vi.advanceTimersByTime(500);
		expect(store.openWindowsState).toEqual({});
	});
});

describe("reopening them", () => {
	const entry = uuid => ({ uuid, testUserPermission: () => true });

	it("reopens each saved map where it was, on the board it was on", async () => {
		store.openWindowsState = {
			w1: { "JournalEntry.map1": { left: 10, top: 20, width: 900, height: 700, pageId: "page7" } },
		};
		const map = entry("JournalEntry.map1");
		globalThis.fromUuid = vi.fn(async () => map);
		const open = vi.fn(() => ({ openMinimized: vi.fn() }));
		const { restoreOpenWindows } = await load();
		await restoreOpenWindows(open);
		await vi.runAllTimersAsync();
		expect(open).toHaveBeenCalledWith(map, { left: 10, top: 20, width: 900, height: 700, pageId: "page7" });
	});

	it("minimizes a window that was left minimized, once it is open", async () => {
		store.openWindowsState = { w1: { "JournalEntry.map1": { left: 10, top: 20, minimized: true } } };
		globalThis.fromUuid = vi.fn(async uuid => entry(uuid));
		const app = { openMinimized: vi.fn() };
		const { restoreOpenWindows } = await load();
		await restoreOpenWindows(() => app);
		await vi.runAllTimersAsync();
		expect(app.openMinimized).toHaveBeenCalledTimes(1);
	});

	// Every window lands on top as it opens, so the one that was in front has to open last.
	it("reopens the back-most window first, so the one that was in front ends in front", async () => {
		store.openWindowsState = {
			w1: {
				"JournalEntry.front": { left: 1, top: 1, zIndex: 300 },
				"JournalEntry.back": { left: 2, top: 2, zIndex: 100 },
				"JournalEntry.middle": { left: 3, top: 3, zIndex: 200 },
			},
		};
		globalThis.fromUuid = vi.fn(async uuid => entry(uuid));
		const opened = [];
		const { restoreOpenWindows } = await load();
		await restoreOpenWindows(doc => { opened.push(doc.uuid); return null; });
		await vi.runAllTimersAsync();
		expect(opened).toEqual(["JournalEntry.back", "JournalEntry.middle", "JournalEntry.front"]);
	});

	it("reopens nothing another world left open", async () => {
		store.openWindowsState = { w2: { "JournalEntry.map1": { left: 10, top: 20 } } };
		globalThis.fromUuid = vi.fn(async uuid => entry(uuid));
		const open = vi.fn();
		const { restoreOpenWindows } = await load();
		await restoreOpenWindows(open);
		await vi.runAllTimersAsync();
		expect(open).not.toHaveBeenCalled();
	});

	// A record saved before the worlds were kept apart is the windows themselves, keyed by uuid.
	it("still reads a record saved before the worlds were kept apart", async () => {
		store.openWindowsState = { "JournalEntry.map1": { left: 10, top: 20 } };
		const map = entry("JournalEntry.map1");
		globalThis.fromUuid = vi.fn(async () => map);
		const open = vi.fn(() => null);
		const { restoreOpenWindows } = await load();
		await restoreOpenWindows(open);
		await vi.runAllTimersAsync();
		expect(open).toHaveBeenCalledWith(map, expect.objectContaining({ left: 10, top: 20 }));
	});

	it("brings a window saved on a bigger screen back onto this one", async () => {
		const { clampToViewport } = await load();
		expect(clampToViewport({ left: 2400, top: 1200, width: 2000, height: 1400 }, 1600, 900))
			.toEqual({ left: 0, top: 860, width: 1600, height: 900 });
	});

	it("leaves closed a map that is gone, or that this reader may no longer see", async () => {
		store.openWindowsState = {
			w1: {
				"JournalEntry.gone": { left: 1, top: 1 },
				"JournalEntry.hidden": { left: 2, top: 2 },
			},
		};
		globalThis.fromUuid = vi.fn(async uuid => (uuid.endsWith("gone")
			? null
			: { uuid, testUserPermission: () => false }));
		const open = vi.fn();
		const { restoreOpenWindows } = await load();
		await restoreOpenWindows(open);
		await vi.runAllTimersAsync();
		expect(open).not.toHaveBeenCalled();
	});

	it("reopens nothing while the reader has turned it off", async () => {
		store.restoreWindowsOnReload = false;
		store.openWindowsState = { w1: { "JournalEntry.map1": { left: 1, top: 1 } } };
		globalThis.fromUuid = vi.fn(async uuid => entry(uuid));
		const open = vi.fn();
		const { restoreOpenWindows } = await load();
		await restoreOpenWindows(open);
		await vi.runAllTimersAsync();
		expect(open).not.toHaveBeenCalled();
	});
});

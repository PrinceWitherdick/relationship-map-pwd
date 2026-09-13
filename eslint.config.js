import js from "@eslint/js";
import globals from "globals";
import promise from "eslint-plugin-promise";

/**
 * Lint config for a no-build Foundry module.
 *
 * The rule that earns its keep here is `promise/catch-or-return`. A Foundry window is a wall of async
 * click handlers writing to documents, and a dropped rejection is invisible: the write fails, the DOM
 * keeps the optimistic state, and the reader is told the change landed.
 */

/** Foundry's globals. Not exhaustive: extended as `no-undef` finds more. */
const foundryGlobals = {
	game: "readonly",
	ui: "readonly",
	canvas: "readonly",
	CONFIG: "readonly",
	CONST: "readonly",
	Hooks: "readonly",
	foundry: "readonly",
	Application: "readonly",
	Folder: "readonly",
	JournalEntry: "readonly",
	JournalEntryPage: "readonly",
	JournalSheet: "readonly",
	DocumentSheetConfig: "readonly",
	TextEditor: "readonly",
	Handlebars: "readonly",
	fromUuid: "readonly",
	fromUuidSync: "readonly",
	renderTemplate: "readonly",
	loadTemplates: "readonly",
};

export default [
	{
		ignores: ["node_modules/**"],
	},

	js.configs.recommended,

	// ESLint 10 added `no-useless-assignment` to the recommended set. It flags the initializer in
	// `let doc = null; try { doc = fromUuidSync(...) } catch { doc = null }`, which is the shape this
	// code uses wherever a Foundry lookup can throw: the initializer states the fallback once, at the
	// declaration.
	{
		rules: { "no-useless-assignment": "off" },
	},

	// Module code: browser + Foundry.
	{
		files: ["module/**/*.js", "relationship-map.js"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: { ...globals.browser, ...foundryGlobals },
		},
		plugins: { promise },
		rules: {
			"promise/catch-or-return": ["error", { allowFinally: true }],
			"promise/no-nesting": "warn",
			"promise/no-return-wrap": "error",
			"promise/param-names": "error",
			"no-await-in-loop": "off",
			"no-unused-vars": ["error", {
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
				ignoreRestSiblings: true,
			}],
			"no-empty": ["error", { allowEmptyCatch: false }],
			"no-console": "off",
			eqeqeq: ["error", "smart"],
			"no-var": "error",
			"prefer-const": "warn",
			radix: "error",
			// The module id namespaces every flag, setting and sheet this module stores in a world. Import
			// MODULE_ID from module/module-id.js instead of retyping it, so a rename is one edit. Matches
			// the EXACT string only, so asset paths ("modules/relationship-map-pwd/templates/...") are
			// untouched.
			"no-restricted-syntax": ["error", {
				selector: 'Literal[value="relationship-map-pwd"]',
				message: "Import MODULE_ID from module/module-id.js instead of retyping the module id.",
			}, {
				// The other half of the rule above. `{ MODULE_ID: {...} }` is a property NAMED "MODULE_ID",
				// so the flag is written where nothing reads it and the failure is silent. Brackets make it
				// a computed key. Shorthand `{ MODULE_ID }` is excluded: there the name IS the intent.
				selector: "Property[computed=false][shorthand=false][key.name='MODULE_ID']",
				message: "Bracket it: { [MODULE_ID]: ... }. Unbracketed, this writes a flag under the literal key \"MODULE_ID\".",
			}],
		},
	},

	// The one file allowed to spell the module id out: it is where MODULE_ID is defined.
	{
		files: ["module/module-id.js"],
		rules: { "no-restricted-syntax": "off" },
	},

	// Tests: the same globals plus vitest's (vitest.config.js sets `globals: true`).
	{
		files: ["tests/**/*.js"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
				...foundryGlobals,
				describe: "readonly",
				it: "readonly",
				test: "readonly",
				expect: "readonly",
				vi: "readonly",
				beforeEach: "readonly",
				afterEach: "readonly",
				beforeAll: "readonly",
				afterAll: "readonly",
			},
		},
		rules: {
			"no-unused-vars": ["error", {
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				ignoreRestSiblings: true,
			}],
			"no-empty": ["error", { allowEmptyCatch: true }],
		},
	},

	// Config files run under Node.
	{
		files: ["*.config.js"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: { ...globals.node },
		},
	},
];

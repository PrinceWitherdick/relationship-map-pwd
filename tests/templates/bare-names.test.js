import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { describe, it, expect } from "vitest";

// Handlebars helpers are GLOBAL, shared by every system and module in the world, and a bare
// `{{when}}` asks for a helper called `when` BEFORE it looks for a `when` on the data. So once some
// other package registers a helper with that name, our template stops printing the value and calls
// their function instead. That is how a GM running Battle Transitions (which registers `when`,
// `group`, `json`, `switch` and more) once lost a whole sheet: its `when` throws with no arguments.
//
// `{{this.when}}` is always a data lookup, never a helper call, so no template here prints a value
// bare. A block parameter (`{{#each rows as |row|}}{{row}}{{/each}}`) is the one exception: inside
// its block Handlebars always reads it as the value.

/**
 * Every name in `source` that Handlebars would try as a helper before reading it off the data: a
 * mustache, block or subexpression whose head is one plain segment, with no arguments.
 */
export function bareHelperLookups(source) {
	const found = [];
	const blockParams = [];   // a stack: one entry per enclosing program
	const visitor = new Handlebars.Visitor();
	const head = function (node) {
		const p = node.path;
		if (p.type === "PathExpression" && !p.data && Handlebars.AST.helpers.simpleId(p)
			&& !node.params.length && !node.hash && !blockParams.some(scope => scope.includes(p.parts[0]))) {
			found.push({ name: p.parts[0], line: node.loc.start.line });
		}
		return Handlebars.Visitor.prototype[node.type].call(this, node);
	};
	visitor.MustacheStatement = head;
	visitor.BlockStatement = head;
	visitor.SubExpression = head;
	visitor.Program = function (node) {
		blockParams.push(node.blockParams ?? []);
		try { return Handlebars.Visitor.prototype.Program.call(this, node); }
		finally { blockParams.pop(); }
	};
	visitor.accept(Handlebars.parse(source));
	return found;
}

function templateFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const at = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...templateFiles(at));
		else if (entry.name.endsWith(".hbs")) out.push(at);
	}
	return out;
}

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("finding the names Handlebars tries as a helper first", () => {
	const names = src => bareHelperLookups(src).map(f => f.name);

	it("finds a bare mustache, a bare block and a bare subexpression", () => {
		expect(names("{{when}}")).toEqual(["when"]);
		expect(names("{{#group}}x{{/group}}{{^json}}y{{/json}}")).toEqual(["group", "json"]);
		expect(names("{{#if (switch)}}z{{/if}}")).toEqual(["switch"]);
	});

	it("names a bracketed segment by the helper it calls", () => {
		expect(names("{{[when]}} {{{[group]}}}")).toEqual(["when", "group"]);
	});

	it("leaves out what is always data or always a helper call", () => {
		expect(names("{{this.when}} {{../when}} {{@index}} {{a.b}} {{this}} {{this.[when]}}")).toEqual([]);
		expect(names('{{localize "x"}} {{format k n=1}} {{#each rows}}{{/each}} {{#if (eq a b)}}{{/if}}')).toEqual([]);
	});

	it("leaves out a block parameter inside its block, and only there", () => {
		expect(names("{{#each rows as |group i|}}{{group}}{{i}}{{/each}}")).toEqual([]);
		expect(names("{{#each rows as |group|}}{{else}}{{group}}{{/each}}{{group}}")).toEqual(["group", "group"]);
	});
});

describe("every template in this module", () => {
	const files = templateFiles(path.join(ROOT, "templates"));

	it("has templates to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files.map(file => [path.relative(ROOT, file).replaceAll("\\", "/"), file]))(
		"%s prints every value as {{this.name}}, so no other package's helper can take it",
		(_name, file) => {
			const bare = bareHelperLookups(fs.readFileSync(file, "utf8")).map(f => `${f.name} (line ${f.line})`);
			expect(bare).toEqual([]);
		},
	);
});

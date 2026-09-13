// The one place this module's id is spelled out.
//
// ⚠ IT IS HYPHENATED, so it can never be read as a dotted property: `flags.relationship-map-pwd`
// parses as a subtraction and throws. Every flag, setting and sheet registration goes through this
// constant, and every object key made from it is written in brackets: `{ [MODULE_ID]: ... }`.
// Unbracketed, `{ MODULE_ID: ... }` writes a flag under the literal key "MODULE_ID", which nothing
// ever reads back, and the failure is silent.

export const MODULE_ID = "relationship-map-pwd";

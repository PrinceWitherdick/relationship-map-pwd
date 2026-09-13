// The single, audited HTML escaper for this module. Pure (no Foundry, no DOM), so the modules that
// build markup as strings can be exercised by the tests. Escapes the five characters that matter in
// both element and attribute contexts.
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };

/** Escape a value for safe insertion into HTML (element text or attribute value). */
export function escHtml(v) {
	return String(v ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

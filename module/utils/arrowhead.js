// The one triangle every arrowhead on a board is drawn from.
//
// Its own tiny module because two things have to agree about it to the unit: the SVG path the
// template paints, and the geometry that stands each head off the rim of the face it points at
// (utils/relmap-geometry.js). A head drawn from one triangle and measured against another lands its
// tip short of the line it ends, or out past the face, with the stroke showing through the taper.

/**
 * The head's three corners, as shares of its own size, centred on the origin and pointing along +x.
 *
 * `EDGE` is the halo as a share of the head's size; the stylesheet draws it on the same 10-unit box,
 * which is this number times `VIEWBOX`.
 */
export const ROUTE_HEAD_POINTS = Object.freeze([[-0.4, -0.38], [0.4, 0], [-0.4, 0.38]]);
export const ROUTE_HEAD_EDGE = 0.14;
export const ROUTE_HEAD_VIEWBOX = 10;

/**
 * The same triangle as an SVG path over `viewBox="0 0 10 10"`.
 *
 * Rounded before it is printed, because the centring arithmetic lands on values like
 * 0.9999999999999998, and a `d` full of those is unreadable in the inspector for no gain.
 */
export const ROUTE_HEAD_PATH = `M${ROUTE_HEAD_POINTS
	.map(([x, y]) => `${headUnit(x)} ${headUnit(y)}`)
	.join(" L")} Z`;

function headUnit(v) {
	return String(Number((((v + 0.5) * ROUTE_HEAD_VIEWBOX)).toFixed(4)));
}

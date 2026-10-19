/**
 * A Postgres array literal for use as one query parameter (`${arrayParam(xs)}::text[]`).
 * Drizzle would otherwise expand a JS array into a list of separate parameters.
 */
export const arrayParam = (items: readonly (string | number)[]) =>
  `{${items.map((i) => `"${String(i).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

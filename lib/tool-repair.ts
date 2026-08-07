/** Claude's tool-calling occasionally leaks its legacy text-format markers into
 * a long free-text field instead of cleanly starting the next JSON key — e.g. a
 * "summary" value ends with a stray `</summary>` followed by
 * `<parameter name="fix">` and the real fix text, rather than "fix" being its
 * own key. Confirmed live (first seen on the root-cause finding, ~30% of calls
 * with several long free-text fields). The content is genuinely present, just
 * mis-delimited; this recovers it instead of discarding a valid response as
 * malformed. Harmless no-op for any provider/response that doesn't exhibit it. */
export function repairLeakedToolFields(
  input: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const repaired = { ...input };
  for (const field of fields) {
    const value = repaired[field];
    if (typeof value !== "string") continue;
    const match = value.match(/<\/\w+>\s*<parameter name="(\w+)">([\s\S]*)$/);
    if (!match) continue;
    const [fullMatch, leakedFieldName, leakedValue] = match;
    repaired[field] = value.slice(0, value.indexOf(fullMatch)).trim();
    const existing = repaired[leakedFieldName];
    if (typeof existing !== "string" || !existing.trim()) {
      repaired[leakedFieldName] = leakedValue.trim();
    }
  }
  return repaired;
}

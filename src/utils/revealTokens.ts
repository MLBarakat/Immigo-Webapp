/**
 * Splits assistant text into reveal steps while keeping the whitespace that
 * precedes each word. Rejoining every token reconstructs the original layout,
 * so paragraph breaks and Markdown list indentation survive the typewriter.
 */
export function tokenizeAssistantReveal(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.match(/\s*\S+/g) ?? [];
}

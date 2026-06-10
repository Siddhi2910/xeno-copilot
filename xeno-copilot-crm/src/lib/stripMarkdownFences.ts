// Gemini sometimes wraps JSON output in markdown code fences even when JSON mode
// is explicitly requested. This utility strips those fences before JSON.parse.
//
// Called before every JSON.parse on LLM output without exception.
// If the string has no fences, it is returned unchanged.

export function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();

  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  return trimmed;
}

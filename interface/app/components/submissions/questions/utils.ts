/** Convert single backticks to HTML code tags (for choices) */
export function convertBackticksToCode(text: string): string {
  if (!text) return "";
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  let result = escapeHtml(text);
  result = result.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  return result;
}

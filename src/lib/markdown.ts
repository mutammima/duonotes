/**
 * A tiny, dependency-free Markdown subset for note bodies: headings (`#`, `##`),
 * **bold**, *italic*, bullet lists (`- `) and checkboxes (`- [ ]` / `- [x]`).
 *
 * Kept intentionally small so it ships over-the-air (pure JS, no native module)
 * and so checkboxes can be made interactive. The note `body` stays a plain
 * Markdown string in the existing `body` column — no schema change.
 */

export interface Edit {
  /** The full new text after the transform. */
  text: string;
  /** Where the caret should sit afterwards. */
  cursor: number;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

/** Line prefixes we recognise, longest-first so matching is unambiguous. */
const LINE_PREFIXES = ['- [ ] ', '- [x] ', '- [X] ', '## ', '# ', '- '];

/** Wrap the current selection with `marker` (e.g. `**`). Empty selection inserts
 *  the markers and drops the caret between them. */
export function wrapSelection(text: string, start: number, end: number, marker: string): Edit {
  const s = clamp(start, text.length);
  const e = clamp(end, text.length);
  const before = text.slice(0, s);
  const sel = text.slice(s, e);
  const after = text.slice(e);
  if (sel.length === 0) {
    return { text: before + marker + marker + after, cursor: s + marker.length };
  }
  return { text: before + marker + sel + marker + after, cursor: e + marker.length * 2 };
}

/** Toggle a block prefix (`# `, `- `, `- [ ] `, …) on the line containing `pos`.
 *  Applying the prefix a line already has removes it; a different known prefix is
 *  replaced. */
export function toggleLinePrefix(text: string, pos: number, prefix: string): Edit {
  const p = clamp(pos, text.length);
  const lineStart = text.lastIndexOf('\n', p - 1) + 1;
  const nextNl = text.indexOf('\n', p);
  const lineEnd = nextNl === -1 ? text.length : nextNl;
  const line = text.slice(lineStart, lineEnd);

  let stripped = line;
  let removed = '';
  for (const pre of LINE_PREFIXES) {
    if (stripped.startsWith(pre)) {
      removed = pre;
      stripped = stripped.slice(pre.length);
      break;
    }
  }
  const newLine = removed === prefix ? stripped : prefix + stripped;
  const newText = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
  return { text: newText, cursor: clamp(p + (newLine.length - line.length), newText.length) };
}

/** Flip `- [ ]` ⇄ `- [x]` on a specific line (used by tappable checkboxes). */
export function toggleCheckboxLine(text: string, lineIndex: number): string {
  const lines = text.split('\n');
  const line = lines[lineIndex];
  if (line === undefined) return text;
  if (/^(\s*[-*]\s+)\[ \]/.test(line)) lines[lineIndex] = line.replace('[ ]', '[x]');
  else if (/^(\s*[-*]\s+)\[[xX]\]/.test(line)) lines[lineIndex] = line.replace(/\[[xX]\]/, '[ ]');
  return lines.join('\n');
}

/** Flatten rich-text HTML (or legacy Markdown) to plain text for list previews. */
export function htmlToPlain(input: string): string {
  return input
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Flatten Markdown to plain text for list-row previews. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/^\s*[-*]\s+/gm, '') // bullets
    .replace(/[*_~`]/g, '') // inline marks: bold / italic / strikethrough / code
    .replace(/\n+/g, ' ')
    .trim();
}

import { mergeAttributes, Node } from '@tiptap/core';

/** One stroke: `d` is a compact "x,y x,y …" point list in the drawing's own
 *  coordinate space, `c` the ink color, `w` the stroke width. */
export type SerializedStroke = { d: string; c: string; w: number };

export type DrawingAttrs = { strokes: SerializedStroke[]; w: number; h: number };

/** Ink color comes from our own app, but this HTML round-trips through the
 *  database — never interpolate an unvalidated string into markup. */
function safeColor(c: unknown): string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#000000';
}

function safeNumber(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** "12.4,8 13.1,9.7" -> "M 12.4 8 L 13.1 9.7" */
function toSvgPath(d: unknown): string {
  if (typeof d !== 'string') return '';
  const pts = d.trim().split(/\s+/).filter(Boolean);
  if (!pts.length) return '';
  const ok = (p: string) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(p);
  if (!pts.every(ok)) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.replace(',', ' ')}`).join(' ');
}

/**
 * A drawing that lives IN the document rather than as a flattened PNG: real
 * vector strokes stored as node attrs, rendered as inline SVG. That makes ink
 * reflow with text, stay crisp at any size, survive the HTML round-trip through
 * the existing `body` column, and cost ~10kB instead of ~150kB per sketch.
 */
export const Drawing = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  // Note: `anchor` (see drawing-bridge.ts's DrawingInsertPayload) is
  // deliberately NOT an attribute here — it's transient insert-time metadata
  // (where to place the node), stripped out before this schema ever sees it,
  // never persisted.
  addAttributes() {
    return {
      strokes: {
        default: [] as SerializedStroke[],
        parseHTML: (el) => {
          try {
            const parsed = JSON.parse(el.getAttribute('data-strokes') || '[]');
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({ 'data-strokes': JSON.stringify(attrs.strokes ?? []) }),
      },
      w: {
        default: 320,
        parseHTML: (el) => safeNumber(el.getAttribute('data-w'), 320),
        renderHTML: (attrs) => ({ 'data-w': String(attrs.w) }),
      },
      h: {
        default: 200,
        parseHTML: (el) => safeNumber(el.getAttribute('data-h'), 200),
        renderHTML: (attrs) => ({ 'data-h': String(attrs.h) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-drawing]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-drawing': '' })];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-drawing', '');
      dom.style.cssText = 'margin:8px 0;';

      const paint = (n: typeof node) => {
        const w = safeNumber(n.attrs.w, 320);
        const h = safeNumber(n.attrs.h, 200);
        const strokes: SerializedStroke[] = Array.isArray(n.attrs.strokes) ? n.attrs.strokes : [];
        const svgNs = 'http://www.w3.org/2000/svg';

        // Build with DOM APIs (not innerHTML) so nothing from the stored
        // attributes can be interpreted as markup.
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        svg.setAttribute('style', `max-width:${w}px;display:block;height:auto`);

        for (const s of strokes) {
          const d = toSvgPath(s?.d);
          if (!d) continue;
          const path = document.createElementNS(svgNs, 'path');
          path.setAttribute('d', d);
          path.setAttribute('stroke', safeColor(s?.c));
          path.setAttribute('stroke-width', String(safeNumber(s?.w, 3)));
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(path);
        }

        dom.replaceChildren(svg);
      };

      paint(node);

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== 'drawing') return false;
          paint(updated);
          return true;
        },
      };
    };
  },
});

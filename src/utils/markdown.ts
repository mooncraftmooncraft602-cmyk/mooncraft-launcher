/**
 * Tiny inline markdown renderer — no deps, no eval, escapes HTML first.
 * Supports: **bold**, *italic*, `code`, [text](url), # heading, - list, blockquote,
 * blank-line paragraphs. Suffit largement pour des patch notes.
 *
 * Consumer usage:
 *   <div className="md" dangerouslySetInnerHTML={renderMarkdown(text)} />
 */

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Apply inline rules to already-escaped text. */
function inline(s: string): string {
  // Code first (don't eat its content)
  s = s.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
  // Bold
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // Italic — single * not part of **
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // Links — only http(s)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label, url) => {
    return `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  });
  return s;
}

export interface RenderedMarkdown {
  __html: string;
}

export function renderMarkdown(input: string): RenderedMarkdown {
  if (!input) return { __html: "" };
  const lines = escape(input).split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // Heading
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl + 2} class="md-h md-h--${lvl}">${inline(h[2])}</h${lvl + 2}>`);
      i++;
      continue;
    }
    // Blockquote
    if (line.startsWith("> ")) {
      const block: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        block.push(inline(lines[i].slice(2)));
        i++;
      }
      out.push(`<blockquote class="md-quote">${block.join("<br/>")}</blockquote>`);
      continue;
    }
    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="md-list">${items.join("")}</ul>`);
      continue;
    }
    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="md-list">${items.join("")}</ol>`);
      continue;
    }
    // Paragraph: gather until blank
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[-*]\s|\d+\.\s|>\s)/.test(lines[i])) {
      para.push(inline(lines[i]));
      i++;
    }
    out.push(`<p class="md-p">${para.join("<br/>")}</p>`);
  }
  return { __html: out.join("") };
}

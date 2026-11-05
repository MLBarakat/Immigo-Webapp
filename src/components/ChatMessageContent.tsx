import type { ReactNode } from 'react';

type MessageBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'rule' };

// \b treats "_" as a word character, so intraword underscores (snake_case)
// are not mistaken for emphasis. Avoid lookbehind for older Safari support.
const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|\b__[^_\n]+__\b|`[^`\n]+`|~~[^~\n]+~~|\*[^*\n]+\*|\b_[^_\n]+_\b|\[[^\]\n]+\]\([^)\n]+\))/g;
const SAFE_LINK_PATTERN = /^\[([^\]\n]+)\]\(([^)\n]+)\)$/;

function isSafeLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE_PATTERN).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key} className="font-semibold">{renderInline(part.slice(2, -2), `${key}-strong`)}</strong>;
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <del key={key} className="line-through">{renderInline(part.slice(2, -2), `${key}-del`)}</del>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded bg-immigo-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-deep-navy">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key} className="italic">{renderInline(part.slice(1, -1), `${key}-em`)}</em>;
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={key} className="italic">{renderInline(part.slice(1, -1), `${key}-em`)}</em>;
    }

    const link = SAFE_LINK_PATTERN.exec(part);
    if (link) {
      if (!isSafeLink(link[2])) return link[1];
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-art-blue-600 underline underline-offset-2 hover:text-art-blue-700"
        >
          {renderInline(link[1], `${key}-link`)}
        </a>
      );
    }

    return part;
  });
}

function parseBlocks(content: string): MessageBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').trim().split('\n');
  const blocks: MessageBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: 'list', ...list });
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^(?:[-*_]\s*){3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'quote', text: quote[1] });
      continue;
    }

    const unordered = /^[-*+•]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderBlock(block: MessageBlock, index: number): ReactNode {
  const key = `block-${index}`;

  switch (block.type) {
    case 'heading': {
      const className = 'font-bold leading-snug text-deep-navy';
      const content = renderInline(block.text, `${key}-heading`);
      if (block.level === 1) return <h1 key={key} className={`text-lg ${className}`}>{content}</h1>;
      if (block.level === 2) return <h2 key={key} className={`text-base ${className}`}>{content}</h2>;
      return <h3 key={key} className={`text-sm ${className}`}>{content}</h3>;
    }
    case 'list': {
      const items = block.items.map((item, itemIndex) => (
        <li key={`${key}-item-${itemIndex}`}>{renderInline(item, `${key}-item-${itemIndex}`)}</li>
      ));
      const className = 'my-1 space-y-1 ps-5 marker:text-art-blue-500';
      return block.ordered
        ? <ol key={key} className={`list-decimal ${className}`}>{items}</ol>
        : <ul key={key} className={`list-disc ${className}`}>{items}</ul>;
    }
    case 'quote':
      return (
        <blockquote key={key} className="border-s-2 border-art-blue-300 ps-3 italic text-immigo-gray-700">
          {renderInline(block.text, `${key}-quote`)}
        </blockquote>
      );
    case 'rule':
      return <hr key={key} className="border-immigo-gray-200" />;
    case 'paragraph':
    default:
      return (
        <p key={key} className="whitespace-pre-wrap">
          {renderInline(block.lines.join('\n'), `${key}-paragraph`)}
        </p>
      );
  }
}

interface ChatMessageContentProps {
  content: string;
}

/** Renders assistant Markdown safely as React nodes — never raw HTML. */
export function ChatMessageContent({ content }: ChatMessageContentProps): JSX.Element {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-2.5 break-words text-start">
      {blocks.map(renderBlock)}
    </div>
  );
}

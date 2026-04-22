/* Lightweight markdown-ish renderer for blog posts.
   Supports: headings, bold, italic, inline code, dividers, blockquotes, lists, paragraphs.
   Output is a React element tree — no dangerouslySetInnerHTML.
*/

import React from 'react';

function renderInline(text, keyPrefix = '') {
  // Process in order: inline code → bold → italic
  const parts = [];
  let remaining = text;
  let key = 0;

  // Regex matches: `code`, **bold**, *italic*
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/;

  while (remaining.length > 0) {
    const match = remaining.match(pattern);
    if (!match) {
      parts.push(remaining);
      break;
    }

    // Push text before the match
    if (match.index > 0) {
      parts.push(remaining.slice(0, match.index));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(<code key={`${keyPrefix}-${key++}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-${key++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${keyPrefix}-${key++}`}>{token.slice(1, -1)}</em>);
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return parts;
}

export function renderMarkdown(raw) {
  if (!raw) return null;

  const lines = raw.trim().split('\n');
  const blocks = [];
  let paraBuffer = [];
  let listBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length > 0) {
      const text = paraBuffer.join(' ').trim();
      if (text) {
        blocks.push(
          <p key={`p-${blocks.length}`}>{renderInline(text, `p${blocks.length}`)}</p>
        );
      }
      paraBuffer = [];
    }
  };

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item, `li${blocks.length}-${i}`)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushPara();
      flushList();
      blocks.push(
        <h2 key={`h2-${blocks.length}`}>{renderInline(trimmed.slice(3))}</h2>
      );
    } else if (trimmed.startsWith('### ')) {
      flushPara();
      flushList();
      blocks.push(
        <h3 key={`h3-${blocks.length}`}>{renderInline(trimmed.slice(4))}</h3>
      );
    } else if (trimmed === '---') {
      flushPara();
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
    } else if (trimmed.startsWith('> ')) {
      flushPara();
      flushList();
      blocks.push(
        <blockquote key={`bq-${blocks.length}`}>
          {renderInline(trimmed.slice(2))}
        </blockquote>
      );
    } else if (trimmed.startsWith('- ')) {
      flushPara();
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList();
      paraBuffer.push(trimmed);
    }
  }

  flushPara();
  flushList();

  return blocks;
}

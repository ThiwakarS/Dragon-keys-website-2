/* =============================================
   DRAGON KEYS — markdown.jsx
   Lightweight renderer for blog post content.

   Supported syntax:
     ## Heading 2
     ### Heading 3
     **bold**
     *italic*
     `inline code`
     ---                     (horizontal rule)
     > quote
     - bullet

     [img:path/to/image.jpg | Optional caption]
     [video:path/to/clip.mp4 | Optional caption]
     [youtube:VIDEO_ID]
     [pdf:path/to/file.pdf | Optional button label]

   Blank line separates paragraphs.
============================================= */

import React from 'react';

function renderInline(text, keyPrefix = '') {
  const parts = [];
  let remaining = text;
  let key = 0;
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/;

  while (remaining.length > 0) {
    const match = remaining.match(pattern);
    if (!match) {
      parts.push(remaining);
      break;
    }
    if (match.index > 0) parts.push(remaining.slice(0, match.index));

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

function parseEmbed(line) {
  const match = line.match(/^\[(img|video|youtube|pdf):([^\]]+)\]$/);
  if (!match) return null;
  const type = match[1];
  const body = match[2].trim();
  const parts = body.split('|').map((s) => s.trim());
  return { type, src: parts[0], caption: parts[1] || null };
}

function renderEmbed(embed, idx) {
  const key = `embed-${idx}`;
  switch (embed.type) {
    case 'img':
      return (
        <figure key={key} className="post-embed-img">
          <img src={embed.src} alt={embed.caption || ''} loading="lazy" />
          {embed.caption && (
            <figcaption className="post-embed-caption">{embed.caption}</figcaption>
          )}
        </figure>
      );
    case 'video':
      return (
        <figure key={key} className="post-embed-video">
          <video src={embed.src} controls preload="metadata" />
          {embed.caption && (
            <figcaption className="post-embed-caption">{embed.caption}</figcaption>
          )}
        </figure>
      );
    case 'youtube':
      return (
        <div key={key} className="post-embed-youtube">
          <iframe
            src={`https://www.youtube.com/embed/${embed.src}`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    case 'pdf':
      return (
        <div key={key} className="post-embed-pdf">
          <a
            href={embed.src}
            className="btn btn-primary btn-small"
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            📄 {embed.caption || 'Download PDF'}
          </a>
        </div>
      );
    default:
      return null;
  }
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

    // Embed tokens — check first
    const embed = parseEmbed(trimmed);
    if (embed) {
      flushPara();
      flushList();
      blocks.push(renderEmbed(embed, blocks.length));
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushPara(); flushList();
      blocks.push(<h2 key={`h2-${blocks.length}`}>{renderInline(trimmed.slice(3))}</h2>);
    } else if (trimmed.startsWith('### ')) {
      flushPara(); flushList();
      blocks.push(<h3 key={`h3-${blocks.length}`}>{renderInline(trimmed.slice(4))}</h3>);
    } else if (trimmed === '---') {
      flushPara(); flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
    } else if (trimmed.startsWith('> ')) {
      flushPara(); flushList();
      blocks.push(
        <blockquote key={`bq-${blocks.length}`}>{renderInline(trimmed.slice(2))}</blockquote>
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
import sanitizeHtmlLib from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'mark',
  'small',
  'sub',
  'sup',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'figure',
  'figcaption',
];

const ALLOWED_ATTRIBUTES: Record<string, sanitizeHtmlLib.AllowedAttribute[]> = {
  a: ['href', 'target', 'rel', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  '*': ['class'],
};

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return sanitizeHtmlLib(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      // Força rel="noopener noreferrer" em todos os links para não vazar opener.
      a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });
}

import DOMPurify from 'isomorphic-dompurify';

// Tags/atributos seguros o suficiente para texto rico de CMS e descrição de
// produto, sem permitir vetores de XSS (<script>, on*, javascript:, <iframe>,
// <object>, <form>, etc. são removidos pelo DOMPurify).
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

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'class',
  'colspan',
  'rowspan',
  'width',
  'height',
];

/**
 * Sanitiza HTML vindo do CMS / descrição de produto antes de injetar via
 * `dangerouslySetInnerHTML`. Remove scripts, handlers de evento e URIs
 * perigosas, preservando a formatação de texto que o conteúdo legítimo usa.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Força links externos a não vazarem o opener e abrirem com segurança.
    ADD_ATTR: ['target'],
  });
}

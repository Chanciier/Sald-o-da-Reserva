import type { proto } from '@whiskeysockets/baileys';

export type RelayKind = 'text' | 'image' | 'video' | 'document' | 'audio';

export interface RelayMessageInfo {
  kind: RelayKind;
  /** Início do texto/legenda — só para identificar a mensagem no painel. */
  preview: string | null;
  /**
   * Só o conteúdo a ser copiado (texto/mídia), sem os campos internos da
   * mensagem original (chaves de criptografia do grupo de origem etc.).
   */
  content: proto.IMessage;
}

const PREVIEW_MAX = 120;

// Envelopes que o WhatsApp põe em volta do conteúdo real.
const WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
] as const;

function unwrap(content: proto.IMessage | null | undefined): proto.IMessage | null {
  let current = content ?? null;
  for (let depth = 0; current && depth < 5; depth++) {
    const wrapper = WRAPPERS.find((key) => current?.[key]?.message);
    if (!wrapper) break;
    current = current[wrapper]!.message ?? null;
  }
  return current;
}

/**
 * Classifica uma mensagem para o repasse. Retorna null para o que não deve ser
 * copiado: reações, enquetes, figurinhas, mensagens apagadas/editadas etc.
 */
export function describeRelayMessage(message: {
  message?: proto.IMessage | null;
}): RelayMessageInfo | null {
  const c = unwrap(message.message);
  if (!c) return null;

  let kind: RelayKind;
  let text: string | null | undefined;
  let content: proto.IMessage;
  if (c.conversation != null) {
    kind = 'text';
    text = c.conversation;
    content = { conversation: c.conversation };
  } else if (c.extendedTextMessage) {
    kind = 'text';
    text = c.extendedTextMessage.text;
    content = { extendedTextMessage: c.extendedTextMessage };
  } else if (c.imageMessage) {
    kind = 'image';
    text = c.imageMessage.caption;
    content = { imageMessage: c.imageMessage };
  } else if (c.videoMessage) {
    kind = 'video';
    text = c.videoMessage.caption;
    content = { videoMessage: c.videoMessage };
  } else if (c.documentMessage) {
    kind = 'document';
    text = c.documentMessage.caption || c.documentMessage.fileName;
    content = { documentMessage: c.documentMessage };
  } else if (c.audioMessage) {
    kind = 'audio';
    text = null;
    content = { audioMessage: c.audioMessage };
  } else {
    return null;
  }

  if (kind === 'text' && !text?.trim()) return null;
  const preview = text?.trim().replace(/\s+/g, ' ').slice(0, PREVIEW_MAX) || null;
  return { kind, preview, content };
}

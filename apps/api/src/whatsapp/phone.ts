/** Normaliza telefone BR (apenas dígitos) para o JID do WhatsApp. */
export function phoneToWhatsappJid(phone?: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (!d) return null;
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return `55${d}@s.whatsapp.net`;
}

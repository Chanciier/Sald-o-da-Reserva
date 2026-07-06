'use client';

import type { ReviewPanelState } from '@/components/products/review-panel-state';

/** Grupo de WhatsApp ativo, já filtrado pela página. */
export interface WhatsappGroupOption {
  id: string;
  name: string;
}

const CHANNELS = [
  { value: 'MERCADO_LIVRE', label: 'Mercado Livre' },
  { value: 'SHOPEE', label: 'Shopee' },
] as const;

interface ReviewPublishSectionProps {
  value: ReviewPanelState;
  whatsappGroups: WhatsappGroupOption[];
  onChange: (value: ReviewPanelState) => void;
}

/**
 * Bloco de publicação do painel do Funcionário Virtual: canais de venda,
 * disparo de WhatsApp (que acontece já no PRIMEIRO salvamento, com a foto
 * principal) e retirada na loja. Extraído do painel para manter cada arquivo
 * pequeno.
 */
export function ReviewPublishSection({
  value,
  whatsappGroups,
  onChange,
}: ReviewPublishSectionProps) {
  function update<K extends keyof ReviewPanelState>(key: K, next: ReviewPanelState[K]) {
    onChange({ ...value, [key]: next });
  }

  function toggleChannel(channel: 'MERCADO_LIVRE' | 'SHOPEE', checked: boolean) {
    update(
      'publishTo',
      checked ? [...value.publishTo, channel] : value.publishTo.filter((c) => c !== channel),
    );
  }

  function toggleGroup(groupId: string, checked: boolean) {
    update(
      'whatsappGroupIds',
      checked
        ? [...value.whatsappGroupIds, groupId]
        : value.whatsappGroupIds.filter((id) => id !== groupId),
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Publicação ao salvar
      </p>

      {/* Canais de venda */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Canais de venda</p>
        <label className="flex items-center gap-2 opacity-70">
          <input type="checkbox" checked disabled className="h-4 w-4 accent-primary" />
          <span className="text-sm">Site próprio (sempre incluído)</span>
        </label>
        {CHANNELS.map((ch) => (
          <label key={ch.value} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value.publishTo.includes(ch.value)}
              onChange={(e) => toggleChannel(ch.value, e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm">{ch.label}</span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Marketplaces sem credenciais ficam com erro visível no painel — o cadastro no site não é
          afetado.
        </p>
      </div>

      {/* WhatsApp */}
      <div className="space-y-1.5 border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value.autoPublishWhatsapp}
            onChange={(e) => update('autoPublishWhatsapp', e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm font-medium">Disparar no WhatsApp ao salvar</span>
        </label>
        <p className="text-xs text-muted-foreground">
          O anúncio sai com a foto principal já no primeiro salvamento.
        </p>
        {value.autoPublishWhatsapp &&
          (whatsappGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum grupo ativo.{' '}
              <a href="/admin/whatsapp" className="underline hover:text-foreground">
                Cadastrar grupo
              </a>
            </p>
          ) : (
            <div className="space-y-1 pl-6">
              {whatsappGroups.map((g) => (
                <label key={g.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.whatsappGroupIds.includes(g.id)}
                    onChange={(e) => toggleGroup(g.id, e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm">{g.name}</span>
                </label>
              ))}
            </div>
          ))}
      </div>

      {/* Retirada na loja */}
      <div className="border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value.pickupAvailable}
            onChange={(e) => update('pickupAvailable', e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm">Disponível para retirada na loja</span>
        </label>
      </div>
    </div>
  );
}

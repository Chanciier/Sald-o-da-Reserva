import Link from 'next/link';
import { ShieldCheck, Truck, Headphones } from 'lucide-react';

const reassurance = [
  { icon: ShieldCheck, label: 'Compra segura' },
  { icon: Truck, label: 'Envio nacional' },
  { icon: Headphones, label: 'Suporte humano' },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12">
        {/* Reassurance bar */}
        <div className="flex flex-wrap justify-center gap-8 border-b border-border pb-8 sm:gap-16">
          {reassurance.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                <item.icon className="size-5" />
              </div>
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary font-mono text-base font-black text-secondary">
                SR
              </span>
              <span className="font-heading text-lg font-extrabold text-foreground">
                Saldão da Reversa
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Produtos de logística reversa revisados e garantidos, com economia de até 80% e envio
              para todo o Brasil.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">Categorias</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/produtos?categoria=eletronicos" className="hover:text-foreground">
                  Eletrônicos
                </a>
              </li>
              <li>
                <a href="/produtos?categoria=ferramentas" className="hover:text-foreground">
                  Ferramentas
                </a>
              </li>
              <li>
                <a href="/produtos?categoria=cozinha" className="hover:text-foreground">
                  Cozinha
                </a>
              </li>
              <li>
                <a href="/produtos?categoria=casa" className="hover:text-foreground">
                  Casa
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">Ajuda</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/#como-funciona" className="hover:text-foreground">
                  Como funciona
                </a>
              </li>
              <li>
                <a href="/pedidos" className="hover:text-foreground">
                  Rastrear pedido
                </a>
              </li>
              <li>
                <Link href="/faq" className="hover:text-foreground">
                  Perguntas frequentes
                </Link>
              </li>
              <li>
                <Link href="/contato" className="hover:text-foreground">
                  Fale conosco
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">Atendimento</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Seg a Sex, 8h às 20h</li>
              <li>Sáb, 9h às 15h</li>
              <li>
                <a href="mailto:contato@saldaodareserva.com.br" className="hover:text-foreground">
                  contato@saldaodareserva.com.br
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-border pt-6 text-center text-xs text-muted-foreground sm:gap-2">
          <p>© {new Date().getFullYear()} Saldão da Reserva. Todos os direitos reservados.</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link href="/termos-de-uso" className="hover:text-foreground">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/cookies" className="hover:text-foreground">
              Cookies
            </Link>
            <Link href="/trocas-e-devolucoes" className="hover:text-foreground">
              Trocas e Devoluções
            </Link>
            <Link href="/entregas" className="hover:text-foreground">
              Entregas
            </Link>
            <Link href="/sobre" className="hover:text-foreground">
              Sobre Nós
            </Link>
            <Link href="/contato" className="hover:text-foreground">
              Contato
            </Link>
            <Link href="/faq" className="hover:text-foreground">
              FAQ
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

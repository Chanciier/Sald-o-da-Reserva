'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  ArrowUpRight,
  Crown,
  Heart,
  Instagram,
  MapPin,
  MessageCircle,
  Share2,
  Tag,
} from 'lucide-react';
import styles from './links.module.css';

const LINKS = [
  {
    label: 'Assinatura Clube Saldão',
    description: 'Assine e receba seus achados em casa',
    icon: Crown,
    tone: 'link-card-yellow',
    href: '/produtos/clube-reversa',
  },
  {
    label: 'Grupo de Descontos',
    description: 'Ofertas relâmpago todo dia no seu zap',
    icon: Tag,
    tone: 'link-card-red',
    href: '/grupos',
  },
  {
    label: 'Grupo de Sex Shop',
    description: 'Novidades e promoções exclusivas',
    icon: Heart,
    tone: 'link-card-pink',
    href: '/grupos/sex-shop',
  },
];

const INSTAGRAM_URL = 'https://www.instagram.com/saldaodareversasjc/';
const WHATSAPP_URL = 'https://wa.me/5512981116645';

export function LinksClient() {
  const [notice, setNotice] = useState('');

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Saldão da Reversa SJC',
          text: 'Os melhores achados estão aqui.',
          url,
        });
      } catch {
        // compartilhamento cancelado pelo usuário
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showNotice('Link da loja copiado');
    } catch {
      showNotice('Não foi possível copiar o link');
    }
  };

  return (
    <main className={styles['page-shell']}>
      <div className={`${styles['background-shape']} ${styles['background-shape-one']}`} />
      <div className={`${styles['background-shape']} ${styles['background-shape-two']}`} />

      <section className={styles['link-page']} aria-label="Links do Saldão da Reversa">
        <header className={styles.topbar}>
          <span className={styles['topbar-label']}>SJC · DESDE 2025</span>
          <button
            className={styles['share-button']}
            type="button"
            onClick={() => void handleShare()}
            aria-label="Compartilhar página"
          >
            <Share2 size={17} strokeWidth={2.4} />
            <span>Compartilhar</span>
          </button>
        </header>

        <div className={styles['profile-block']}>
          <div className={styles['logo-frame']}>
            <Image
              src="/images/links-logo.png"
              alt="Logo Saldão da Reversa SJC"
              width={260}
              height={260}
              priority
            />
          </div>
          <div className={styles['profile-copy']}>
            <div className={styles.eyebrow}>
              <span /> O CLUBE DE QUEM SABE COMPRAR
            </div>
            <h1 className={styles.title}>
              Saldão
              <br />
              <em>da Reversa</em>
            </h1>
            <p>
              Preço baixo não é sorte.
              <br />É o nosso jeito de fazer.
            </p>
          </div>
        </div>

        <div className={styles['location-line']}>
          <MapPin size={15} strokeWidth={2.5} />
          <span>São José dos Campos · SP</span>
          <span className={styles['location-dot']} />
          <span>Achados que valem a pena</span>
        </div>

        <nav className={styles['links-list']}>
          {LINKS.map(({ label, description, icon: Icon, tone, href }) => (
            <a key={label} className={`${styles['link-card']} ${styles[tone]}`} href={href}>
              <span className={styles['link-icon']}>
                <Icon size={20} strokeWidth={2.5} />
              </span>
              <span className={styles['link-text']}>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight className={styles['link-arrow']} size={20} strokeWidth={2.4} />
            </a>
          ))}
        </nav>

        <footer className={styles.footer}>
          <div className={styles.socials} aria-label="Redes sociais">
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <Instagram size={18} />
            </a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
              <MessageCircle size={18} />
            </a>
          </div>
          <span className={styles['footer-mark']}>
            SALDÃO DA REVERSA <b>×</b> SJC
          </span>
        </footer>
      </section>

      {notice && (
        <div className={styles.toast} role="status">
          {notice}
        </div>
      )}
    </main>
  );
}

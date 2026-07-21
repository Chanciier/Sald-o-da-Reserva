import type { Metadata } from 'next';
import Script from 'next/script';
import { Suspense } from 'react';
import { GruposClient } from './grupos-client';

export const metadata: Metadata = {
  title: 'Grupos de Ofertas no WhatsApp | Saldão da Reversa',
  description:
    'Entre no grupo de ofertas do Saldão da Reversa no WhatsApp e receba promoções exclusivas em primeira mão.',
};

const META_PIXEL_ID = '1003262182463620';

// Link único de divulgação: /grupos. O hub escolhe automaticamente o grupo
// com vaga e ocupação mais baixa — nunca divulgamos link individual de grupo.
export default function GruposPage() {
  return (
    <>
      <Script id="meta-pixel-grupos" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
      <Suspense fallback={null}>
        <GruposClient />
      </Suspense>
    </>
  );
}

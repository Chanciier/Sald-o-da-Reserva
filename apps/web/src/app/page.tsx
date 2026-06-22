import { Hero } from '@/components/landing/hero';
import { SocialProof } from '@/components/landing/social-proof';
import { Benefits } from '@/components/landing/benefits';
import { FeaturedProducts } from '@/components/landing/featured-products';
import { HowItWorks } from '@/components/landing/how-it-works';
import { UrgencyBanner } from '@/components/landing/urgency-banner';
import { FinalCta } from '@/components/landing/final-cta';
import { MobileCtaBar } from '@/components/landing/mobile-cta-bar';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <SocialProof />
      <FeaturedProducts />
      <Benefits />
      <HowItWorks />
      <UrgencyBanner />
      <FinalCta />
      <MobileCtaBar />
    </main>
  );
}

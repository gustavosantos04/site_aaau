import { AboutSection } from "@/components/home/about-section";
import { AchievementsSection } from "@/components/home/achievements-section";
import { FeaturedProductsSection } from "@/components/home/featured-products-section";
import { FinalCtaSection } from "@/components/home/final-cta-section";
import { HeroSection } from "@/components/home/hero-section";
import { ManagementSection } from "@/components/home/management-section";
import { Preloader } from "@/components/home/preloader";
import { SponsorsSection } from "@/components/home/sponsors-section";
import { SportsSection } from "@/components/home/sports-section";
import { getFeaturedProducts } from "@/lib/data/store";
import { UpcomingSalePopup } from "@/components/events/upcoming-sale-popup";

export default async function HomePage() {
  const products = await getFeaturedProducts();

  return (
    <>
      <Preloader />
      <UpcomingSalePopup />
      <HeroSection />
      <AboutSection />
      {/* <TimelineSection /> */}
      <FeaturedProductsSection products={products} />
      <AchievementsSection />
      <SportsSection />
      <ManagementSection />
      <SponsorsSection />
      <FinalCtaSection />
    </>
  );
}

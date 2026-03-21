import { AboutSection } from "@/components/home/about-section";
import { AchievementsSection } from "@/components/home/achievements-section";
import { CampusesSection } from "@/components/home/campuses-section";
import { EventsSection } from "@/components/home/events-section";
import { FeaturedProductsSection } from "@/components/home/featured-products-section";
import { FinalCtaSection } from "@/components/home/final-cta-section";
import { HeroSection } from "@/components/home/hero-section";
import { ManagementSection } from "@/components/home/management-section";
import { Preloader } from "@/components/home/preloader";
import { SponsorsSection } from "@/components/home/sponsors-section";
import { SportsSection } from "@/components/home/sports-section";
import { TimelineSection } from "@/components/home/timeline-section";
import { getEvents, getFeaturedProducts } from "@/lib/data/store";

export default async function HomePage() {
  const [products, events] = await Promise.all([getFeaturedProducts(), getEvents()]);

  return (
    <>
      <Preloader />
      <HeroSection />
      <AboutSection />
      <TimelineSection />
      <FeaturedProductsSection products={products} />
      <AchievementsSection />
      <SportsSection />
      <EventsSection events={events} />
      <ManagementSection />
      <SponsorsSection />
      <CampusesSection />
      <FinalCtaSection />
    </>
  );
}

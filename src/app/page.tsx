"use client";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { HeroSlider } from "@/components/home/HeroSlider";
import { AcademicsSection } from "@/components/home/AcademicsSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { GallerySection } from "@/components/home/GallerySection";
import { AboutSection } from "@/components/home/AboutSection";
import { AdmissionsSection } from "@/components/home/AdmissionsSection";
import { CareerSection } from "@/components/home/CareerSection";
import { ContactSection } from "@/components/home/ContactSection";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-off-white overflow-x-hidden">
      <Navbar />

      <main className="flex-1">
        <HeroSlider />
        <AboutSection />
        <AcademicsSection />
        <AdmissionsSection />
        <FeaturesSection />
        <GallerySection />
        <TestimonialsSection />
        <CareerSection />
        <ContactSection />
      </main>

      <Footer />
    </div>
  );
}

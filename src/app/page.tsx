"use client";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { HeroSlider } from "@/components/home/HeroSlider";
import { AcademicsSection } from "@/components/home/AcademicsSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { GallerySection } from "@/components/home/GallerySection";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-off-white overflow-x-hidden">
      <Navbar />

      <main className="flex-1">
        <HeroSlider />
        <AcademicsSection />
        <FeaturesSection />
        <GallerySection />
        <TestimonialsSection />
      </main>

      <Footer />
    </div>
  );
}

"use client";

import { ThreeDMarquee } from "@/components/ui/3d-marquee";

const images = [
  "/screen1-dashboard.png",
  "/screen4-applications.png",
  "/screen2-ats.png",
  "/screen5-skills.png",
  "/screen3-match.png",
  "/screen6-pipeline.png",
  "/screen7-detail.png",
  "/screen8-analytics.png",
];

export default function ThreeDMarqueeDemo() {
  return (
    <div className="mx-auto my-10 max-w-7xl rounded-3xl bg-surface-100/40 p-2 border border-surface-300 hidden md:block">
      <ThreeDMarquee images={images} />
    </div>
  );
}


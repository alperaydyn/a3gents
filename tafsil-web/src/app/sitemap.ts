import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { mockKavramlar } from "@/data/kavramlar.mock";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/gizlilik`, changeFrequency: "yearly", priority: 0.3 },
    ...mockKavramlar.map((k) => ({
      url: `${SITE_URL}/kavram/${k.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}

import type { MetadataRoute } from "next";

/** App privada: ningún buscador debe indexarla (además del `noindex` en los metadatos). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

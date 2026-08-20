import { useEffect } from "react";
import { getSiteUrl } from "../lib/site";

function setMeta(attribute, value, content) {
  let element = document.head.querySelector(`meta[${attribute}="${value}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setLink(rel, href) {
  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

export default function Seo({ title, description, path = "/", noindex = false, schema }) {
  useEffect(() => {
    const canonicalUrl = `${getSiteUrl()}${path === "/" ? "/" : path}`;
    document.title = title;

    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, nofollow, noarchive" : "index, follow");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "musicAdda");
    setMeta("property", "og:image", `${getSiteUrl()}/favicon.png`);
    setMeta("property", "og:image:alt", "musicAdda listening room logo");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", `${getSiteUrl()}/favicon.png`);
    setLink("canonical", canonicalUrl);

    const existingSchema = document.head.querySelector("script[data-seo-schema]");
    if (existingSchema) existingSchema.remove();
    if (schema) {
      const schemaScript = document.createElement("script");
      schemaScript.type = "application/ld+json";
      schemaScript.dataset.seoSchema = "true";
      schemaScript.textContent = JSON.stringify(schema);
      document.head.appendChild(schemaScript);
    }

    return () => {
      const currentSchema = document.head.querySelector("script[data-seo-schema]");
      if (currentSchema) currentSchema.remove();
    };
  }, [description, noindex, path, schema, title]);

  return null;
}
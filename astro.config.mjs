import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://roverandco.be",
  output: "server",
  adapter: cloudflare(),
  trailingSlash: "ignore",
  build: { format: "file" },
});

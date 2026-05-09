import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  turbopack: {
    root: here,
    // ESM-with-`.js`-extension convention used in src/. Map *.js → *.ts.
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
    rules: {},
  },
};

export default nextConfig;

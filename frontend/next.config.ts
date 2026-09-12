import type { NextConfig } from "next";
import { resolveApiOrigin } from "./config/api-origin.ts";

// FastAPI (app.py) runs on :8000 while Next dev serves :3000, so a relative
// fetch to /api/v1/* would hit Next and 404. Proxy those paths to the backend
// instead: same-origin from the browser's point of view, so no CORS either.
const API_ORIGIN = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

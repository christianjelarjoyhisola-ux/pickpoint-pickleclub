/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://*.supabase.co",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const CANONICAL_HOSTNAME = "pickpointpickle.com";
const WWW_HOSTNAME = `www.${CANONICAL_HOSTNAME}`;
const SHARED_SUPABASE_ORIGIN = "https://neqvrwtofiolcuxewdze.supabase.co";
const REGISTERED_TENANT_ORIGIN = "https://pickpoint-pickleclub.christianjelarjoyhisola.workers.dev";
const PLATFORM_PROXY_PREFIX = "/__platform/";
const ALLOWED_PLATFORM_PATH = /^(?:rest\/v1\/rpc\/[a-z0-9_-]+|functions\/v1\/[a-z0-9_-]+)$/;

async function proxyPlatformRequest(request: Request, url: URL): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  const platformPath = url.pathname.slice(PLATFORM_PROXY_PREFIX.length);
  if (!ALLOWED_PLATFORM_PATH.test(platformPath)) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.set("Origin", REGISTERED_TENANT_ORIGIN);
  const target = new URL(`/${platformPath}${url.search}`, SHARED_SUPABASE_ORIGIN);
  return fetch(target, {
    method: "POST",
    headers,
    body: request.body,
    redirect: "manual",
  });
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const isHttps = new URL(request.url).protocol === "https:";

  headers.set(
    "Content-Security-Policy",
    isHttps
      ? `${CONTENT_SECURITY_POLICY}; upgrade-insecure-requests`
      : CONTENT_SECURITY_POLICY,
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");

  if (isHttps) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  } else {
    headers.delete("Strict-Transport-Security");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname.toLowerCase() === WWW_HOSTNAME) {
      url.hostname = CANONICAL_HOSTNAME;
      return withSecurityHeaders(Response.redirect(url, 308), request);
    }

    if (url.pathname.startsWith(PLATFORM_PROXY_PREFIX)) {
      return withSecurityHeaders(await proxyPlatformRequest(request, url), request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, request);
    }

    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(response, request);
  },
};

export default worker;

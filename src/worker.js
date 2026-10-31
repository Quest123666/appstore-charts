import { onRequestGet as handleCharts } from "./api/charts.js";
import { onRequestGet as handleApp } from "./api/app.js";

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "img-src 'self' https://*.mzstatic.com data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "upgrade-insecure-requests",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (response.status === 204 || response.status === 304) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/api/charts" || path === "/api/app") {
      if (request.method !== "GET") {
        return withSecurityHeaders(
          json(
            {
              ok: false,
              error: {
                code: "METHOD_NOT_ALLOWED",
                message: "该接口仅支持 GET 请求",
              },
            },
            405,
            { allow: "GET" },
          ),
        );
      }

      const handler = path === "/api/charts" ? handleCharts : handleApp;
      try {
        const response = await handler({
          request,
          env,
          waitUntil: (promise) => {
            try {
              ctx.waitUntil(promise);
            } catch {
              // waitUntil 不可用时忽略后台缓存写入。
            }
          },
        });
        return withSecurityHeaders(response);
      } catch {
        return withSecurityHeaders(
          json(
            {
              ok: false,
              error: {
                code: "INTERNAL_ERROR",
                message: "服务暂时不可用，请稍后重试",
              },
            },
            500,
          ),
        );
      }
    }

    if (path === "/api" || path.startsWith("/api/")) {
      return withSecurityHeaders(
        json(
          {
            ok: false,
            error: { code: "NOT_FOUND", message: "接口不存在" },
          },
          404,
        ),
      );
    }

    try {
      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse);
    } catch {
      return withSecurityHeaders(
        json(
          {
            ok: false,
            error: { code: "ASSET_UNAVAILABLE", message: "页面暂时不可用" },
          },
          500,
        ),
      );
    }
  },
};

import { onRequestGet as handleCharts } from "./api/charts.js";
import { onRequestGet as handleApp } from "./api/app.js";
import { onRequestGet as handleApps } from "./api/apps.js";

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "img-src 'self' https://*.mzstatic.com data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self' https://itunes.apple.com",
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

function withSecurityHeaders(response, path = "") {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  // 页面代码始终走 revalidate，保证 GitHub 更新部署后浏览器能拿到新版本。
  const isApi = path === "/api" || path.startsWith("/api/");
  if (
    !isApi &&
    (path === "/" ||
      /\.(?:html|css|js)$/i.test(path) ||
      response.status === 404 ||
      response.status >= 500)
  ) {
    headers.set("cache-control", "public, max-age=0, must-revalidate");
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

    if (path === "/api/charts" || path === "/api/app" || path === "/api/apps") {
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
          path,
        );
      }

      const handler =
        path === "/api/charts"
          ? handleCharts
          : path === "/api/app"
            ? handleApp
            : handleApps;
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
        return withSecurityHeaders(response, path);
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
          path,
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
        path,
      );
    }

    try {
      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse, path);
    } catch {
      return withSecurityHeaders(
        json(
          {
            ok: false,
            error: { code: "ASSET_UNAVAILABLE", message: "页面暂时不可用" },
          },
          500,
        ),
        path,
      );
    }
  },
};

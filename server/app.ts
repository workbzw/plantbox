import { timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { DomainError, WarehouseRepository } from "./repository.ts";
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new DomainError("需要 JSON 请求", 415);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16_384) throw new DomainError("请求过大", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new DomainError("JSON 格式无效", 400);
  }
}
export function createWarehouseServer(
  repository: WarehouseRepository,
  options: { token?: string; dist?: string; allowedOrigins?: string[] } = {},
) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        const hostname = new URL(`http://${req.headers.host ?? "localhost"}`)
          .hostname;
        if (
          !options.token &&
          !["localhost", "127.0.0.1", "[::1]"].includes(hostname)
        )
          throw new DomainError("后台访问凭据无效", 401);

        if (options.token) {
          const provided = Buffer.from(req.headers.authorization ?? "");
          const expected = Buffer.from(`Bearer ${options.token}`);
          if (
            provided.length !== expected.length ||
            !timingSafeEqual(provided, expected)
          )
            throw new DomainError("后台访问凭据无效", 401);
        }
        // Same-origin browser writes only; scanner services may use Bearer-authenticated HTTP.
        const origin = req.headers.origin;
        const allowed = new Set([
          `http://${req.headers.host}`,
          `https://${req.headers.host}`,
          ...(options.allowedOrigins ?? []),
        ]);
        if (origin && !allowed.has(origin))
          throw new DomainError("不允许跨站请求", 403);
        if (req.headers["sec-fetch-site"] === "cross-site")
          throw new DomainError("不允许跨站请求", 403);
        if (req.method === "GET" && url.pathname === "/api/v1/snapshot")
          return json(res, 200, repository.snapshot());
        if (req.method === "GET" && url.pathname === "/api/health")
          return json(res, 200, { ok: true, schemaVersion: 1 });
        if (req.method === "POST" && url.pathname === "/api/v1/commands")
          return json(res, 200, repository.execute(await body(req)));
        return json(res, 404, { error: "接口不存在" });
      }
      if (options.dist && (req.method === "GET" || req.method === "HEAD")) {
        const root = resolve(options.dist),
          file = resolve(
            root,
            "." +
              decodeURIComponent(
                url.pathname === "/" ? "/index.html" : url.pathname,
              ),
          );
        if (!file.startsWith(root + sep))
          return json(res, 404, { error: "Not found" });
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) return json(res, 404, { error: "Not found" });
        const types: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
          ".woff2": "font/woff2",
          ".ttf": "font/ttf",
        };
        res.writeHead(200, {
          "Content-Type": types[extname(file)] ?? "application/octet-stream",
          "Cache-Control": url.pathname.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(req.method === "HEAD" ? undefined : await readFile(file));
        return;
      }
      json(res, 404, { error: "Not found" });
    } catch (error) {
      const status = error instanceof DomainError ? error.status : 500;
      if (status === 500) console.error(error);
      json(res, status, {
        error:
          error instanceof DomainError ? error.message : "服务暂时无法处理请求",
      });
    }
  });
}

/**
 * 高手揪派 — Cloudflare Workers 後端入口
 * 第一階段：骨架就緒，第二階段接上 Notion API
 */

export default {
  async fetch(request, env) {
    var url = new URL(request.url);

    // 允許 GitHub Pages 前端跨域呼叫
    var corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 健康檢查
    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        studio: env.STUDIO_NAME || "高手揪派",
        message: "後端 API 運作中（第一階段骨架）"
      }, corsHeaders);
    }

    // 第二階段會實作以下路由：
    // GET  /api/member?userId=xxx
    // GET  /api/courses?year=2026&month=6
    // POST /api/book
    // POST /api/cancel

    return jsonResponse({
      ok: false,
      message: "此 API 尚未實作，請等待第二階段"
    }, corsHeaders, 404);
  }
};

function jsonResponse(data, extraHeaders, status) {
  var headers = Object.assign({
    "Content-Type": "application/json; charset=utf-8"
  }, extraHeaders || {});

  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: headers
  });
}

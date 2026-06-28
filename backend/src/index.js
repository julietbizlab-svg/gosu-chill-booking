/**
 * 高手揪派 — Cloudflare Workers 後端 API
 */
import {
  ensureNotionEnv,
  getMemberByUserId,
  getCoursesByMonth,
  getActiveBookingsByUser,
  bookCourse,
  cancelBooking
} from "./notion.js";

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (url.pathname === "/api/health") {
        return jsonResponse({
          ok: true,
          studio: env.STUDIO_NAME || "高手揪派",
          notion: Boolean(env.NOTION_TOKEN)
        }, corsHeaders);
      }

      if (url.pathname === "/api/member" && request.method === "GET") {
        ensureNotionEnv(env);
        var userId = url.searchParams.get("userId");

        if (!userId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }

        var member = await getMemberByUserId(env, userId);

        if (!member) {
          return jsonResponse({
            displayName: "新學員",
            credits: 0,
            expiresAt: "—",
            status: "pending",
            isNew: true
          }, corsHeaders);
        }

        return jsonResponse({
          displayName: member.displayName,
          credits: member.credits,
          expiresAt: member.expiresAt,
          status: member.status,
          isNew: false
        }, corsHeaders);
      }

      if (url.pathname === "/api/courses" && request.method === "GET") {
        ensureNotionEnv(env);
        var year = Number(url.searchParams.get("year"));
        var month = Number(url.searchParams.get("month"));
        var coursesUserId = url.searchParams.get("userId") || "";

        if (!year || !month) {
          return jsonResponse({ ok: false, message: "缺少 year 或 month" }, corsHeaders, 400);
        }

        var courses = await getCoursesByMonth(env, year, month);
        var bookedIds = new Set();

        if (coursesUserId) {
          var bookings = await getActiveBookingsByUser(env, coursesUserId);
          bookings.forEach(function (b) { bookedIds.add(b.courseId); });
        }

        var courseList = courses.map(function (course) {
          return {
            id: course.id,
            title: course.title,
            date: course.date,
            time: course.time,
            instructor: course.instructor,
            capacity: course.capacity,
            enrolled: course.enrolled,
            isBooked: bookedIds.has(course.id)
          };
        });

        return jsonResponse(courseList, corsHeaders);
      }

      if (url.pathname === "/api/book" && request.method === "POST") {
        ensureNotionEnv(env);
        var bookBody = await readJson(request);
        var result = await bookCourse(env, bookBody.userId, bookBody.courseId);
        return jsonResponse(result, corsHeaders);
      }

      if (url.pathname === "/api/cancel" && request.method === "POST") {
        ensureNotionEnv(env);
        var cancelBody = await readJson(request);
        var cancelResult = await cancelBooking(env, cancelBody.userId, cancelBody.courseId);
        return jsonResponse(cancelResult, corsHeaders);
      }

      return jsonResponse({ ok: false, message: "找不到此 API" }, corsHeaders, 404);
    } catch (error) {
      console.error("[API]", error);
      return jsonResponse({
        ok: false,
        message: error.message || "伺服器錯誤"
      }, corsHeaders, 400);
    }
  }
};

async function readJson(request) {
  try {
    return await request.json();
  } catch (ignore) {
    throw new Error("請求格式錯誤");
  }
}

function jsonResponse(data, extraHeaders, status) {
  var headers = Object.assign({
    "Content-Type": "application/json; charset=utf-8"
  }, extraHeaders || {});

  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: headers
  });
}

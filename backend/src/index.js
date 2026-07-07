/**
 * 高手揪派 — Cloudflare Workers 後端 API
 */
import {
  ensureNotionEnv,
  getOrCreateMember,
  getCoursesByMonth,
  getActiveBookingsByUser,
  bookCourse,
  cancelBooking,
  getTeacherScheduleForDate,
  getTeacherMonthOverview,
  getTeacherAccessStatus,
  requestTeacherAccess,
  getPendingTeacherRequests,
  approveTeacherRequest
} from "./notion.js";
import { isTrialMember } from "./member-rules.js";
import {
  isTeacherUser,
  isAdminUser,
  resolveTeacherDateParam,
  getTaipeiWeekdayChar,
  formatDateZhFromIso,
  getTaipeiDateString
} from "./teacher-auth.js";
import {
  notifyAdminsTeacherRequest,
  notifyTeacherApproved
} from "./teacher-notify.js";

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

      if (url.pathname === "/api/member" && (request.method === "GET" || request.method === "POST")) {
        ensureNotionEnv(env);
        var userId = url.searchParams.get("userId");
        var lineDisplayName = url.searchParams.get("displayName") || "";

        if (request.method === "POST") {
          var memberBody = await readJson(request);
          userId = memberBody.userId || userId;
          lineDisplayName = memberBody.displayName || lineDisplayName;
        }

        if (!userId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }

        var memberResult = await getOrCreateMember(env, userId, lineDisplayName);
        var member = memberResult.member;

        return jsonResponse({
          displayName: member.displayName,
          credits: member.credits,
          remainingLessons: member.credits,
          card10: member.card10,
          card24: member.card24,
          expiresAt: member.expiresAt,
          expireDate: member.expiresAt,
          status: member.status,
          isNew: false,
          justRegistered: memberResult.created,
          isTrial: isTrialMember(member),
          trialExpiresAt: isTrialMember(member)
            ? member.expiresAt
            : ""
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
          if (course.isClosure) {
            return {
              id: course.id,
              type: "closure",
              date: course.date,
              label: course.closureLabel
            };
          }

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

      if (url.pathname === "/api/teacher/today" && request.method === "GET") {
        ensureNotionEnv(env);
        var teacherUserId = url.searchParams.get("userId");

        if (!teacherUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }

        if (!(await isTeacherUser(env, teacherUserId))) {
          return jsonResponse({ ok: false, message: "無權限查看" }, corsHeaders, 403);
        }

        var scheduleDate = resolveTeacherDateParam(url.searchParams);
        var teacherCourses = await getTeacherScheduleForDate(env, scheduleDate);

        return jsonResponse({
          ok: true,
          date: scheduleDate,
          dateLabel: formatDateZhFromIso(scheduleDate),
          weekday: getTaipeiWeekdayChar(scheduleDate),
          courses: teacherCourses
        }, corsHeaders);
      }

      if (url.pathname === "/api/teacher/month" && request.method === "GET") {
        ensureNotionEnv(env);
        var monthTeacherUserId = url.searchParams.get("userId");
        var yearParam = Number(url.searchParams.get("year"));
        var monthParam = Number(url.searchParams.get("month"));

        if (!monthTeacherUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }

        if (!(await isTeacherUser(env, monthTeacherUserId))) {
          return jsonResponse({ ok: false, message: "無權限查看" }, corsHeaders, 403);
        }

        if (!yearParam || !monthParam || monthParam < 1 || monthParam > 12) {
          var todayParts = getTaipeiDateString(0).split("-");
          yearParam = Number(todayParts[0]);
          monthParam = Number(todayParts[1]);
        }

        var monthOverview = await getTeacherMonthOverview(env, yearParam, monthParam);

        return jsonResponse(Object.assign({ ok: true }, monthOverview), corsHeaders);
      }

      if (url.pathname === "/api/teacher/status" && request.method === "GET") {
        ensureNotionEnv(env);
        var statusUserId = url.searchParams.get("userId");

        if (!statusUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }

        var accessStatus = await getTeacherAccessStatus(env, statusUserId);

        return jsonResponse({
          ok: true,
          teacherRole: accessStatus.teacherRole,
          canAccess: accessStatus.canAccess
        }, corsHeaders);
      }

      if (url.pathname === "/api/teacher/request" && request.method === "POST") {
        ensureNotionEnv(env);
        var requestBody = await readJson(request);
        var requestUserId = requestBody.userId;
        var requestDisplayName = requestBody.displayName || "";

        if (!requestUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }

        var requestResult = await requestTeacherAccess(env, requestUserId, requestDisplayName);

        if (requestResult.status === "submitted" && requestResult.member) {
          await notifyAdminsTeacherRequest(env, requestResult.member);
        }

        return jsonResponse(requestResult, corsHeaders);
      }

      if (url.pathname === "/api/admin/teacher-requests" && request.method === "GET") {
        ensureNotionEnv(env);
        var adminUserId = url.searchParams.get("userId");

        if (!adminUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }

        if (!isAdminUser(env, adminUserId)) {
          return jsonResponse({ ok: false, message: "無管理權限" }, corsHeaders, 403);
        }

        var pendingRequests = await getPendingTeacherRequests(env);

        return jsonResponse({
          ok: true,
          requests: pendingRequests
        }, corsHeaders);
      }

      if (url.pathname === "/api/admin/teacher-approve" && request.method === "POST") {
        ensureNotionEnv(env);
        var approveBody = await readJson(request);
        var approveAdminId = approveBody.adminUserId;
        var approveMemberId = approveBody.memberId;

        if (!approveAdminId || !approveMemberId) {
          return jsonResponse({ ok: false, message: "缺少 adminUserId 或 memberId" }, corsHeaders, 400);
        }

        if (!isAdminUser(env, approveAdminId)) {
          return jsonResponse({ ok: false, message: "無管理權限" }, corsHeaders, 403);
        }

        var approveResult = await approveTeacherRequest(env, approveMemberId);
        await notifyTeacherApproved(env, approveResult.member);

        return jsonResponse({
          ok: true,
          message: "已核准 " + (approveResult.member.displayName || "老師"),
          member: approveResult.member
        }, corsHeaders);
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

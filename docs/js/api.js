/**
 * 後端 API 呼叫模組（第一階段：預留接口，第二階段接上 Cloudflare Workers）
 */
(function () {
  "use strict";

  function getApiBaseUrl() {
    var config = window.GOSU_CONFIG || {};
    var url = (config.API_BASE_URL || "").trim();

    if (!url || url.indexOf("請填入") !== -1) {
      return null;
    }

    return url.replace(/\/$/, "");
  }

  async function apiFetch(path, options) {
    var baseUrl = getApiBaseUrl();

    if (!baseUrl) {
      throw new Error("API 尚未設定，目前使用示範資料");
    }

    var response = await fetch(baseUrl + path, Object.assign({
      headers: {
        "Content-Type": "application/json"
      }
    }, options || {}));

    if (!response.ok) {
      var message = "伺服器回應錯誤（" + response.status + "）";
      var body = null;

      try {
        body = await response.json();
        if (body && body.message) {
          message = body.message;
        }
      } catch (ignore) {}

      var error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  /** 查詢學員資料（第二階段實作） */
  window.gosuApi = {
    getMember: function (userId, displayName) {
      return apiFetch("/api/member", {
        method: "POST",
        body: JSON.stringify({
          userId: userId,
          displayName: displayName || ""
        })
      });
    },

    getCourses: function (year, month, userId) {
      var query = "/api/courses?year=" + year + "&month=" + month;
      if (userId) {
        query += "&userId=" + encodeURIComponent(userId);
      }
      return apiFetch(query);
    },

    bookCourse: function (userId, courseId) {
      return apiFetch("/api/book", {
        method: "POST",
        body: JSON.stringify({ userId: userId, courseId: courseId })
      });
    },

    cancelBooking: function (userId, courseId) {
      return apiFetch("/api/cancel", {
        method: "POST",
        body: JSON.stringify({ userId: userId, courseId: courseId })
      });
    },

    getTeacherSchedule: function (userId, options) {
      var query = "/api/teacher/today?userId=" + encodeURIComponent(userId);
      var opts = options || {};

      if (opts.date) {
        query += "&date=" + encodeURIComponent(opts.date);
      } else if (opts.day === "tomorrow") {
        query += "&day=tomorrow";
      }

      return apiFetch(query);
    },

    getTeacherStatus: function (userId) {
      return apiFetch("/api/teacher/status?userId=" + encodeURIComponent(userId));
    },

    requestTeacherAccess: function (userId, displayName) {
      return apiFetch("/api/teacher/request", {
        method: "POST",
        body: JSON.stringify({
          userId: userId,
          displayName: displayName || ""
        })
      });
    },

    getAdminTeacherRequests: function (adminUserId) {
      return apiFetch("/api/admin/teacher-requests?userId=" + encodeURIComponent(adminUserId));
    },

    approveTeacherRequest: function (adminUserId, memberId) {
      return apiFetch("/api/admin/teacher-approve", {
        method: "POST",
        body: JSON.stringify({
          adminUserId: adminUserId,
          memberId: memberId
        })
      });
    },

    isConfigured: function () {
      return Boolean(getApiBaseUrl());
    }
  };
})();

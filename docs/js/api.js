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

      try {
        var body = await response.json();
        if (body && body.message) {
          message = body.message;
        }
      } catch (ignore) {}

      throw new Error(message);
    }

    return response.json();
  }

  /** 查詢學員資料（第二階段實作） */
  window.gosuApi = {
    getMember: function (userId) {
      return apiFetch("/api/member?userId=" + encodeURIComponent(userId));
    },

    getCourses: function (year, month) {
      return apiFetch("/api/courses?year=" + year + "&month=" + month);
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

    isConfigured: function () {
      return Boolean(getApiBaseUrl());
    }
  };
})();

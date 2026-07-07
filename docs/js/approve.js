/**
 * 工作室核准老師權限
 */
(function () {
  "use strict";

  var statusPanel = document.getElementById("status-panel");
  var requestListEl = document.getElementById("request-list");
  var copyToast = document.getElementById("copy-toast");

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(kind, message) {
    statusPanel.hidden = false;
    statusPanel.className = "status-panel is-" + kind;
    statusPanel.textContent = message;
  }

  function hideStatus() {
    statusPanel.hidden = true;
    statusPanel.textContent = "";
  }

  function showToast(message) {
    copyToast.textContent = message;
    copyToast.classList.add("is-visible");
    window.setTimeout(function () {
      copyToast.classList.remove("is-visible");
    }, 1800);
  }

  function renderRequests(requests) {
    if (!requests.length) {
      requestListEl.hidden = true;
      requestListEl.innerHTML = "";
      setStatus("empty", "目前沒有待核准的老師申請");
      return;
    }

    hideStatus();
    requestListEl.hidden = false;
    requestListEl.innerHTML = requests.map(function (item) {
      return (
        '<article class="course-card">' +
          '<h2 class="course-title">' + escapeHtml(item.displayName || "LINE 使用者") + "</h2>" +
          '<p class="course-meta">申請狀態：' + escapeHtml(item.teacherRole || "待審核") + "</p>" +
          '<button type="button" class="tool-btn tool-btn-primary approve-btn" data-member-id="' +
            escapeHtml(item.memberId) + '">核准</button>' +
        "</article>"
      );
    }).join("");

    requestListEl.querySelectorAll(".approve-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        approveRequest(button.getAttribute("data-member-id"), button);
      });
    });
  }

  async function approveRequest(memberId, button) {
    try {
      if (!memberId) {
        throw new Error("缺少申請資料");
      }

      button.disabled = true;
      button.textContent = "核准中…";

      var result = await window.gosuApi.approveTeacherRequest(
        window.gosuUser.userId,
        memberId
      );

      showToast(result.message || "已核准");
      await loadRequests();
    } catch (error) {
      console.error("[approve]", error);
      button.disabled = false;
      button.textContent = "核准";
      showToast(error.message || "核准失敗，請稍後再試");
    }
  }

  async function loadRequests() {
    try {
      setStatus("loading", "讀取中，請稍候…");
      requestListEl.hidden = true;
      requestListEl.innerHTML = "";

      if (!window.gosuApi || !window.gosuApi.isConfigured()) {
        throw new Error("API 尚未設定，請聯絡技術人員");
      }

      await window.gosuLiffReady;

      if (!window.gosuUser || !window.gosuUser.userId) {
        throw new Error("無法取得 LINE 登入資訊，請從 LINE 重新開啟");
      }

      var data = await window.gosuApi.getAdminTeacherRequests(window.gosuUser.userId);
      renderRequests(data.requests || []);
    } catch (error) {
      console.error("[approve-list]", error);
      requestListEl.hidden = true;
      requestListEl.innerHTML = "";

      if (error && error.status === 403) {
        setStatus("forbidden", "無管理權限。請確認您的 LINE 帳號已設為工作室管理員。");
        return;
      }

      setStatus("error", error.message || "讀取失敗，請稍後再試");
    }
  }

  try {
    loadRequests();
  } catch (error) {
    console.error("[approve-init]", error);
    setStatus("error", error.message || "頁面初始化失敗");
  }
})();

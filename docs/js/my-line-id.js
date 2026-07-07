/**
 * 我的 LINE 編號頁
 */
(function () {
  "use strict";

  var statusPanel = document.getElementById("status-panel");
  var idCardPanel = document.getElementById("id-card-panel");
  var copyToast = document.getElementById("copy-toast");

  async function initPage() {
    try {
      statusPanel.textContent = "讀取中…";
      statusPanel.className = "line-id-status is-loading";
      idCardPanel.hidden = true;

      await window.gosuLiffReady;

      if (!window.gosuUser || !window.gosuUser.userId) {
        throw new Error("無法取得 LINE 登入資訊，請從 LINE 重新開啟此頁");
      }

      statusPanel.hidden = true;

      window.gosuLineId.bindIdCard(idCardPanel, window.gosuUser, copyToast, {
        title: "您的 LINE 編號",
        hint: "此編號僅用於開通，不會公開顯示給其他學員"
      });
    } catch (error) {
      console.error("[my-line-id]", error);
      statusPanel.hidden = false;
      statusPanel.className = "line-id-status is-error";
      statusPanel.textContent = error.message || "讀取失敗，請稍後再試";
      idCardPanel.hidden = true;
    }
  }

  try {
    initPage();
  } catch (error) {
    console.error("[my-line-id-init]", error);
    statusPanel.hidden = false;
    statusPanel.className = "line-id-status is-error";
    statusPanel.textContent = error.message || "頁面初始化失敗";
  }
})();

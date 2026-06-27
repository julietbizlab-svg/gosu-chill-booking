/**
 * LINE LIFF 登入模組
 * 學員從 LINE 開啟網頁時，自動取得 userId，免輸入密碼
 */
(function () {
  "use strict";

  const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

  /** @type {{ userId: string, displayName: string, pictureUrl: string } | null} */
  window.gosuUser = null;

  /** @type {Promise<void>} */
  window.gosuLiffReady = new Promise(function (resolve, reject) {
    window.__resolveGosuLiff = resolve;
    window.__rejectGosuLiff = reject;
  });

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }

      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("LIFF SDK 載入失敗，請檢查網路")); };
      document.head.appendChild(script);
    });
  }

  function getLiffId() {
    var config = window.GOSU_CONFIG || {};
    var liffId = (config.LIFF_ID || "").trim();

    if (!liffId || liffId.indexOf("請填入") !== -1) {
      throw new Error("請先在 js/config.js 填入 LIFF_ID");
    }

    return liffId;
  }

  async function initLiff() {
    await loadScript(LIFF_SDK_URL);

    if (typeof liff === "undefined") {
      throw new Error("LIFF SDK 未就緒");
    }

    var liffId = getLiffId();
    await liff.init({ liffId: liffId });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    var profile = await liff.getProfile();

    window.gosuUser = {
      userId: profile.userId,
      displayName: profile.displayName || "學員",
      pictureUrl: profile.pictureUrl || ""
    };

    if (window.__resolveGosuLiff) {
      window.__resolveGosuLiff();
    }
  }

  initLiff().catch(function (error) {
    console.error("[LIFF]", error);

    if (window.__rejectGosuLiff) {
      window.__rejectGosuLiff(error);
    }
  });
})();

/**
 * LINE 編號顯示與複製（開通帳號／老師權限用）
 */
(function () {
  "use strict";

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(toastEl, message) {
    if (!toastEl) {
      return;
    }

    toastEl.textContent = message;
    toastEl.classList.add("is-visible");

    window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 1800);
  }

  async function copyText(text, toastEl) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        var textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      showToast(toastEl, "已複製到剪貼簿");
      return true;
    } catch (error) {
      console.error("[line-id-copy]", error);
      showToast(toastEl, "複製失敗，請長按編號手動複製");
      return false;
    }
  }

  function buildIdCardHtml(user, options) {
    var opts = options || {};
    var title = opts.title || "您的 LINE 編號";
    var hint = opts.hint || "請點下方按鈕複製，傳給工作室開通";

    return (
      '<div class="line-id-card">' +
        (opts.forbiddenTitle
          ? '<p class="forbidden-title">' + escapeHtml(opts.forbiddenTitle) + "</p>"
          : "") +
        (opts.forbiddenText
          ? '<p class="forbidden-text">' + escapeHtml(opts.forbiddenText) + "</p>"
          : "") +
        '<p class="line-id-label">' + escapeHtml(title) + "</p>" +
        '<p class="line-id-name">' + escapeHtml(user.displayName || "LINE 使用者") + "</p>" +
        '<p class="line-id-value" id="line-id-value">' + escapeHtml(user.userId) + "</p>" +
        '<div class="line-id-actions">' +
          '<button type="button" class="line-id-btn" data-copy-id="1">複製我的 LINE 編號</button>' +
          (opts.secondaryLabel
            ? '<button type="button" class="line-id-btn line-id-btn-secondary" data-secondary="1">' +
                escapeHtml(opts.secondaryLabel) + "</button>"
            : "") +
        "</div>" +
        (hint ? '<p class="line-id-subtitle" style="margin-top:14px;text-align:center;">' +
          escapeHtml(hint) + "</p>" : "") +
      "</div>"
    );
  }

  function bindIdCard(container, user, toastEl, options) {
    if (!container) {
      return;
    }

    container.innerHTML = buildIdCardHtml(user, options);
    container.hidden = false;

    var copyBtn = container.querySelector("[data-copy-id]");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyText(user.userId, toastEl);
      });
    }

    var secondaryBtn = container.querySelector("[data-secondary]");
    if (secondaryBtn && options.onSecondary) {
      secondaryBtn.addEventListener("click", options.onSecondary);
    }
  }

  window.gosuLineId = {
    copyText: copyText,
    bindIdCard: bindIdCard,
    showToast: showToast
  };
})();

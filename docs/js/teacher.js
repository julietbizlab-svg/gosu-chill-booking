/**
 * 高手揪派 — 老師今日預約（唯讀）
 */
(function () {
  "use strict";

  var viewDateEl = document.getElementById("view-date");
  var statusPanel = document.getElementById("status-panel");
  var forbiddenPanel = document.getElementById("forbidden-panel");
  var courseListEl = document.getElementById("course-list");
  var btnRefresh = document.getElementById("btn-refresh");
  var btnToggleDay = document.getElementById("btn-toggle-day");
  var btnCopy = document.getElementById("btn-copy");
  var copyToast = document.getElementById("copy-toast");

  var viewingTomorrow = false;
  var latestSchedule = null;

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

  function getScheduleQuery() {
    return viewingTomorrow ? { day: "tomorrow" } : {};
  }

  function updateToggleButtonLabel() {
    btnToggleDay.textContent = viewingTomorrow ? "看今天" : "看明天";
    btnCopy.textContent = viewingTomorrow ? "複製明日名單" : "複製今日名單";
  }

  function renderDateBanner(data) {
    var weekday = data.weekday || "—";
    viewDateEl.textContent = data.dateLabel + "（星期" + weekday + "）";
  }

  function renderStudentList(students) {
    if (!students || !students.length) {
      return '<p class="student-empty">目前尚無預約</p>';
    }

    return (
      '<ul class="student-list">' +
      students.map(function (student) {
        var typeClass = "student-type";
        if (student.type === "體驗") {
          typeClass += " is-trial";
        } else if (student.type === "未知") {
          typeClass += " is-unknown";
        }

        return (
          '<li class="student-item">' +
            '<span class="student-name">' + escapeHtml(student.name) + "</span>" +
            '<span class="' + typeClass + '">' + escapeHtml(student.type) + "</span>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderCourses(courses) {
    if (!courses.length) {
      courseListEl.hidden = true;
      courseListEl.innerHTML = "";
      setStatus("empty", viewingTomorrow ? "明日沒有課程" : "今日沒有課程");
      return;
    }

    hideStatus();
    courseListEl.hidden = false;
    courseListEl.innerHTML = courses.map(function (course) {
      var cardClass = "course-card";
      if (course.status === "停課" || course.note.indexOf("停課") !== -1) {
        cardClass += " is-closure";
      }

      var noteHtml = course.note
        ? '<p class="course-note">' + escapeHtml(course.note) + "</p>"
        : "";

      return (
        '<article class="' + cardClass + '">' +
          '<p class="course-time">' + escapeHtml(course.time) + "</p>" +
          '<h2 class="course-title">' + escapeHtml(course.title) + "</h2>" +
          '<p class="course-meta">已預約 <strong>' + escapeHtml(course.enrolled) +
          "</strong> / " + escapeHtml(course.capacity) + " 名額 · " +
          escapeHtml(course.status) + "</p>" +
          noteHtml +
          renderStudentList(course.students) +
        "</article>"
      );
    }).join("");
  }

  function buildCopyText(data) {
    var lines = [];
    var title = viewingTomorrow ? "明日預約" : "今日預約";

    lines.push("高手揪派｜" + title);
    lines.push(data.dateLabel + "（星期" + data.weekday + "）");
    lines.push("");

    if (!data.courses || !data.courses.length) {
      lines.push("今日沒有課程");
      return lines.join("\n");
    }

    data.courses.forEach(function (course) {
      lines.push(course.time + " " + course.title);
      lines.push("已預約 " + course.enrolled + "/" + course.capacity + " · " + course.status);

      if (course.note) {
        lines.push("備註：" + course.note);
      }

      if (!course.students || !course.students.length) {
        lines.push("學員：目前尚無預約");
      } else {
        lines.push("學員：");
        course.students.forEach(function (student) {
          lines.push("- " + student.name + "（" + student.type + "）");
        });
      }

      lines.push("");
    });

    return lines.join("\n").trim();
  }

  function showCopyToast(message) {
    copyToast.textContent = message;
    copyToast.classList.add("is-visible");

    window.setTimeout(function () {
      copyToast.classList.remove("is-visible");
    }, 1800);
  }

  async function copyScheduleText() {
    try {
      if (!latestSchedule) {
        showCopyToast("尚無資料可複製");
        return;
      }

      var text = buildCopyText(latestSchedule);

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

      showCopyToast("已複製到剪貼簿");
    } catch (error) {
      console.error("[teacher-copy]", error);
      showCopyToast("複製失敗，請稍後再試");
    }
  }

  function hideForbiddenPanel() {
    forbiddenPanel.hidden = true;
    forbiddenPanel.innerHTML = "";
  }

  function showForbiddenPanel(user) {
    hideStatus();
    courseListEl.hidden = true;
    courseListEl.innerHTML = "";
    document.querySelector(".toolbar").hidden = true;
    document.querySelector(".date-banner").hidden = true;

    if (!window.gosuLineId) {
      setStatus("forbidden", "無權限查看");
      return;
    }

    window.gosuLineId.bindIdCard(forbiddenPanel, user, copyToast, {
      forbiddenTitle: "尚未開通老師查看權限",
      forbiddenText: "請複製下方 LINE 編號傳給工作室，開通後關閉此頁再重新開啟。",
      title: "您的 LINE 編號",
      hint: "",
      secondaryLabel: "查看開通步驟說明",
      onSecondary: function () {
        window.location.href = "my-line-id.html";
      }
    });
  }

  async function loadSchedule() {
    try {
      setStatus("loading", "讀取中，請稍候…");
      hideForbiddenPanel();
      courseListEl.hidden = true;
      courseListEl.innerHTML = "";
      document.querySelector(".toolbar").hidden = false;
      document.querySelector(".date-banner").hidden = false;

      if (!window.gosuApi || !window.gosuApi.isConfigured()) {
        throw new Error("API 尚未設定，請聯絡技術人員");
      }

      await window.gosuLiffReady;

      if (!window.gosuUser || !window.gosuUser.userId) {
        throw new Error("無法取得 LINE 登入資訊，請從 LINE 重新開啟");
      }

      var data = await window.gosuApi.getTeacherSchedule(
        window.gosuUser.userId,
        getScheduleQuery()
      );

      latestSchedule = data;
      renderDateBanner(data);
      renderCourses(data.courses || []);
    } catch (error) {
      console.error("[teacher]", error);
      latestSchedule = null;
      courseListEl.hidden = true;
      courseListEl.innerHTML = "";

      if (error && error.status === 403 && window.gosuUser) {
        showForbiddenPanel(window.gosuUser);
        return;
      }

      hideForbiddenPanel();
      document.querySelector(".toolbar").hidden = false;
      document.querySelector(".date-banner").hidden = false;
      setStatus("error", error.message || "讀取失敗，請稍後再試");
    }
  }

  function bindEvents() {
    btnRefresh.addEventListener("click", function () {
      loadSchedule();
    });

    btnToggleDay.addEventListener("click", function () {
      viewingTomorrow = !viewingTomorrow;
      updateToggleButtonLabel();
      loadSchedule();
    });

    btnCopy.addEventListener("click", function () {
      copyScheduleText();
    });
  }

  try {
    updateToggleButtonLabel();
    bindEvents();
    loadSchedule();
  } catch (error) {
    console.error("[teacher-init]", error);
    setStatus("error", error.message || "頁面初始化失敗");
  }
})();

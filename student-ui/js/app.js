/**
 * 高手揪派 — 學員預約主程式
 */
(function () {
  "use strict";

  // ── DOM 元素 ──
  var statusBar = document.getElementById("status-bar");
  var statusText = document.getElementById("status-text");
  var memberSection = document.getElementById("member-section");
  var memberAvatar = document.getElementById("member-avatar");
  var memberName = document.getElementById("member-name");
  var memberMeta = document.getElementById("member-meta");
  var creditsNumber = document.getElementById("credits-number");
  var creditsExpiry = document.getElementById("credits-expiry");
  var scheduleSection = document.getElementById("schedule-section");
  var monthLabel = document.getElementById("month-label");
  var courseList = document.getElementById("course-list");
  var prevMonthBtn = document.getElementById("prev-month");
  var nextMonthBtn = document.getElementById("next-month");
  var devHint = document.getElementById("dev-hint");

  var visibleMonth = new Date();
  visibleMonth.setDate(1);
  visibleMonth.setHours(0, 0, 0, 0);

  /** @type {Set<string>} */
  var bookedCourseIds = new Set();
  var currentMember = null;

  // ── 工具函式 ──
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }

  function setStatus(type, message) {
    statusBar.className = "status-bar";

    if (type === "loading") {
      statusBar.classList.add("is-loading");
    } else if (type === "error") {
      statusBar.classList.add("is-error");
    }

    statusText.textContent = message;
  }

  function formatDateText(dateStr, timeStr) {
    var timePart = (timeStr || "00:00").split("~")[0].trim();
    var date = new Date(dateStr + "T" + timePart + ":00");
    if (isNaN(date.getTime())) {
      return dateStr;
    }
    return date.toLocaleDateString("zh-TW", {
      month: "long",
      day: "numeric",
      weekday: "long"
    });
  }

  function updateMonthLabel() {
    monthLabel.textContent = visibleMonth.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long"
    });
  }

  // ── 示範資料（API 接上後會改為從後端讀取）──
  function getDemoMember(user) {
    return {
      displayName: user.displayName,
      credits: 8,
      expiresAt: "2026/09/30",
      status: "active"
    };
  }

  function getDemoCourses(year, month) {
    var monthStr = String(month).padStart(2, "0");
    var prefix = year + "-" + monthStr;

    return [
      {
        id: prefix + "-yoga-am",
        title: "晨間瑜珈",
        date: prefix + "-05",
        time: "09:00",
        instructor: "佳貞老師",
        capacity: 12,
        enrolled: 7
      },
      {
        id: prefix + "-yoga-pm",
        title: "午後伸展",
        date: prefix + "-12",
        time: "14:00",
        instructor: "佳貞老師",
        capacity: 12,
        enrolled: 10
      },
      {
        id: prefix + "-yoga-eve",
        title: "晚間放鬆",
        date: prefix + "-19",
        time: "19:00",
        instructor: "佳貞老師",
        capacity: 12,
        enrolled: 4
      }
    ];
  }

  // ── 渲染學員資訊 ──
  function renderMember(user, member) {
    memberSection.hidden = false;

    if (user.pictureUrl) {
      memberAvatar.src = user.pictureUrl;
      memberAvatar.alt = user.displayName + " 的頭像";
      memberAvatar.hidden = false;
      memberAvatar.classList.remove("placeholder");
    } else {
      memberAvatar.hidden = true;
    }

    memberName.textContent = member.displayName + " 您好";

    if (member.isNew || member.status === "pending") {
      if (window.gosuUser && window.gosuUser.userId) {
        memberMeta.textContent =
          "帳號待開通 · 您的 LINE 編號：" + window.gosuUser.userId;
      } else {
        memberMeta.textContent = "帳號待開通 · 請聯絡工作室";
      }
    } else {
      memberMeta.textContent = "已自動登入 · 無需輸入密碼";
    }

    if (member.isNew && window.gosuUser && window.gosuUser.userId) {
      devHint.hidden = false;
      devHint.textContent =
        "請把上方 LINE 編號貼到 Notion「學員資料」的「預約編號」欄，並設定剩餘堂數與狀態「有效」。";
    }
    creditsNumber.textContent = String(member.credits);
    creditsExpiry.textContent = "到期日：" + member.expiresAt;
  }

  // ── 渲染課表 ──
  function renderCourses(courses) {
    if (!courses.length) {
      courseList.innerHTML = '<div class="empty-msg">本月尚無可預約課程</div>';
      return;
    }

    courseList.innerHTML = courses.map(function (course) {
      var remaining = Number(course.capacity || 0) - Number(course.enrolled || 0);
      var isBooked = Boolean(course.isBooked) || bookedCourseIds.has(course.id);
      var isFull = remaining <= 0 && !isBooked;

      var actionHtml;

      if (isBooked) {
        actionHtml =
          '<button class="btn btn-danger" type="button" data-action="cancel" data-id="' +
          escapeHtml(course.id) + '">取消預約</button>';
      } else if (isFull) {
        actionHtml =
          '<button class="btn btn-primary" type="button" disabled>已額滿</button>';
      } else {
        actionHtml =
          '<button class="btn btn-primary" type="button" data-action="book" data-id="' +
          escapeHtml(course.id) + '">預約這堂課</button>';
      }

      return (
        '<article class="course-item' + (isBooked ? " is-booked" : "") + '">' +
          '<h3 class="course-title">' + escapeHtml(course.title) + '</h3>' +
          '<p class="course-meta">' +
            escapeHtml(formatDateText(course.date, course.time)) +
            " · " + escapeHtml(course.time) +
            " · " + escapeHtml(course.instructor) +
          '</p>' +
          '<p class="course-seats">剩餘名額 ' + remaining + ' / ' + escapeHtml(course.capacity) + '</p>' +
          '<div class="course-actions">' + actionHtml + '</div>' +
        '</article>'
      );
    }).join("");
  }

  async function loadMember(user) {
    var member;

    if (window.gosuApi && window.gosuApi.isConfigured()) {
      member = await window.gosuApi.getMember(user.userId);
    } else {
      member = getDemoMember(user);
    }

    currentMember = member;
    renderMember(user, member);
    return member;
  }

  async function loadCourses() {
    updateMonthLabel();
    courseList.innerHTML = '<div class="empty-msg">讀取課表中…</div>';

    var year = visibleMonth.getFullYear();
    var month = visibleMonth.getMonth() + 1;
    var courses;

    if (window.gosuApi && window.gosuApi.isConfigured()) {
      courses = await window.gosuApi.getCourses(year, month, window.gosuUser && window.gosuUser.userId);
    } else {
      courses = getDemoCourses(year, month);
    }

    bookedCourseIds.clear();
    courses.forEach(function (course) {
      if (course.isBooked) {
        bookedCourseIds.add(course.id);
      }
    });

    renderCourses(courses);
  }

  async function handleBook(courseId) {
    if (!window.gosuUser) {
      return;
    }

    if (currentMember && (currentMember.isNew || currentMember.credits <= 0)) {
      setStatus("error", "尚無可預約堂數，請聯絡工作室開通帳號");
      return;
    }

    var confirmed = window.confirm("確定要預約這堂課嗎？");
    if (!confirmed) {
      return;
    }

    setStatus("loading", "預約處理中，請稍候…");

    try {
      if (window.gosuApi && window.gosuApi.isConfigured()) {
        await window.gosuApi.bookCourse(window.gosuUser.userId, courseId);
        await loadMember(window.gosuUser);
      }

      bookedCourseIds.add(courseId);
      await loadCourses();
      setStatus("ok", "預約成功！我們課堂見。");
    } catch (error) {
      setStatus("error", "預約失敗：" + error.message);
    }
  }

  async function handleCancel(courseId) {
    if (!window.gosuUser) {
      return;
    }

    var confirmed = window.confirm("確定要取消這堂課的預約嗎？");
    if (!confirmed) {
      return;
    }

    setStatus("loading", "取消預約中，請稍候…");

    try {
      if (window.gosuApi && window.gosuApi.isConfigured()) {
        await window.gosuApi.cancelBooking(window.gosuUser.userId, courseId);
        await loadMember(window.gosuUser);
      }

      bookedCourseIds.delete(courseId);
      await loadCourses();
      setStatus("ok", "已取消預約，堂數會退還。");
    } catch (error) {
      setStatus("error", "取消失敗：" + error.message);
    }
  }

  // ── 事件綁定 ──
  prevMonthBtn.addEventListener("click", function () {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    loadCourses();
  });

  nextMonthBtn.addEventListener("click", function () {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    loadCourses();
  });

  courseList.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button || button.disabled) {
      return;
    }

    var courseId = button.getAttribute("data-id");
    var action = button.getAttribute("data-action");

    if (action === "book") {
      handleBook(courseId);
    } else if (action === "cancel") {
      handleCancel(courseId);
    }
  });

  // ── 啟動 ──
  async function boot() {
    setStatus("loading", "正在為您登入，請稍候…");
    memberSection.hidden = true;
    scheduleSection.hidden = true;

    try {
      await window.gosuLiffReady;

      var user = window.gosuUser;
      if (!user || !user.userId) {
        throw new Error("無法取得 LINE 身分，請從 LINE 重新開啟");
      }

      setStatus("ok", "登入成功 · 您的編號：" + user.userId);
      scheduleSection.hidden = false;

      if (!window.gosuApi || !window.gosuApi.isConfigured()) {
        devHint.hidden = false;
      } else {
        devHint.hidden = true;
      }

      await loadMember(user);
      await loadCourses();
    } catch (error) {
      console.error("[APP]", error);
      setStatus("error", error.message || "發生未知錯誤");
    }
  }

  boot();
})();

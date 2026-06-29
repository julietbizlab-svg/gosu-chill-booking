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
  var monthOverview = document.getElementById("month-overview");
  var scheduleList = document.getElementById("schedule-list");
  var schedulePanel = document.getElementById("schedule-panel");
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

  function updateMonthLabel() {
    monthLabel.textContent = visibleMonth.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long"
    });
  }

  function formatDateKey(year, month, day) {
    return (
      year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0")
    );
  }

  function getTodayKey() {
    var now = new Date();
    return formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function parseTimeSortValue(timeStr) {
    var part = (timeStr || "").split("~")[0].trim();
    var match = part.match(/(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  function getTimeStart(timeStr) {
    return (timeStr || "").split("~")[0].trim();
  }

  function sortCoursesBySchedule(courses) {
    return courses.slice().sort(function (a, b) {
      if (a.date !== b.date) {
        return a.date < b.date ? -1 : 1;
      }
      return parseTimeSortValue(a.time) - parseTimeSortValue(b.time);
    });
  }

  function groupCoursesByDate(courses) {
    var byDate = new Map();

    courses.forEach(function (course) {
      if (!byDate.has(course.date)) {
        byDate.set(course.date, []);
      }
      byDate.get(course.date).push(course);
    });

    byDate.forEach(function (list) {
      list.sort(function (a, b) {
        return parseTimeSortValue(a.time) - parseTimeSortValue(b.time);
      });
    });

    return byDate;
  }

  function formatDayHeading(dateStr) {
    var date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) {
      return dateStr;
    }
    return date.toLocaleDateString("zh-TW", {
      month: "long",
      day: "numeric",
      weekday: "long"
    });
  }

  function isCourseBooked(course) {
    return Boolean(course.isBooked) || bookedCourseIds.has(course.id);
  }

  function renderOverviewCell(day, dateKey, hasCourses, isToday) {
    var cellClass = "overview-cell";
    if (isToday) {
      cellClass += " is-today";
    }
    if (hasCourses) {
      cellClass += " has-courses";
    }

    return (
      '<div class="' + cellClass + '">' +
        '<span class="overview-day">' + day + "</span>" +
        (hasCourses ? '<span class="overview-dot" aria-hidden="true"></span>' : "") +
      "</div>"
    );
  }

  function renderMonthOverview(coursesByDate) {
    var year = visibleMonth.getFullYear();
    var monthIndex = visibleMonth.getMonth();
    var month = monthIndex + 1;
    var firstWeekday = new Date(year, monthIndex, 1).getDay();
    var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    var todayKey = getTodayKey();
    var html = "";
    var day;

    for (day = 0; day < firstWeekday; day++) {
      html += '<div class="overview-cell is-padding" aria-hidden="true"></div>';
    }

    for (day = 1; day <= daysInMonth; day++) {
      var dateKey = formatDateKey(year, month, day);
      var dayCourses = coursesByDate.get(dateKey) || [];
      html += renderOverviewCell(day, dateKey, dayCourses.length > 0, dateKey === todayKey);
    }

    var totalCells = firstWeekday + daysInMonth;
    var trailing = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (day = 0; day < trailing; day++) {
      html += '<div class="overview-cell is-padding" aria-hidden="true"></div>';
    }

    monthOverview.innerHTML = html;
  }

  function renderCourseCard(course) {
    var isBooked = isCourseBooked(course);
    var remaining = Number(course.capacity || 0) - Number(course.enrolled || 0);
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
      '<article class="course-card' + (isBooked ? " is-booked" : "") + '">' +
        '<h3 class="course-card-title">' + escapeHtml(course.title) + "</h3>" +
        '<p class="course-card-time">' + escapeHtml(course.time) + "</p>" +
        '<p class="course-card-seats">剩餘名額 ' + remaining + " / " + escapeHtml(course.capacity) + "</p>" +
        '<div class="course-card-actions">' + actionHtml + "</div>" +
      "</article>"
    );
  }

  function renderScheduleList(courses) {
    var sorted = sortCoursesBySchedule(courses);
    var coursesByDate = groupCoursesByDate(sorted);
    var groups = [];

    Array.from(coursesByDate.keys()).sort().forEach(function (date) {
      groups.push({ date: date, courses: coursesByDate.get(date) });
    });

    renderMonthOverview(coursesByDate);

    if (!groups.length) {
      scheduleList.innerHTML = '<div class="empty-msg">本月尚無可預約課程</div>';
      return;
    }

    scheduleList.innerHTML = groups.map(function (group) {
      return (
        '<section class="day-block" id="day-' + escapeHtml(group.date) + '">' +
          '<h3 class="day-heading">' + escapeHtml(formatDayHeading(group.date)) + "</h3>" +
          '<div class="day-courses">' +
            group.courses.map(renderCourseCard).join("") +
          "</div>" +
        "</section>"
      );
    }).join("");
  }

  // ── 示範資料 ──
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
        time: "09:00~10:00",
        instructor: "佳貞老師",
        capacity: 12,
        enrolled: 7
      },
      {
        id: prefix + "-yoga-pm",
        title: "午後伸展｜下午",
        date: prefix + "-12",
        time: "14:30~15:30",
        instructor: "佳貞老師",
        capacity: 12,
        enrolled: 10
      },
      {
        id: prefix + "-yoga-eve",
        title: "晚間放鬆｜夜間",
        date: prefix + "-12",
        time: "19:30~20:30",
        instructor: "佳貞老師",
        capacity: 12,
        enrolled: 4
      },
      {
        id: prefix + "-yoga-late",
        title: "流動瑜伽｜夜間",
        date: prefix + "-19",
        time: "19:30~20:30",
        instructor: "佳貞老師",
        capacity: 12,
        enrolled: 4
      }
    ];
  }

  function getGreetingName(user, member) {
    if (
      member.isNew ||
      member.displayName === "新學員" ||
      member.displayName === "LINE學員" ||
      !member.displayName
    ) {
      return user.displayName || member.displayName || "學員";
    }
    return member.displayName;
  }

  // ── 渲染學員資訊 ──
  function renderMember(user, member) {
    memberSection.hidden = false;
    var greetingName = getGreetingName(user, member);

    if (user.pictureUrl) {
      memberAvatar.src = user.pictureUrl;
      memberAvatar.alt = greetingName + " 的頭像";
      memberAvatar.hidden = false;
      memberAvatar.classList.remove("placeholder");
    } else {
      memberAvatar.hidden = true;
    }

    memberName.textContent = greetingName + " 您好";

    if (member.justRegistered) {
      memberMeta.textContent = "已自動登記 · 請聯絡工作室開通堂數";
      devHint.hidden = false;
      devHint.textContent = "您的資料已寫入系統，工作室設定堂數後即可預約。";
    } else if (member.status === "pending") {
      memberMeta.textContent = "帳號審核中 · 請聯絡工作室";
      devHint.hidden = true;
    } else if (member.credits <= 0) {
      memberMeta.textContent = "已登入 · 尚無可預約堂數，請聯絡工作室";
      devHint.hidden = true;
    } else {
      memberMeta.textContent = "已自動登入 · 無需輸入密碼";
      devHint.hidden = true;
    }

    creditsNumber.textContent = String(member.credits);

    if (member.isTrial) {
      creditsExpiry.textContent = "體驗期限：" + member.expiresAt + "（贈送後兩週）";
    } else {
      creditsExpiry.textContent = "到期日：" + member.expiresAt;
    }
  }

  async function loadMember(user) {
    var member;

    if (window.gosuApi && window.gosuApi.isConfigured()) {
      member = await window.gosuApi.getMember(user.userId, user.displayName);
    } else {
      member = getDemoMember(user);
    }

    currentMember = member;
    renderMember(user, member);
    return member;
  }

  async function loadCourses() {
    updateMonthLabel();
    monthOverview.innerHTML = "";
    scheduleList.innerHTML = '<div class="empty-msg">讀取課表中…</div>';

    var oldNote = document.querySelector(".calendar-note");
    if (oldNote) {
      oldNote.remove();
    }

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

    renderScheduleList(courses);
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

  schedulePanel.addEventListener("click", function (event) {
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

      scheduleSection.hidden = false;

      if (!window.gosuApi || !window.gosuApi.isConfigured()) {
        devHint.hidden = false;
        setStatus("ok", "示範模式 · 編號：" + user.userId);
      } else {
        devHint.hidden = true;
      }

      await loadMember(user);
      await loadCourses();

      var greetingName = getGreetingName(user, currentMember);
      setStatus("ok", greetingName + " 您好，登入成功");
    } catch (error) {
      console.error("[APP]", error);
      setStatus("error", error.message || "發生未知錯誤");
    }
  }

  boot();
})();

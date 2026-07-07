/**
 * 高手揪派 — 老師課表與預約（唯讀）
 */
(function () {
  "use strict";

  var monthSummaryEl = document.getElementById("month-summary");
  var calendarSectionEl = document.getElementById("calendar-section");
  var dayDetailEl = document.getElementById("day-detail");
  var monthLabelEl = document.getElementById("month-label");
  var calendarGridEl = document.getElementById("calendar-grid");
  var statClassesEl = document.getElementById("stat-classes");
  var statCompletedEl = document.getElementById("stat-completed");
  var statBookedClassesEl = document.getElementById("stat-booked-classes");
  var statBookingsEl = document.getElementById("stat-bookings");
  var viewDateEl = document.getElementById("view-date");
  var statusPanel = document.getElementById("status-panel");
  var forbiddenPanel = document.getElementById("forbidden-panel");
  var courseListEl = document.getElementById("course-list");
  var btnRefresh = document.getElementById("btn-refresh");
  var btnToday = document.getElementById("btn-today");
  var btnCopy = document.getElementById("btn-copy");
  var btnPrevMonth = document.getElementById("btn-prev-month");
  var btnNextMonth = document.getElementById("btn-next-month");
  var copyToast = document.getElementById("copy-toast");

  var visibleMonth = new Date();
  visibleMonth.setDate(1);
  visibleMonth.setHours(0, 0, 0, 0);

  var selectedDate = "";
  var latestSchedule = null;
  var latestMonthOverview = null;

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateKey(year, month, day) {
    var monthText = month < 10 ? "0" + month : String(month);
    var dayText = day < 10 ? "0" + day : String(day);
    return year + "-" + monthText + "-" + dayText;
  }

  function getWeekdayIndex(dateKey) {
    return new Date(dateKey + "T12:00:00").getDay();
  }

  function isWeekdayDate(dateKey) {
    var weekday = getWeekdayIndex(dateKey);
    return weekday !== 0 && weekday !== 6;
  }

  function getWorkdayColumn(dateKey) {
    return getWeekdayIndex(dateKey) - 1;
  }

  function getTodayKey() {
    var now = new Date();
    return formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function setStatus(kind, message) {
    if (dayDetailEl) {
      dayDetailEl.hidden = false;
    }
    if (!statusPanel) {
      return;
    }
    statusPanel.hidden = false;
    statusPanel.className = "status-panel is-" + kind;
    statusPanel.textContent = message;
  }

  function hideStatus() {
    statusPanel.hidden = true;
    statusPanel.textContent = "";
  }

  function updateMonthLabel() {
    monthLabelEl.textContent = visibleMonth.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long"
    });
  }

  function renderMonthSummary(summary) {
    if (!summary) {
      monthSummaryEl.hidden = true;
      return;
    }

    monthSummaryEl.hidden = false;
    statClassesEl.textContent = String(summary.classCount || 0);
    statCompletedEl.textContent = String(summary.completedClassCount || 0);
    statBookedClassesEl.textContent = String(summary.bookedClassCount || 0);
    statBookingsEl.textContent = String(summary.totalBookings || 0);
  }

  function buildDaysMap(days) {
    var map = new Map();

    (days || []).forEach(function (day) {
      map.set(day.date, day);
    });

    return map;
  }

  function renderCalendar(days) {
    var year = visibleMonth.getFullYear();
    var monthIndex = visibleMonth.getMonth();
    var month = monthIndex + 1;
    var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    var daysMap = buildDaysMap(days);
    var todayKey = getTodayKey();
    var html = "";
    var weekdayDays = [];
    var day;
    var pad;

    for (day = 1; day <= daysInMonth; day++) {
      var dateKey = formatDateKey(year, month, day);
      if (isWeekdayDate(dateKey)) {
        weekdayDays.push({ day: day, dateKey: dateKey });
      }
    }

    if (weekdayDays.length) {
      var leading = getWorkdayColumn(weekdayDays[0].dateKey);
      for (pad = 0; pad < leading; pad++) {
        html += '<div class="calendar-cell is-padding" aria-hidden="true"></div>';
      }
    }

    weekdayDays.forEach(function (item) {
      var info = daysMap.get(item.dateKey) || {};
      var cellClass = "calendar-cell";
      var badge = "";

      if (item.dateKey === todayKey) {
        cellClass += " is-today";
      }

      if (item.dateKey === selectedDate) {
        cellClass += " is-selected";
      }

      if (info.isClosure) {
        cellClass += " is-closure-day";
        badge = '<span class="cal-badge is-closure">停課</span>';
      } else if (info.hasBookings) {
        cellClass += " has-bookings";
        badge = '<span class="cal-badge">' + escapeHtml(info.bookedCount) + "人</span>";
      } else if (info.classCount) {
        cellClass += " has-class";
        badge = '<span class="cal-badge is-open">' + escapeHtml(info.classCount) + "堂</span>";
      }

      html +=
        '<button class="' + cellClass + '" type="button" data-date="' + escapeHtml(item.dateKey) + '">' +
          '<span class="cal-day-num">' + item.day + "</span>" +
          badge +
        "</button>";
    });

    if (weekdayDays.length) {
      var trailing = 4 - getWorkdayColumn(weekdayDays[weekdayDays.length - 1].dateKey);
      for (day = 0; day < trailing; day++) {
        html += '<div class="calendar-cell is-padding" aria-hidden="true"></div>';
      }
    }

    calendarGridEl.innerHTML = html;
  }

  function formatStudentCredits(student) {
    if (student.creditsLeft === null || student.creditsLeft === undefined) {
      return "";
    }

    return (
      '<span class="student-credits">剩 ' +
      escapeHtml(student.creditsLeft) +
      " 堂</span>"
    );
  }

  function formatStudentCreditsText(student) {
    if (student.creditsLeft === null || student.creditsLeft === undefined) {
      return "";
    }

    return "，剩 " + student.creditsLeft + " 堂";
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
            '<div class="student-main">' +
              '<span class="student-name">' + escapeHtml(student.name) + "</span>" +
              formatStudentCredits(student) +
            "</div>" +
            '<span class="' + typeClass + '">' + escapeHtml(student.type) + "</span>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderCourses(courses, dateLabel) {
    var list = courses || [];

    if (!list.length) {
      courseListEl.hidden = true;
      courseListEl.innerHTML = "";
      setStatus("empty", (dateLabel || "這天") + "沒有課程");
      return;
    }

    hideStatus();
    courseListEl.hidden = false;
    courseListEl.innerHTML = list.map(function (course) {
      var cardClass = "course-card";
      var noteText = course.note || "";

      if (course.status === "停課" || noteText.indexOf("停課") !== -1) {
        cardClass += " is-closure";
      }

      var noteHtml = noteText
        ? '<p class="course-note">' + escapeHtml(noteText) + "</p>"
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

  function renderDateBanner(data) {
    var weekday = data.weekday || "—";
    viewDateEl.textContent = data.dateLabel + "（星期" + weekday + "）";
  }

  function buildCopyText(data) {
    var lines = [];

    lines.push("高手揪派｜當日預約");
    lines.push(data.dateLabel + "（星期" + data.weekday + "）");
    lines.push("");

    if (!data.courses || !data.courses.length) {
      lines.push("這天沒有課程");
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
          lines.push("- " + student.name + "（" + student.type + formatStudentCreditsText(student) + "）");
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
    monthSummaryEl.hidden = true;
    calendarSectionEl.hidden = true;
    dayDetailEl.hidden = true;
    courseListEl.hidden = true;
    courseListEl.innerHTML = "";
    forbiddenPanel.hidden = false;
    forbiddenPanel.innerHTML =
      '<div class="line-id-card">' +
        '<p class="forbidden-title">尚未開通老師查看權限</p>' +
        '<p class="forbidden-text" id="access-message">讀取申請狀態中…</p>' +
        '<p class="line-id-name">' + escapeHtml(user.displayName || "LINE 使用者") + "</p>" +
        '<div class="line-id-actions" id="access-actions"></div>' +
      "</div>";

    loadAccessPanel(user);
  }

  async function loadAccessPanel(user) {
    var messageEl = document.getElementById("access-message");
    var actionsEl = document.getElementById("access-actions");

    try {
      var status = await window.gosuApi.getTeacherStatus(user.userId);

      if (status.teacherRole === "待審核") {
        messageEl.textContent = "您的申請已送出，請等候工作室核准。核准後會以 LINE 通知您。";
        actionsEl.innerHTML =
          '<button type="button" class="line-id-btn line-id-btn-secondary" id="btn-recheck-access">重新整理狀態</button>';
        document.getElementById("btn-recheck-access").addEventListener("click", function () {
          boot();
        });
        return;
      }

      messageEl.textContent = "點下方按鈕申請開通。工作室核准後，您就能查看課表與預約名單。";
      actionsEl.innerHTML =
        '<button type="button" class="line-id-btn" id="btn-request-access">申請開通老師權限</button>';
      document.getElementById("btn-request-access").addEventListener("click", function () {
        submitAccessRequest(user);
      });
    } catch (error) {
      console.error("[teacher-access]", error);
      messageEl.textContent = "無法讀取申請狀態，請稍後再試。";
      actionsEl.innerHTML =
        '<button type="button" class="line-id-btn" id="btn-request-access">申請開通老師權限</button>';
      document.getElementById("btn-request-access").addEventListener("click", function () {
        submitAccessRequest(user);
      });
    }
  }

  async function submitAccessRequest(user) {
    try {
      forbiddenPanel.hidden = true;

      var result = await window.gosuApi.requestTeacherAccess(
        user.userId,
        user.displayName
      );

      if (result.status === "approved") {
        boot();
        return;
      }

      showForbiddenPanel(user);
      showCopyToast(result.message || "已送出申請");
    } catch (error) {
      console.error("[teacher-request]", error);
      showForbiddenPanel(user);
      showCopyToast(error.message || "申請失敗，請稍後再試");
    }
  }

  async function loadMonthOverview(userId) {
    if (!window.gosuApi || typeof window.gosuApi.getTeacherMonthOverview !== "function") {
      throw new Error("頁面版本過舊，請關閉後用新連結重新開啟");
    }

    var year = visibleMonth.getFullYear();
    var month = visibleMonth.getMonth() + 1;
    var data = await window.gosuApi.getTeacherMonthOverview(userId, year, month);

    latestMonthOverview = data;
    updateMonthLabel();
    renderMonthSummary(data.summary);
    renderCalendar(data.days || []);
  }

  async function loadDayDetail(userId, dateIso) {
    selectedDate = dateIso;
    setStatus("loading", "讀取中，請稍候…");
    courseListEl.hidden = true;
    courseListEl.innerHTML = "";

    if (latestMonthOverview) {
      renderCalendar(latestMonthOverview.days || []);
    }

    var data = await window.gosuApi.getTeacherSchedule(userId, { date: dateIso });

    latestSchedule = data;
    renderDateBanner(data);
    renderCourses(data.courses || [], data.dateLabel);
  }

  async function boot() {
    try {
      hideForbiddenPanel();
      monthSummaryEl.hidden = true;
      calendarSectionEl.hidden = true;
      dayDetailEl.hidden = true;

      if (!window.gosuApi || !window.gosuApi.isConfigured()) {
        throw new Error("API 尚未設定，請聯絡技術人員");
      }

      await window.gosuLiffReady;

      if (!window.gosuUser || !window.gosuUser.userId) {
        throw new Error("無法取得 LINE 登入資訊，請從 LINE 重新開啟");
      }

      if (!selectedDate) {
        selectedDate = getTodayKey();
      }

      dayDetailEl.hidden = false;

      try {
        await loadMonthOverview(window.gosuUser.userId);
        monthSummaryEl.hidden = false;
        calendarSectionEl.hidden = false;
      } catch (monthError) {
        console.error("[teacher-month]", monthError);
        latestMonthOverview = null;
        updateMonthLabel();
        renderMonthSummary({
          classCount: 0,
          completedClassCount: 0,
          bookedClassCount: 0,
          totalBookings: 0
        });
        renderCalendar([]);
        monthSummaryEl.hidden = false;
        calendarSectionEl.hidden = false;
        setStatus("error", (monthError.message || "月曆讀取失敗") + "，仍顯示當日名單");
      }

      await loadDayDetail(window.gosuUser.userId, selectedDate);
    } catch (error) {
      console.error("[teacher]", error);
      latestSchedule = null;
      latestMonthOverview = null;
      courseListEl.hidden = true;
      courseListEl.innerHTML = "";

      if (error && error.status === 403 && window.gosuUser) {
        showForbiddenPanel(window.gosuUser);
        return;
      }

      hideForbiddenPanel();
      monthSummaryEl.hidden = true;
      calendarSectionEl.hidden = true;
      dayDetailEl.hidden = false;
      setStatus("error", error.message || "讀取失敗，請稍後再試");
    }
  }

  function bindClick(el, handler) {
    if (el) {
      el.addEventListener("click", handler);
    }
  }

  function bindEvents() {
    bindClick(btnRefresh, function () {
      if (!window.gosuUser || !window.gosuUser.userId) {
        return;
      }

      Promise.all([
        loadMonthOverview(window.gosuUser.userId),
        loadDayDetail(window.gosuUser.userId, selectedDate)
      ]).catch(function (error) {
        console.error("[teacher-refresh]", error);
        setStatus("error", error.message || "讀取失敗，請稍後再試");
      });
    });

    bindClick(btnToday, function () {
      if (!window.gosuUser || !window.gosuUser.userId) {
        return;
      }

      visibleMonth = new Date();
      visibleMonth.setDate(1);
      visibleMonth.setHours(0, 0, 0, 0);
      selectedDate = getTodayKey();

      Promise.all([
        loadMonthOverview(window.gosuUser.userId),
        loadDayDetail(window.gosuUser.userId, selectedDate)
      ]).catch(function (error) {
        console.error("[teacher-today]", error);
        setStatus("error", error.message || "讀取失敗，請稍後再試");
      });
    });

    bindClick(btnCopy, function () {
      copyScheduleText();
    });

    bindClick(btnPrevMonth, function () {
      if (!window.gosuUser || !window.gosuUser.userId) {
        return;
      }

      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
      loadMonthOverview(window.gosuUser.userId).catch(function (error) {
        console.error("[teacher-prev-month]", error);
        setStatus("error", error.message || "讀取失敗，請稍後再試");
      });
    });

    bindClick(btnNextMonth, function () {
      if (!window.gosuUser || !window.gosuUser.userId) {
        return;
      }

      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
      loadMonthOverview(window.gosuUser.userId).catch(function (error) {
        console.error("[teacher-next-month]", error);
        setStatus("error", error.message || "讀取失敗，請稍後再試");
      });
    });

    if (calendarGridEl) {
      calendarGridEl.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-date]");
        if (!button || !window.gosuUser || !window.gosuUser.userId) {
          return;
        }

        var dateIso = button.getAttribute("data-date");
        loadDayDetail(window.gosuUser.userId, dateIso).catch(function (error) {
          console.error("[teacher-day]", error);
          setStatus("error", error.message || "讀取失敗，請稍後再試");
        });
      });
    }
  }

  try {
    bindEvents();
    boot();
  } catch (error) {
    console.error("[teacher-init]", error);
    if (dayDetailEl) {
      dayDetailEl.hidden = false;
    }
    setStatus("error", error.message || "頁面初始化失敗");
  }
})();

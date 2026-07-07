/**
 * 老師 LIFF 頁面權限與台北時區日期
 */

var WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

export function parseTeacherUserIds(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
}

export function isTeacherUser(env, userId) {
  if (!userId) {
    return false;
  }

  var allowed = parseTeacherUserIds(env.TEACHER_LINE_USER_IDS);
  return allowed.indexOf(userId) !== -1;
}

export function getTaipeiDateString(offsetDays) {
  var offset = Number(offsetDays) || 0;
  var target = new Date(Date.now() + offset * 86400000);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(target);
}

function getWeekdayIndexTaipei(dateIso) {
  var label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    weekday: "short"
  }).format(new Date(dateIso + "T12:00:00+08:00"));

  var map = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return map[label] != null ? map[label] : 0;
}

export function getTaipeiWeekdayChar(dateIso) {
  return WEEKDAY_ZH[getWeekdayIndexTaipei(dateIso)];
}

export function formatDateZhFromIso(dateIso) {
  if (!dateIso) {
    return "—";
  }

  var parts = dateIso.split("-");
  if (parts.length !== 3) {
    return dateIso;
  }

  return parts[0] + "/" + parts[1] + "/" + parts[2];
}

export function resolveTeacherDateParam(searchParams) {
  var dateParam = (searchParams.get("date") || "").trim();
  var dayParam = (searchParams.get("day") || "").trim().toLowerCase();

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return dateParam;
  }

  if (dayParam === "tomorrow") {
    return getTaipeiDateString(1);
  }

  return getTaipeiDateString(0);
}

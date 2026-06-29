export function isoToday() {
  var now = new Date();
  return (
    now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" +
    String(now.getDate()).padStart(2, "0")
  );
}

export function addDays(isoDate, days) {
  var date = new Date(isoDate + "T12:00:00");
  date.setDate(date.getDate() + days);
  return (
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

export function isTrialMember(member) {
  return Boolean(member.trialGiftRaw) && member.credits <= 1;
}

export function getTrialExpiryDate(trialGiftRaw) {
  if (!trialGiftRaw) return "";
  return addDays(trialGiftRaw, 14);
}

export function getEffectiveExpiryRaw(member) {
  if (isTrialMember(member)) {
    return getTrialExpiryDate(member.trialGiftRaw);
  }
  return member.expiresRaw || "";
}

export function isMemberExpiredByRules(member) {
  var expiry = getEffectiveExpiryRaw(member);
  if (!expiry) return false;
  return expiry < isoToday();
}

export function validateTrialBooking(member, courseDate) {
  if (!isTrialMember(member)) {
    return;
  }

  var trialEnd = getTrialExpiryDate(member.trialGiftRaw);
  var today = isoToday();

  if (today > trialEnd) {
    throw new Error("體驗課已過期，請聯絡工作室購買正式課程（贈送後兩週內有效）");
  }

  if (courseDate > trialEnd) {
    throw new Error("體驗課僅能預約贈送後兩週內的課程");
  }
}

export function shouldExtendPurchaseExpiry(member, nextRecordedCredits) {
  if (nextRecordedCredits <= member.systemRecordedCredits) {
    return false;
  }

  if (isTrialMember(member) && nextRecordedCredits <= 1) {
    return false;
  }

  return nextRecordedCredits > member.systemRecordedCredits;
}

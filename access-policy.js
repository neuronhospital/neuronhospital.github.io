"use strict";

// Shared client-side role/city access policy. This intentionally mirrors the
// Android app's UI-level restrictions; it does not replace backend authorization.
(function () {
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];

  function canonicalCity(value) {
    const raw = String(value || "").trim().toLowerCase();
    return CITIES.find((city) => city.toLowerCase() === raw) || "";
  }

  function scheduledToday(city, dateParts) {
    const canonical = canonicalCity(city);
    if (!canonical || !dateParts) return false;
    const date = new Date(Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day)));
    const weekday = date.getUTCDay();
    const week = Math.floor((Number(dateParts.day) - 1) / 7) + 1;
    switch (canonical) {
      case "Latur": return [1, 2, 3, 5, 6].includes(weekday) || ((weekday === 4 || weekday === 0) && week === 5);
      case "Nilanga": return weekday === 6 && week === 1;
      case "Udgir": return weekday === 0 && [2, 4].includes(week);
      case "Beed": return weekday === 4 && [2, 4].includes(week);
      case "Ambajogai": return weekday === 0 && [1, 3].includes(week);
      case "Dharashiv": return weekday === 4 && [1, 3].includes(week);
      case "Barshi": return weekday === 4 && [1, 3].includes(week);
      case "Omerga": return weekday === 6 && week >= 2 && week <= 5;
      default: return false;
    }
  }

  function activeSpecialCity(configuration, dateParts) {
    const special = configuration && configuration.specialAccess;
    if (!special || special.enabled !== true || special.date !== dateParts.iso) return "";
    return canonicalCity(special.city);
  }

  function canOpenCityRestrictedSection(session, configuration, dateParts) {
    if (!session || session.admin === true) return true;
    const assigned = canonicalCity(session.city);
    // Latur accounts retain broad access to Today's OPD and Statistics, as in Android.
    if (assigned === "Latur") return true;
    if (!assigned) return false;
    return scheduledToday(assigned, dateParts) || activeSpecialCity(configuration, dateParts) === assigned;
  }

  function allowedAppointmentCities(session, configuration, dateParts) {
    if (!session || session.admin === true || canonicalCity(session.city) === "Latur") return CITIES.slice();
    const assigned = canonicalCity(session.city);
    const special = activeSpecialCity(configuration, dateParts);
    return [assigned, special].filter((city, index, all) => city && all.indexOf(city) === index);
  }

  window.NeuronAccessPolicy = Object.freeze({
    canonicalCity,
    scheduledToday,
    activeSpecialCity,
    canOpenCityRestrictedSection,
    allowedAppointmentCities
  });
})();

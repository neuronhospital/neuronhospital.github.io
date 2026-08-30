/*
 * NEURON Doctor Schedule
 * Version: v118 schedule sync patch
 * Purpose: Calendar availability only.
 * This schedule must match code.gs VISIT_INFO and booking validation.
 */

window.Schedule = (function () {

  function occurrence(date) {
    return Math.floor((date.getDate() - 1) / 7) + 1;
  }

  function dayNumber(date) {
    // Sunday = 7, Monday = 1 ... Saturday = 6
    return date.getDay() === 0 ? 7 : date.getDay();
  }

  function timeWindow(city, date) {

    const day = dayNumber(date);
    const ord = occurrence(date);

    if (city === "Latur") {
      if (day === 1 || day === 2 || day === 3 || day === 5) return ["00:00", "24:00"];
      if (day === 6) return ["15:00", "24:00"];
      if (day === 4 && ord === 5) return ["00:00", "24:00"];
      if (day === 7 && ord === 5) return ["00:00", "24:00"];
      return null;
    }

    if (city === "Nilanga") {
      if (day === 6 && ord === 1) return ["00:00", "15:00"];
      return null;
    }

    if (city === "Udgir") {
      if (day === 7 && (ord === 2 || ord === 4)) return ["00:00", "24:00"];
      return null;
    }

    if (city === "Beed") {
      if (day === 4 && (ord === 2 || ord === 4)) return ["00:00", "24:00"];
      return null;
    }

    if (city === "Ambajogai") {
      if (day === 7 && (ord === 1 || ord === 3)) return ["14:00", "24:00"];
      return null;
    }

    if (city === "Parli") {
      if (day === 7 && (ord === 1 || ord === 3)) return ["00:00", "14:00"];
      return null;
    }

    if (city === "Dharashiv") {
      if (day === 4 && (ord === 1 || ord === 3)) return ["00:00", "15:00"];
      return null;
    }

    if (city === "Omerga") {
      if (day === 6 && (ord === 2 || ord === 3 || ord === 4 || ord === 5))
        return ["00:00", "15:00"];
      return null;
    }

    if (city === "Barshi") {
      if (day === 4 && (ord === 1 || ord === 3))
        return ["15:00", "24:00"];
      return null;
    }

    return null;
  }

  function isAvailable(city, date) {
    return timeWindow(city, date) !== null;
  }

  function dates(city, date) {
    return isAvailable(city, date);
  }

  function hours(city, date) {
    return timeWindow(city, date);
  }

  return {
    dates: dates,
    hours: hours,
    isAvailable: isAvailable
  };

})();
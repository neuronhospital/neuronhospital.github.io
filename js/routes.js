/* Route registry for the browser adaptation. It is descriptive, not an authorization boundary.
   Feature availability reflects this website source snapshot, not the Android feature inventory. */
(function (global) {
  "use strict";
  const routes = [
    { id: "home", label: "Home", path: "index.html", status: "existing", access: "public-entry" },
    { id: "opd-booking", label: "OPD Booking", path: "opd_booking.html", status: "existing", access: "authenticated-user" },
    { id: "opd-update", label: "OPD Update", path: "opd_update.html", status: "existing", access: "authenticated-user" },
    { id: "opd-today", label: "Today's OPD", path: null, status: "existing-modal", access: "city-policy" },
    { id: "prebooking", label: "PreBooking", path: "prebooking.html", status: "implemented", access: "public-entry" },
    { id: "pending-appointment", label: "Pending Appointment", path: "pending_appointments.html", status: "implemented", access: "authenticated-user" },
    { id: "eeg-booking", label: "EEG Booking", path: "eeg_booking.html", status: "existing", access: "authenticated-user" },
    { id: "eeg-update", label: "EEG Update", path: "eeg_update.html", status: "existing", access: "authenticated-user" },
    { id: "eeg-calls-latur", label: "Latur EEG Calls", path: "eeg_calls_booking.html", status: "existing", access: "eegcalls-latur" },
    { id: "eeg-calls-ambajogai", label: "Ambajogai EEG Calls", path: "ambajogai_eeg_calls.html", status: "implemented", access: "eegcalls-ambajogai" },
    { id: "eeg-calls-update", label: "EEG Calls Update / Stats", path: "eeg_calls_update_stats.html", status: "existing", access: "eegcalls-permission" },
    { id: "refund", label: "Refund", path: "refund.html", status: "existing", access: "authenticated-user" },
    { id: "statistics", label: "Statistics & Reports", path: "statistics.html", status: "existing", access: "city-policy" },
    { id: "admin-tools", label: "Admin Tools", path: "admin.html", status: "implemented", access: "admin" },
    { id: "settings", label: "Settings", path: "settings.html", status: "implemented", access: "authenticated-user" },
    { id: "active-users", label: "Active Users", path: null, status: "not-ported", access: "admin" },
    { id: "special-day-mode", label: "Special Day Mode", path: null, status: "not-ported", access: "admin" },
    { id: "doctor-visit-cancelled", label: "Doctor Visit Cancelled", path: null, status: "not-ported", access: "admin" },
    { id: "notification-card", label: "Notification Card", path: null, status: "not-ported", access: "admin" },
    { id: "operation", label: "Operation", path: null, status: "not-ported", access: "authenticated-user" },
    { id: "about", label: "About", path: "about.html", status: "implemented", access: "public" },
    { id: "privacy-policy", label: "Privacy Policy", path: "privacy.html", status: "implemented", access: "public" },
    { id: "terms-of-use", label: "Terms of Use", path: "terms.html", status: "implemented", access: "public" },
    { id: "help-support", label: "Help & Support", path: "support.html", status: "implemented", access: "public" }
  ];
  const byId = Object.freeze(Object.fromEntries(routes.map(route => [route.id, Object.freeze(route)])));
  const byPath = Object.freeze(Object.fromEntries(routes.filter(route => route.path).map(route => [route.path, route])));
  const current = () => byPath[(global.location.pathname.split("/").pop() || "index.html").toLowerCase()] || byId.home;
  const list = () => routes.map(route => ({ ...route }));
  global.NeuronRoutes = Object.freeze({ list, byId, byPath, current });
})(window);

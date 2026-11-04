(() => {
  "use strict";

  // Backend endpoint is sourced from NEURON-v2.0.zip app/build.gradle.kts.
  const BACKEND_URL = "https://script.google.com/macros/s/AKfycbydDHTK0diS9Vius8V9y5kgjnmwoNPIBc9gjcdtN1GcDJIWY0Ql_JlCXxX8vNh5C34/exec";
  const SESSION_KEY = "neuronWebsiteSession_v2";
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  // Initialize the versioned IndexedDB data layer. Storage failure is surfaced
  // through this readiness promise; login/navigation remain usable without cache.
  window.NeuronDataReady = window.NeuronStorage
    ? window.NeuronStorage.open().then(() => true).catch((error) => {
        console.error("NEURON local data store unavailable:", error);
        return false;
      })
    : Promise.resolve(false);

  const authScreen = document.getElementById("authScreen");
  const appFrame = document.getElementById("appFrame");
  const loginForm = document.getElementById("loginForm");
  const usernameInput = document.getElementById("loginUsername");
  const passwordInput = document.getElementById("loginPassword");
  const authError = document.getElementById("authError");
  const loginSubmit = document.getElementById("loginSubmit");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("sidebarScrim");
  const menuButton = document.getElementById("menuButton");
  const sidebarClose = document.getElementById("sidebarClose");
  const breadcrumbCurrent = document.getElementById("breadcrumbCurrent");
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const pageContent = document.getElementById("pageContent");
  const toast = document.getElementById("toast");
  let toastTimer = null;
  let activeUser = null;

  const viewCopy = {
    home: ["Dashboard", "Your NEURON workspace, based on your account access."],
    opd: ["OPD Booking", "OPD booking workflow will be connected in its implementation phase."],
    today: ["Today's OPD", "Today's OPD workspace will be connected in its implementation phase."],
    eeg: ["EEG", "EEG and EEG Calls workflows will be connected in their implementation phase."],
    prebooking: ["PreBooking", "PreBooking workflow will be connected in its implementation phase."],
    followup: ["Follow-up", "Follow-up workspace will be connected in its implementation phase."],
    statistics: ["Statistics & Reports", "Statistics and reporting will be connected in its implementation phase."],
    services: ["Patient Services", "Patient Services will be connected in its implementation phase."],
    settings: ["Settings", "Account and settings workflows will be connected in their implementation phase."]
  };

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function setAuthView(signedIn) {
    authScreen.hidden = signedIn;
    appFrame.hidden = !signedIn;
    if (!signedIn) {
      window.setTimeout(() => usernameInput.focus(), 0);
    }
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    scrim.classList.remove("visible");
    menuButton.setAttribute("aria-expanded", "false");
  }

  function openSidebar() {
    sidebar.classList.add("open");
    scrim.classList.add("visible");
    menuButton.setAttribute("aria-expanded", "true");
  }

  function setView(view) {
    const copy = viewCopy[view] || viewCopy.home;
    document.querySelectorAll("[data-view]").forEach((el) => {
      if (el.classList.contains("nav-item")) {
        const selected = el.dataset.view === view;
        el.classList.toggle("active", selected);
        if (selected) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      }
    });
    breadcrumbCurrent.textContent = copy[0];
    pageTitle.textContent = copy[0];
    pageSubtitle.textContent = copy[1];
    if (view !== "home") showToast(copy[1]);
    closeSidebar();
    pageContent.focus({ preventScroll: true });
  }

  function normalizeCity(city) {
    const supported = ["Latur", "Udgir", "Nilanga", "Dharashiv", "Omerga", "Barshi", "Beed", "Ambajogai"];
    return supported.find((item) => item.toLowerCase() === String(city || "").trim().toLowerCase()) || "";
  }

  function makeRequestId() {
    const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
    return "LR_" + Date.now().toString(36) + "_" + randomPart;
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || typeof session !== "object" || !session.username || !session.password || !session.createdAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      const isAdmin = session.admin === true;
      if (!isAdmin && Date.now() - Number(session.createdAt) >= SESSION_TTL_MS) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      if (!normalizeCity(session.city)) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (_) {
      return null;
    }
  }

  function saveSession(session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return true;
    } catch (_) {
      return false;
    }
  }

  function renderUser(session) {
    activeUser = session;
    const displayName = session.username;
    document.getElementById("profileUsername").textContent = displayName;
    document.getElementById("profileRole").textContent = session.admin ? "Administrator" : "Staff account";
    document.getElementById("profileAvatar").textContent = displayName.charAt(0).toUpperCase();
    document.getElementById("sidebarAccountName").textContent = displayName;
    document.getElementById("sidebarAccountCity").textContent = "Assigned city: " + session.city;
    document.getElementById("sessionStatus").textContent = session.admin ? "Administrator session" : "Signed in";
    document.getElementById("profileChip").setAttribute("aria-label", displayName + ", " + session.city);
    setAuthView(true);
    setView("home");
  }

  async function authenticate(username, password) {
    const payload = {
      action: "login",
      username,
      password,
      loginRequestId: makeRequestId()
    };
    let response;
    try {
      response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "follow"
      });
    } catch (error) {
      throw new Error("Could not connect to the NEURON backend. Check the connection and try again.");
    }
    if (!response.ok) throw new Error("Backend request failed (HTTP " + response.status + ").");
    let data;
    try { data = await response.json(); }
    catch (_) { throw new Error("The backend returned an unreadable login response."); }

    if (data.loginRequestId !== payload.loginRequestId) throw new Error("Login response did not match this request. Please try again.");
    if (data.status === "accessdenied") throw new Error("Access denied. Check your username and password.");
    if (data.status !== "accessallowed") throw new Error("The backend returned an unrecognized login status.");
    const canonicalUsername = String(data.username || "").trim();
    const canonicalCity = normalizeCity(data.city);
    if (!canonicalUsername || !canonicalCity) throw new Error("The backend login response is missing a valid username or assigned city.");
    return {
      username: canonicalUsername,
      password,
      city: canonicalCity,
      admin: data.admin === true,
      eegcalls: data.eegcalls === true,
      createdAt: Date.now(),
      loginRequestId: payload.loginRequestId
    };
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authError.textContent = "";
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!/^[A-Za-z]+$/.test(username)) {
      authError.textContent = "Username must contain letters only.";
      usernameInput.focus();
      return;
    }
    if (!/^[0-9]+$/.test(password)) {
      authError.textContent = "Password must contain numbers only.";
      passwordInput.focus();
      return;
    }
    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing in…";
    try {
      const session = await authenticate(username, password);
      if (!saveSession(session)) {
        authError.textContent = "Sign-in succeeded, but this browser cannot save the session. Enable site storage and try again.";
        return;
      }
      passwordInput.value = "";
      renderUser(session);
      showToast("Signed in successfully.");
    } catch (error) {
      authError.textContent = error instanceof Error ? error.message : "Sign-in failed. Please try again.";
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
    }
  });

  document.getElementById("logoutButton").addEventListener("click", () => {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    activeUser = null;
    closeSidebar();
    authError.textContent = "";
    passwordInput.value = "";
    setAuthView(false);
    showToast("You have signed out.");
  });

  document.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("click", () => setView(el.dataset.view)));
  menuButton.addEventListener("click", openSidebar);
  sidebarClose.addEventListener("click", closeSidebar);
  scrim.addEventListener("click", closeSidebar);
  document.getElementById("exploreButton").addEventListener("click", () => {
    document.querySelector(".overview-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Application shell preview. Operational workflows are implemented in later phases.");
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });
  window.addEventListener("resize", () => { if (window.innerWidth > 820) closeSidebar(); });
  menuButton.setAttribute("aria-expanded", "false");

  const restored = readSession();
  if (restored) renderUser(restored);
  else setAuthView(false);
})();

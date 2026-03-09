/**
 * BEGINNER GUIDE: Landing/dashboard shared UI interactions.
 * Initializes lightweight page behaviors and helpers.
 */
(function () {
  function getAuth() {
    return window.CashMorphAuth;
  }

  function setYear() {
    const yearEl = document.getElementById("yearValue");
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  function updateNavbarByRole() {
    const auth = getAuth();
    if (!auth) {
      return;
    }

    const user = auth.getUser();
    const adminLink = document.getElementById("navAdminLink");
    const profileButton = document.getElementById("navProfileBtn");

    if (adminLink) {
      const showAdmin = Boolean(user && user.role === "admin");
      adminLink.classList.toggle("hidden", !showAdmin);
    }

    if (profileButton) {
      profileButton.classList.toggle("hidden", !user);
    }
  }

  function initNavigation() {
    const auth = getAuth();
    const navAction = document.getElementById("navAuthAction");
    const newExchangeButton = document.getElementById("navNewExchange");
    const startButton = document.getElementById("startExchanging");
    const howItWorksButton = document.getElementById("howItWorksBtn");
    const profileButton = document.getElementById("navProfileBtn");

    if (newExchangeButton) {
      newExchangeButton.addEventListener("click", () => {
        if (auth && auth.isAuthenticated()) {
          window.location.href = "dashboard.html";
          return;
        }

        window.location.href = "login.html";
      });
    }

    if (startButton) {
      startButton.addEventListener("click", () => {
        if (auth && auth.isAuthenticated()) {
          window.location.href = "dashboard.html";
          return;
        }

        window.location.href = "register.html";
      });
    }

    if (howItWorksButton) {
      howItWorksButton.addEventListener("click", () => {
        const section = document.getElementById("how-it-works");
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    if (profileButton) {
      profileButton.addEventListener("click", () => {
        if (!auth || !auth.isAuthenticated()) {
          window.location.href = "login.html";
          return;
        }

        window.location.href = "profile";
      });
    }

    if (navAction) {
      navAction.addEventListener("click", () => {
        if (auth && auth.isAuthenticated()) {
          auth.clearSession();
        }
        window.location.href = "login.html";
      });
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const auth = getAuth();
    if (auth && auth.isAuthenticated()) {
      await auth.syncCurrentUser();
    }

    setYear();
    initNavigation();
    updateNavbarByRole();
  });
})();

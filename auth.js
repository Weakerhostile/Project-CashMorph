/**
 * BEGINNER GUIDE: Shared authentication helper used by all frontend pages.
 * Stores session info and builds authorized API request headers.
 */
(function () {
  const API_BASE = "/api";
  const TOKEN_KEY = "cashmorph_token";
  const USER_KEY = "cashmorph_user";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isAuthenticated() {
    return Boolean(getToken());
  }

  function authHeaders() {
    const token = getToken();
    return token
      ? {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }
      : {
          "Content-Type": "application/json",
        };
  }

  function setMessage(element, text, isSuccess) {
    if (!element) {
      return;
    }

    element.textContent = text;
    element.classList.toggle("success", Boolean(isSuccess));
  }

  async function syncCurrentUser() {
    const token = getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        headers: authHeaders(),
      });

      if (!response.ok) {
        clearSession();
        return null;
      }

      const data = await response.json();
      if (!data || !data.user) {
        clearSession();
        return null;
      }

      setSession(token, data.user);
      return data.user;
    } catch (_error) {
      return getUser();
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || ""),
    };

    const messageEl = document.getElementById("loginMessage");

    if (!payload.email || !payload.password) {
      setMessage(messageEl, "Please enter email and password.", false);
      return;
    }

    try {
      setMessage(messageEl, "Signing in...", true);
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(messageEl, data.message || "Login failed.", false);
        return;
      }

      setSession(data.token, data.user);
      window.location.href = "dashboard.html";
    } catch (_error) {
      setMessage(messageEl, "Unable to connect to server.", false);
    }
  }

  async function submitRegister(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: String(formData.get("name") || "").trim(),
      roomNumber: String(formData.get("roomNumber") || "").trim(),
      block: String(formData.get("block") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim().toLowerCase(),
      password: String(formData.get("password") || ""),
    };

    const messageEl = document.getElementById("registerMessage");

    if (!payload.name || !payload.roomNumber || !payload.block || !payload.phone || !payload.email || !payload.password) {
      setMessage(messageEl, "Please fill all required fields.", false);
      return;
    }

    if (payload.password.length < 6) {
      setMessage(messageEl, "Password must be at least 6 characters.", false);
      return;
    }

    try {
      setMessage(messageEl, "Creating account...", true);
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(messageEl, data.message || "Registration failed.", false);
        return;
      }

      setSession(data.token, data.user);
      window.location.href = "dashboard.html";
    } catch (_error) {
      setMessage(messageEl, "Unable to connect to server.", false);
    }
  }

  function currentPageName() {
    return (window.location.pathname.split("/").pop() || "").toLowerCase();
  }

  function redirectLoggedInUsers(user) {
    const page = currentPageName();
    if ((page === "login.html" || page === "register.html") && user) {
      window.location.href = "dashboard.html";
    }
  }

  function protectCurrentRoute(user) {
    const body = document.body;
    if (!body || body.dataset.protected !== "true") {
      return;
    }

    if (!getToken() || !user) {
      clearSession();
      window.location.href = "login.html";
      return;
    }

    const requiredRole = body.dataset.roleRequired;
    if (requiredRole && user.role !== requiredRole) {
      window.location.href = "dashboard.html";
    }
  }

  function wireLogoutButtons() {
    const logoutButtons = document.querySelectorAll("[data-logout='true']");
    logoutButtons.forEach((button) => {
      button.addEventListener("click", () => {
        clearSession();
        window.location.href = "login.html";
      });
    });
  }

  function initAuthForms() {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", submitLogin);
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", submitRegister);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await syncCurrentUser();
    redirectLoggedInUsers(user);
    protectCurrentRoute(user);
    initAuthForms();
    wireLogoutButtons();
  });

  window.CashMorphAuth = {
    API_BASE,
    getToken,
    getUser,
    setSession,
    clearSession,
    isAuthenticated,
    authHeaders,
    syncCurrentUser,
  };
})();

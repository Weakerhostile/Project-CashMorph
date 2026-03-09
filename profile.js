/**
 * BEGINNER GUIDE: Profile page logic for viewing/updating user details.
 * Loads current user profile and submits profile update requests.
 */
(function () {
  function getAuth() {
    return window.CashMorphAuth;
  }

  function setMessage(text, isSuccess) {
    const messageEl = document.getElementById("profileMessage");
    if (!messageEl) {
      return;
    }

    messageEl.textContent = text;
    messageEl.classList.toggle("success", Boolean(isSuccess));
  }

  function fillForm(user) {
    document.getElementById("profileName").value = user.name || "";
    document.getElementById("profileRoom").value = user.roomNumber || "";
    document.getElementById("profileBlock").value = user.block || "";
    document.getElementById("profilePhone").value = user.phone || "";
    document.getElementById("profileEmail").textContent = user.email || "";
  }

  async function fetchProfile() {
    const auth = getAuth();
    if (!auth) {
      return null;
    }

    const response = await fetch(`${auth.API_BASE}/users/me`, {
      method: "GET",
      headers: auth.authHeaders(),
    });

    if (response.status === 401) {
      auth.clearSession();
      window.location.href = "login.html";
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Unable to load profile");
    }

    return data.user;
  }

  async function updateProfile(payload) {
    const auth = getAuth();
    if (!auth) {
      return null;
    }

    const response = await fetch(`${auth.API_BASE}/users/me`, {
      method: "PATCH",
      headers: auth.authHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Unable to update profile");
    }

    const token = auth.getToken();
    if (token && data.user) {
      auth.setSession(token, data.user);
    }

    return data.user;
  }

  function wireBackButton() {
    const backButton = document.getElementById("profileBackBtn");
    if (!backButton) {
      return;
    }

    backButton.addEventListener("click", () => {
      window.location.href = "dashboard.html";
    });
  }

  function wireFormSubmit() {
    const form = document.getElementById("profileForm");
    if (!form) {
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);

      const payload = {
        name: String(formData.get("name") || "").trim(),
        roomNumber: String(formData.get("roomNumber") || "").trim(),
        block: String(formData.get("block") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
      };

      if (!payload.name || !payload.roomNumber || !payload.block || !payload.phone) {
        setMessage("Please fill all fields.", false);
        return;
      }

      try {
        setMessage("Saving changes...", true);
        const user = await updateProfile(payload);
        if (user) {
          fillForm(user);
          setMessage("Profile updated successfully.", true);
        }
      } catch (error) {
        setMessage(error.message, false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    wireBackButton();
    wireFormSubmit();

    try {
      const auth = getAuth();
      if (auth && auth.isAuthenticated()) {
        await auth.syncCurrentUser();
      }

      const user = await fetchProfile();
      if (user) {
        fillForm(user);
      }
    } catch (error) {
      setMessage(error.message, false);
    }
  });
})();

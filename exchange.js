/**
 * BEGINNER GUIDE: Main exchange-board logic for users.
 * Handles listing exchanges, filters, contact flow, status updates, ratings, and notifications.
 */
(function () {
  const REFRESH_INTERVAL_MS = 15000;

  // BEGINNER NOTE: state keeps in-memory UI data for the dashboard page.
  const state = {
    allExchanges: [],
    isFetching: false,
    lastExpiryRefreshAt: 0,
    pollHandle: null,
    countdownHandle: null,
    notificationsOpen: false,
  };

  function getAuth() {
    return window.CashMorphAuth;
  }

  function setYear() {
    const yearEl = document.getElementById("yearValue");
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  function formatAmount(amount) {
    return `₹${Number(amount).toLocaleString()}`;
  }

  function formatType(type) {
    if (type === "cash-to-digital") {
      return "Cash → Digital";
    }
    return "Digital → Cash";
  }

  function getStatusInfo(status) {
    if (status === "pending") {
      return { icon: "⏳", label: "pending" };
    }
    if (status === "in-progress") {
      return { icon: "⇵", label: "in-progress" };
    }
    if (status === "verified") {
      return { icon: "✓", label: "verified" };
    }
    if (status === "completed") {
      return { icon: "◉", label: "completed" };
    }
    if (status === "expired") {
      return { icon: "⌛", label: "expired" };
    }
    if (status === "rejected") {
      return { icon: "✕", label: "rejected" };
    }
    return { icon: "◷", label: "open" };
  }

  function timeAgo(isoDate) {
    const now = Date.now();
    const target = new Date(isoDate).getTime();
    const diffInMinutes = Math.max(1, Math.floor((now - target) / 60000));

    if (diffInMinutes < 60) {
      return `${diffInMinutes} min ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getBlockFromRoom(roomNumber) {
    if (!roomNumber) {
      return "";
    }
    return String(roomNumber).trim().charAt(0).toUpperCase();
  }

  function formatCountdown(msRemaining) {
    const safe = Math.max(0, Math.floor(msRemaining / 1000));
    const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
    const seconds = String(safe % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function normalizePhoneForWhatsApp(phoneValue) {
    const digits = String(phoneValue || "").replace(/\D/g, "");
    if (!digits) {
      return "";
    }

    // For local 10-digit Indian numbers, default to +91 for WhatsApp routing.
    if (digits.length === 10) {
      return `91${digits}`;
    }
    if (digits.length === 11 && digits.startsWith("0")) {
      return `91${digits.slice(1)}`;
    }
    if (digits.length >= 11 && digits.length <= 15) {
      return digits;
    }
    return "";
  }

  function resolveExchangeContactPhone(exchange) {
    if (!exchange) {
      return "";
    }
    if (exchange.userId && typeof exchange.userId !== "string" && exchange.userId.phone) {
      return String(exchange.userId.phone).trim();
    }
    return String(exchange.phone || "").trim();
  }

  function buildExchangeContactMessage(exchange) {
    if (!exchange) {
      return "Hi, I saw your CashMorph exchange request. Can we arrange the exchange now?";
    }
    return `Hi ${exchange.name}, I saw your CashMorph request (${formatType(exchange.type)} ${formatAmount(
      exchange.amount
    )}). Can we arrange now?`;
  }

  function openWhatsAppChat(rawPhone, messageText) {
    const normalizedPhone = normalizePhoneForWhatsApp(rawPhone);
    if (!normalizedPhone) {
      window.alert("Valid WhatsApp phone number not available for this user.");
      return false;
    }

    const encodedText = encodeURIComponent(String(messageText || "").trim());
    const whatsappUrl = `https://wa.me/${normalizedPhone}${encodedText ? `?text=${encodedText}` : ""}`;
    const smsUrl = `sms:${normalizedPhone}${encodedText ? `?body=${encodedText}` : ""}`;

    // Open both channels from a single click: WhatsApp + SMS app.
    const whatsappPopup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    const smsPopup = window.open(smsUrl, "_blank", "noopener,noreferrer");
    if (whatsappPopup || smsPopup) {
      return true;
    }

    // Keep user on the exchange board if browser blocks external popups.
    window.alert("Unable to open WhatsApp/SMS in a new tab. Please allow popups for this site.");
    return false;
  }

  function getExchangeOwnerId(exchange) {
    if (!exchange || !exchange.userId) {
      return "";
    }
    return typeof exchange.userId === "string" ? exchange.userId : exchange.userId._id;
  }

  function getCounterpartyId(exchange) {
    if (!exchange || !exchange.counterpartyId) {
      return "";
    }
    return typeof exchange.counterpartyId === "string" ? exchange.counterpartyId : exchange.counterpartyId._id;
  }

  // BEGINNER NOTE: createCard builds one exchange card UI from API data.
  function createCard(exchange, currentUserId) {
    const card = document.createElement("article");
    card.className = "exchange-card";

    const ownerId = getExchangeOwnerId(exchange);
    const counterpartyId = getCounterpartyId(exchange);
    const hasCounterparty = Boolean(counterpartyId);
    const isOwner = Boolean(currentUserId && ownerId === currentUserId);
    const isCounterparty = Boolean(currentUserId && counterpartyId === currentUserId);
    const isParticipant = isOwner || isCounterparty;
    const contactPhone = resolveExchangeContactPhone(exchange);

    let actionHtml = "";

    if (exchange.status === "open") {
      actionHtml = `<button class="mini-btn contact-btn" data-action="contact" data-id="${escapeHtml(exchange._id)}" data-phone="${escapeHtml(contactPhone)}" data-owner="${isOwner ? "true" : "false"}">
        <span class="mini-icon">☎</span>
        Contact
      </button>`;
    }

    if (exchange.status === "in-progress" && isParticipant && hasCounterparty) {
      actionHtml = `<button class="mini-btn verify-btn" data-action="verify" data-id="${escapeHtml(exchange._id)}">
        <span class="mini-icon">◉</span>
        Verify
      </button>`;
    }

    if (exchange.status === "verified" && isParticipant && hasCounterparty) {
      actionHtml = `<button class="mini-btn verify-btn" data-action="complete" data-id="${escapeHtml(exchange._id)}">
        <span class="mini-icon">✓</span>
        Complete
      </button>`;
    }

    const canDelete = isOwner && ["pending", "open", "rejected", "expired"].includes(exchange.status);
    if (canDelete) {
      actionHtml += `<button class="mini-btn delete-btn" data-action="delete" data-id="${escapeHtml(exchange._id)}">Delete</button>`;
    }

    const statusInfo = getStatusInfo(exchange.status);
    const expiresAt = exchange.expiresAt ? new Date(exchange.expiresAt).getTime() : new Date(exchange.createdAt).getTime() + 10 * 60 * 1000;
    const expiryHtml =
      exchange.status === "open"
        ? `<p class="exchange-time exchange-expiry" data-expiry-ts="${expiresAt}">Expires in: --:--</p>`
        : "";

    card.innerHTML = `
      <div class="exchange-top">
        <div>
          <h3 class="exchange-name">${escapeHtml(exchange.name)}</h3>
          <p class="exchange-room">Room ${escapeHtml(exchange.roomNumber)}</p>
        </div>
        <span class="status-badge status-${exchange.status}">
          <span class="badge-icon">${statusInfo.icon}</span>
          ${statusInfo.label}
        </span>
      </div>
      <div class="exchange-meta">
        <span class="type-pill">${formatType(exchange.type)}</span>
        <p class="exchange-amount">${formatAmount(exchange.amount)}</p>
      </div>
      <p class="exchange-time">${timeAgo(exchange.createdAt)}</p>
      ${expiryHtml}
      <div class="exchange-actions">${actionHtml}</div>
    `;

    return card;
  }

  function renderList(containerId, exchanges, currentUserId) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!exchanges.length) {
      const empty = document.createElement("div");
      empty.className = "empty-card";
      empty.textContent = "No requests here yet";
      container.appendChild(empty);
      return;
    }

    exchanges.forEach((exchange) => {
      container.appendChild(createCard(exchange, currentUserId));
    });
  }

  function amountMatches(amount, filterValue) {
    if (filterValue === "all") {
      return true;
    }
    if (filterValue === "0-5000") {
      return amount >= 0 && amount <= 5000;
    }
    if (filterValue === "5001-10000") {
      return amount >= 5001 && amount <= 10000;
    }
    if (filterValue === "10001+") {
      return amount >= 10001;
    }
    return true;
  }

  function getFilteredExchanges() {
    const searchValue = String(document.getElementById("searchInput")?.value || "")
      .trim()
      .toLowerCase();
    const typeFilter = document.getElementById("typeFilter")?.value || "all";
    const amountFilter = document.getElementById("amountFilter")?.value || "all";
    const blockFilter = document.getElementById("blockFilter")?.value || "all";

    return state.allExchanges.filter((exchange) => {
      const room = String(exchange.roomNumber || "").toLowerCase();
      const name = String(exchange.name || "").toLowerCase();
      const block = getBlockFromRoom(exchange.roomNumber);

      const matchesSearch = !searchValue || name.includes(searchValue) || room.includes(searchValue);
      const matchesType = typeFilter === "all" || exchange.type === typeFilter;
      const matchesAmount = amountMatches(Number(exchange.amount), amountFilter);
      const matchesBlock = blockFilter === "all" || block === blockFilter;

      return matchesSearch && matchesType && matchesAmount && matchesBlock;
    });
  }

  function renderBoard() {
    const auth = getAuth();
    const user = auth ? auth.getUser() : null;
    const currentUserId = user ? user.id : "";
    const filtered = getFilteredExchanges();

    const openExchanges = filtered.filter((item) => item.status === "open");
    const inProgressExchanges = filtered.filter((item) => item.status === "in-progress" || item.status === "verified");
    const completedExchanges = filtered.filter((item) => item.status === "completed" || item.status === "expired");

    renderList("openList", openExchanges, currentUserId);
    renderList("inProgressList", inProgressExchanges, currentUserId);
    renderList("completedList", completedExchanges, currentUserId);

    const openCountText = document.getElementById("openCountText");
    if (openCountText) {
      openCountText.textContent = `${openExchanges.length} open requests nearby`;
    }

    updateExpiryCountdowns();
  }

  function updateExpiryCountdowns() {
    const now = Date.now();
    let hasExpiredVisibleCard = false;
    const nodes = document.querySelectorAll("[data-expiry-ts]");
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const expiresAt = Number(node.dataset.expiryTs || 0);
      const remaining = expiresAt - now;
      node.textContent = `Expires in: ${formatCountdown(remaining)}`;
      if (remaining <= 0) {
        hasExpiredVisibleCard = true;
      }
    });

    if (hasExpiredVisibleCard && now - state.lastExpiryRefreshAt > 2000) {
      state.lastExpiryRefreshAt = now;
      fetchExchanges();
    }
  }

  async function fetchExchanges() {
    const auth = getAuth();
    if (!auth || state.isFetching) {
      return;
    }

    state.isFetching = true;
    try {
      const response = await fetch(`${auth.API_BASE}/exchange`, {
        method: "GET",
        headers: auth.authHeaders(),
      });

      if (response.status === 401 || response.status === 403) {
        auth.clearSession();
        window.location.href = "login.html";
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to fetch exchanges");
      }

      state.allExchanges = Array.isArray(data) ? data : [];
      renderBoard();
    } catch (error) {
      console.error(error.message);
    } finally {
      state.isFetching = false;
    }
  }

  // BEGINNER NOTE: sends a status transition request to backend (open -> in-progress -> verified -> completed).
  async function updateExchangeStatus(exchangeId, status) {
    const auth = getAuth();
    if (!auth) {
      return null;
    }

    const response = await fetch(`${auth.API_BASE}/exchange/${exchangeId}/status`, {
      method: "PATCH",
      headers: auth.authHeaders(),
      body: JSON.stringify({ status }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Unable to update status");
    }

    await Promise.all([fetchExchanges(), fetchUnreadNotificationCount()]);
    return {
      message: data.message || "",
      pendingOtherConfirmation: Boolean(data.pendingOtherConfirmation),
      exchange: data.exchange || (data && data._id ? data : null),
    };
  }

  async function deleteExchange(exchangeId) {
    const auth = getAuth();
    if (!auth) {
      return;
    }

    const response = await fetch(`${auth.API_BASE}/exchange/${exchangeId}`, {
      method: "DELETE",
      headers: auth.authHeaders(),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Unable to delete exchange");
    }

    await Promise.all([fetchExchanges(), fetchUnreadNotificationCount()]);
  }

  async function submitRating(exchangeId, ratingValue) {
    const auth = getAuth();
    if (!auth) {
      return;
    }

    const response = await fetch(`${auth.API_BASE}/exchange/${exchangeId}/rating`, {
      method: "POST",
      headers: auth.authHeaders(),
      body: JSON.stringify({ rating: ratingValue }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Unable to submit rating");
    }
  }

  function promptForRating(exchange) {
    // Keep showing the rating prompt until user enters a valid value or cancels.
    while (true) {
      const raw = window.prompt("Rate this exchange from 1 to 5:");
      if (raw === null) {
        return;
      }

      const numeric = Number(raw);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
        window.alert("Please enter a whole number from 1 to 5.");
        continue;
      }

      submitRating(exchange._id, numeric).catch((error) => {
        window.alert(error.message);
      });
      return;
    }
  }

  function wireFilters() {
    const controlIds = ["searchInput", "typeFilter", "amountFilter", "blockFilter"];

    controlIds.forEach((id) => {
      const control = document.getElementById(id);
      if (control) {
        control.addEventListener("input", renderBoard);
        control.addEventListener("change", renderBoard);
      }
    });
  }

  function toggleModal(show) {
    const modal = document.getElementById("newExchangeModal");
    if (!modal) {
      return;
    }

    modal.classList.toggle("hidden", !show);
  }

  function prefillExchangeForm() {
    const auth = getAuth();
    const user = auth ? auth.getUser() : null;
    if (!user) {
      return;
    }

    const nameInput = document.getElementById("exchangeName");
    const roomInput = document.getElementById("exchangeRoom");
    const phoneInput = document.getElementById("exchangePhone");

    if (nameInput) {
      nameInput.value = user.name || "";
    }
    if (roomInput) {
      roomInput.value = user.roomNumber || "";
    }
    if (phoneInput) {
      phoneInput.value = user.phone || "";
    }
  }

  function setExchangeFormMessage(text, success) {
    const message = document.getElementById("exchangeFormMessage");
    if (!message) {
      return;
    }

    message.textContent = text;
    message.classList.toggle("success", Boolean(success));
  }

  async function submitNewExchange(event) {
    event.preventDefault();

    const auth = getAuth();
    if (!auth) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      roomNumber: String(formData.get("roomNumber") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      type: String(formData.get("type") || ""),
      amount: Number(formData.get("amount")),
    };

    if (!payload.name || !payload.roomNumber || !payload.phone || !payload.type || !payload.amount) {
      setExchangeFormMessage("Please fill all required fields.", false);
      return;
    }

    if (!Number.isFinite(payload.amount) || payload.amount < 1 || payload.amount > 1000) {
      setExchangeFormMessage("Amount must be between 1 and 1000.", false);
      return;
    }

    try {
      setExchangeFormMessage("Posting request...", true);
      const response = await fetch(`${auth.API_BASE}/exchange`, {
        method: "POST",
        headers: auth.authHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setExchangeFormMessage(data.message || "Unable to post exchange.", false);
        return;
      }

      form.reset();
      prefillExchangeForm();
      setExchangeFormMessage("Request submitted and awaiting admin approval.", true);

      if (data.possibleMatch) {
        const match = data.possibleMatch;
        const connectNow = window.confirm(
          `Possible match found with user ${match.name} in room ${match.roomNumber}. Contact now?`
        );
        if (connectNow) {
          openWhatsAppChat(
            match.phone,
            `Hi ${match.name}, I found your CashMorph request (${formatType(match.type)} ${formatAmount(
              match.amount
            )}). Can we arrange this exchange now?`
          );
        }
      }

      await Promise.all([fetchExchanges(), fetchUnreadNotificationCount()]);
      setTimeout(() => {
        toggleModal(false);
        setExchangeFormMessage("", false);
      }, 400);
    } catch (_error) {
      setExchangeFormMessage("Unable to connect to server.", false);
    }
  }

  function applyNotificationCount(unreadCount) {
    const targets = document.querySelectorAll("#notificationCount, [data-notification-count]");
    targets.forEach((target) => {
      if (!(target instanceof HTMLElement)) {
        return;
      }
      target.textContent = String(unreadCount);
      target.classList.toggle("hidden", unreadCount <= 0);
    });
  }

  function renderNotifications(notifications) {
    const list = document.getElementById("notificationList");
    if (!list) {
      return;
    }

    list.innerHTML = "";
    if (!Array.isArray(notifications) || notifications.length === 0) {
      const empty = document.createElement("p");
      empty.className = "notification-empty";
      empty.textContent = "No notifications yet";
      list.appendChild(empty);
      return;
    }

    notifications.forEach((item) => {
      const block = document.createElement("div");
      block.className = `notification-item ${item.isRead ? "" : "unread"}`.trim();
      block.innerHTML = `
        <p class="notification-title">${escapeHtml(item.title)}</p>
        <p class="notification-message">${escapeHtml(item.message)}</p>
        <p class="notification-age">${escapeHtml(timeAgo(item.createdAt))}</p>
      `;
      list.appendChild(block);
    });
  }

  async function fetchNotifications() {
    const auth = getAuth();
    if (!auth) {
      return;
    }

    try {
      const response = await fetch(`${auth.API_BASE}/notifications?limit=20`, {
        method: "GET",
        headers: auth.authHeaders(),
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      renderNotifications(Array.isArray(data) ? data : []);
    } catch (_error) {
      // no-op
    }
  }

  async function markAllNotificationsRead() {
    const auth = getAuth();
    if (!auth) {
      return;
    }

    try {
      const response = await fetch(`${auth.API_BASE}/notifications/read-all`, {
        method: "PATCH",
        headers: auth.authHeaders(),
      });
      if (!response.ok) {
        return;
      }
    } catch (_error) {
      // no-op
      return;
    }

    applyNotificationCount(0);
    await fetchNotifications();
  }

  function setNotificationsOpen(open) {
    state.notificationsOpen = open;
    const panel = document.getElementById("notificationPanel");
    if (!panel) {
      return;
    }

    panel.classList.toggle("hidden", !open);
  }

  function wireNotifications() {
    const bell = document.getElementById("notificationBell");
    const panel = document.getElementById("notificationPanel");
    const markRead = document.getElementById("markNotificationsReadBtn");

    if (!bell || !panel) {
      return;
    }

    bell.addEventListener("click", async (event) => {
      event.stopPropagation();
      const opening = !state.notificationsOpen;
      setNotificationsOpen(opening);
      if (opening) {
        await fetchNotifications();
      }
    });

    if (markRead) {
      markRead.addEventListener("click", async (event) => {
        event.stopPropagation();
        await markAllNotificationsRead();
      });
    }

    panel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", () => {
      if (state.notificationsOpen) {
        setNotificationsOpen(false);
      }
    });
  }

  async function fetchUnreadNotificationCount() {
    const auth = getAuth();
    if (!auth) {
      return;
    }

    try {
      const response = await fetch(`${auth.API_BASE}/notifications/unread-count`, {
        method: "GET",
        headers: auth.authHeaders(),
      });
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      applyNotificationCount(Number(data.unreadCount) || 0);
    } catch (_error) {
      // no-op
    }
  }

  // BEGINNER NOTE: central click handlers for modal buttons and exchange card actions.
  function wireDashboardActions() {
    const openModalButton = document.getElementById("openNewExchangeBtn");
    const closeModalButton = document.getElementById("closeModalBtn");
    const modal = document.getElementById("newExchangeModal");
    const form = document.getElementById("newExchangeForm");

    if (openModalButton) {
      openModalButton.addEventListener("click", () => {
        prefillExchangeForm();
        toggleModal(true);
      });
    }

    if (closeModalButton) {
      closeModalButton.addEventListener("click", () => {
        toggleModal(false);
        setExchangeFormMessage("", false);
      });
    }

    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          toggleModal(false);
          setExchangeFormMessage("", false);
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        toggleModal(false);
        setNotificationsOpen(false);
      }
    });

    if (form) {
      form.addEventListener("submit", submitNewExchange);
    }

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const actionElement = target.closest("[data-action]");
      if (!(actionElement instanceof HTMLElement)) {
        return;
      }

      const action = actionElement.dataset.action;
      const id = actionElement.dataset.id;
      if (!action || !id) {
        return;
      }

      try {
        if (action === "contact") {
          const isOwner = actionElement.dataset.owner === "true";
          if (isOwner) {
            window.alert("You cannot contact your own exchange.");
            return;
          }

          const exchange = state.allExchanges.find((entry) => String(entry._id) === String(id));
          const phone = actionElement.dataset.phone || resolveExchangeContactPhone(exchange);
          if (!normalizePhoneForWhatsApp(phone)) {
            window.alert("Valid WhatsApp phone number not available for this user.");
            return;
          }

          const result = await updateExchangeStatus(id, "in-progress");
          if (result.message) {
            // Show backend conflict/wait messages when needed.
            if (result.pendingOtherConfirmation) {
              window.alert(result.message);
            }
          }
          openWhatsAppChat(phone, buildExchangeContactMessage(exchange));
          return;
        }

        if (action === "verify") {
          const result = await updateExchangeStatus(id, "verified");
          if (result.message) {
            window.alert(result.message);
          }
          return;
        }

        if (action === "complete") {
          const result = await updateExchangeStatus(id, "completed");
          if (result.message) {
            window.alert(result.message);
          }
          if (result.exchange && result.exchange.status === "completed") {
            promptForRating(result.exchange);
          }
          return;
        }

        if (action === "delete") {
          await deleteExchange(id);
        }
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  function startPolling() {
    if (state.pollHandle) {
      clearInterval(state.pollHandle);
    }
    if (state.countdownHandle) {
      clearInterval(state.countdownHandle);
    }

    state.pollHandle = setInterval(() => {
      fetchExchanges();
      fetchUnreadNotificationCount();
    }, REFRESH_INTERVAL_MS);

    state.countdownHandle = setInterval(updateExpiryCountdowns, 1000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setYear();
    wireFilters();
    wireDashboardActions();
    wireNotifications();
    fetchExchanges();
    fetchUnreadNotificationCount();
    startPolling();
  });
})();

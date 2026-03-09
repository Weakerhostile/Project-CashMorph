/**
 * BEGINNER GUIDE: Admin dashboard logic for CashMorph.
 * Handles stats loading, exchange/user management, and admin actions.
 */
(function () {
  const EXCHANGE_STATUSES = ["pending", "open", "in-progress", "verified", "completed", "expired", "rejected"];

  const state = {
    currentFilter: "all",
    exchanges: [],
    users: [],
    exchangeTypeChart: null,
    hasAnimatedExchangeTypeChart: false,
    calendarTimer: null,
    calendarRenderKey: "",
  };

  function getAuth() {
    return window.CashMorphAuth;
  }

  function redirectIfUnauthorized() {
    const auth = getAuth();
    if (auth) {
      auth.clearSession();
    }
    window.location.href = "login.html";
  }

  async function request(path, options) {
    const auth = getAuth();
    if (!auth) {
      throw new Error("Auth unavailable");
    }

    const response = await fetch(`${auth.API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options && options.headers ? options.headers : {}),
        ...auth.authHeaders(),
      },
    });

    if (response.status === 401 || response.status === 403) {
      redirectIfUnauthorized();
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  function formatAmount(amount) {
    return `₹${Number(amount || 0).toLocaleString()}`;
  }

  function formatType(type) {
    return type === "cash-to-digital" ? "Cash -> Digital" : "Digital -> Cash";
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    return new Date(value).toLocaleDateString("en-US");
  }

  function remainingExpiryMinutes(expiresAt) {
    if (!expiresAt) {
      return 10;
    }

    const msLeft = new Date(expiresAt).getTime() - Date.now();
    if (msLeft <= 0) {
      return 1;
    }

    return Math.max(1, Math.ceil(msLeft / 60000));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function rolePillClass(role) {
    if (role === "admin") {
      return "role-pill admin";
    }
    if (role === "moderator") {
      return "role-pill moderator";
    }
    return "role-pill user";
  }

  function buildCalendarGrid(now) {
    const grid = document.getElementById("adminCalendarGrid");
    if (!grid) {
      return;
    }

    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const key = `${year}-${month + 1}-${today}`;
    if (state.calendarRenderKey === key) {
      return;
    }

    state.calendarRenderKey = key;
    grid.innerHTML = "";

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    for (let index = 0; index < 42; index += 1) {
      const cell = document.createElement("span");
      cell.className = "admin-calendar-cell";

      if (index < firstWeekday) {
        cell.classList.add("other-month");
        cell.textContent = String(prevMonthDays - firstWeekday + index + 1);
      } else if (index < firstWeekday + daysInMonth) {
        const dayOfMonth = index - firstWeekday + 1;
        cell.textContent = String(dayOfMonth);
        if (dayOfMonth === today) {
          cell.classList.add("today");
        }
      } else {
        cell.classList.add("other-month");
        cell.textContent = String(index - (firstWeekday + daysInMonth) + 1);
      }

      grid.appendChild(cell);
    }
  }

  function renderRealtimeCalendar() {
    const dayNameEl = document.getElementById("adminCalendarDayName");
    const dateEl = document.getElementById("adminCalendarDate");
    const timeEl = document.getElementById("adminCalendarTime");
    const monthEl = document.getElementById("adminCalendarMonthLabel");
    if (!dayNameEl || !dateEl || !timeEl || !monthEl) {
      return;
    }

    const now = new Date();
    dayNameEl.textContent = now.toLocaleDateString("en-US", { weekday: "long" });
    dateEl.textContent = now.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    timeEl.textContent = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    monthEl.textContent = now.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    buildCalendarGrid(now);
  }

  function startRealtimeCalendar() {
    if (state.calendarTimer) {
      clearInterval(state.calendarTimer);
    }
    renderRealtimeCalendar();
    state.calendarTimer = setInterval(renderRealtimeCalendar, 1000);
  }

  function renderSummary(summary) {
    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    };

    setValue("summaryTotalUsers", summary.totalUsers || 0);
    setValue("summaryTotalExchanges", summary.totalExchanges || 0);
    setValue("summaryOpenExchanges", summary.openExchanges || 0);
    setValue("summaryCompletedExchanges", summary.completedExchanges || 0);
    setValue("summaryRejectedExchanges", summary.rejectedExchanges || 0);
  }

  function renderExchangeTypeChart(distribution) {
    const canvas = document.getElementById("exchangeTypePieChart");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (typeof Chart === "undefined") {
      return;
    }

    const cashToDigitalCount = Number(distribution.cashToDigitalCount || 0);
    const digitalToCashCount = Number(distribution.digitalToCashCount || 0);
    const chartData = [cashToDigitalCount, digitalToCashCount];

    if (state.exchangeTypeChart) {
      state.exchangeTypeChart.data.datasets[0].data = chartData;
      state.exchangeTypeChart.update("none");
      return;
    }

    if (!state.hasAnimatedExchangeTypeChart) {
      canvas.classList.add("admin-chart-spin");
      state.hasAnimatedExchangeTypeChart = true;
    }

    state.exchangeTypeChart = new Chart(canvas, {
      type: "pie",
      data: {
        labels: ["Cash → Digital", "Digital → Cash"],
        datasets: [
          {
            data: chartData,
            backgroundColor: ["#28d489", "#f3bf31"],
            borderColor: ["rgba(40, 212, 137, 0.95)", "rgba(243, 191, 49, 0.95)"],
            borderWidth: 1,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1300,
          easing: "easeOutCubic",
          animateRotate: true,
          animateScale: false,
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#dbe8e2",
              font: {
                family: "Manrope",
                size: 12,
                weight: "700",
              },
              padding: 16,
              boxWidth: 12,
              boxHeight: 12,
            },
          },
          title: {
            display: false,
            text: "Exchange Type Distribution",
          },
          tooltip: {
            callbacks: {
              label(context) {
                const label = context.label || "";
                const value = Number(context.raw || 0);
                return `${label}: ${value}`;
              },
            },
          },
        },
      },
    });
  }

  function renderExchanges() {
    const listEl = document.getElementById("adminExchangeList");
    const emptyEl = document.getElementById("adminExchangeEmpty");

    listEl.innerHTML = "";
    if (!state.exchanges.length) {
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");

    state.exchanges.forEach((exchange) => {
      const item = document.createElement("article");
      item.className = "admin-exchange-item";
      const expiryMinutes = exchange.status === "open" ? remainingExpiryMinutes(exchange.expiresAt) : "";
      const expiryNote =
        exchange.status === "open"
          ? ` • Expires in ~${expiryMinutes} min`
          : "";

      const options = EXCHANGE_STATUSES.map((status) => {
        const selected = status === exchange.status ? "selected" : "";
        return `<option value="${status}" ${selected}>${status}</option>`;
      }).join("");

      item.innerHTML = `
        <div class="admin-exchange-meta">
          <h3>${escapeHtml(exchange.name)} <span>${escapeHtml(exchange.roomNumber)}</span></h3>
          <p>${escapeHtml(formatType(exchange.type))} • ${formatAmount(exchange.amount)} • ${escapeHtml(exchange.phone)}${escapeHtml(expiryNote)}</p>
        </div>
        <div class="admin-exchange-actions">
          <select id="exchangeStatus-${exchange._id}">
            ${options}
          </select>
          <input id="exchangeExpiry-${exchange._id}" type="number" min="1" max="1440" step="1" placeholder="Expiry min" value="${expiryMinutes}" ${exchange.status === "open" ? "" : "disabled"} />
          <button class="status-chip" data-action="save-exchange-status" data-id="${exchange._id}">Save</button>
          <button class="status-chip" data-action="delete-exchange" data-id="${exchange._id}">Delete</button>
        </div>
      `;

      listEl.appendChild(item);
    });
  }

  function renderUsers() {
    const tbody = document.getElementById("adminUsersTableBody");
    const emptyEl = document.getElementById("adminUsersEmpty");
    const auth = getAuth();
    const me = auth ? auth.getUser() : null;

    tbody.innerHTML = "";
    if (!state.users.length) {
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");

    state.users.forEach((user) => {
      const tr = document.createElement("tr");
      const suspendedTag = user.isSuspended ? " (suspended)" : "";

      let actionControls = "";
      if (!me || String(me.id) !== String(user._id)) {
        if (user.role === "user") {
          actionControls += `<button class="table-action warn" data-action="change-role" data-id="${user._id}" data-role="moderator" title="Make moderator">🛡</button>`;
          actionControls += `<button class="table-action warn" data-action="change-role" data-id="${user._id}" data-role="admin" title="Make admin">⭐</button>`;
        } else if (user.role === "moderator") {
          actionControls += `<button class="table-action" data-action="change-role" data-id="${user._id}" data-role="user" title="Set as user">🚫</button>`;
          actionControls += `<button class="table-action warn" data-action="change-role" data-id="${user._id}" data-role="admin" title="Make admin">⭐</button>`;
        } else if (user.role === "admin") {
          actionControls += `<button class="table-action" data-action="change-role" data-id="${user._id}" data-role="moderator" title="Set as moderator">🛡</button>`;
        }

        if (user.role !== "admin") {
          actionControls += `<button class="table-action" data-action="toggle-suspension" data-id="${user._id}" data-suspended="${user.isSuspended ? "true" : "false"}" title="${user.isSuspended ? "Unsuspend user" : "Suspend user"}">${user.isSuspended ? "✅" : "⛔"}</button>`;
          actionControls += `<button class="table-action danger" data-action="delete-user" data-id="${user._id}" title="Delete user">🗑</button>`;
        }
      }

      tr.innerHTML = `
        <td>${escapeHtml(user.name)}${escapeHtml(suspendedTag)}</td>
        <td>${escapeHtml(user.roomNumber)}</td>
        <td>${escapeHtml(user.block)}</td>
        <td>${escapeHtml(user.phone)}</td>
        <td><span class="${rolePillClass(user.role)}">${escapeHtml(user.role)}</span></td>
        <td>${formatDate(user.createdAt)}</td>
        <td class="actions-cell">${actionControls}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  async function fetchSummary() {
    const summary = await request("/admin/summary", { method: "GET" });
    if (summary) {
      renderSummary(summary);
    }
  }

  async function fetchExchanges() {
    const exchanges = await request(`/admin/exchanges?status=${encodeURIComponent(state.currentFilter)}`, { method: "GET" });
    if (Array.isArray(exchanges)) {
      state.exchanges = exchanges;
      renderExchanges();
    }
  }

  async function fetchUsers() {
    const users = await request("/admin/users", { method: "GET" });
    if (Array.isArray(users)) {
      state.users = users;
      renderUsers();
    }
  }

  async function fetchExchangeTypeDistribution() {
    const distribution = await request("/admin/exchange-type-distribution", { method: "GET" });
    if (distribution) {
      renderExchangeTypeChart(distribution);
    }
  }

  async function changeExchangeStatus(id) {
    const statusControl = document.getElementById(`exchangeStatus-${id}`);
    if (!statusControl) {
      return;
    }

    const expiryControl = document.getElementById(`exchangeExpiry-${id}`);
    const payload = { status: statusControl.value };
    if (statusControl.value === "open" && expiryControl) {
      const parsed = Number(expiryControl.value);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440) {
        payload.expiresInMinutes = parsed;
      }
    }

    await request(`/admin/exchanges/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    await fetchExchanges();
  }

  async function deleteExchange(id) {
    await request(`/admin/exchanges/${id}`, { method: "DELETE" });
    await Promise.all([fetchSummary(), fetchExchanges()]);
  }

  async function changeUserRole(id, role) {
    await request(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });

    await Promise.all([fetchSummary(), fetchUsers()]);
  }

  async function toggleUserSuspension(id, suspended) {
    await request(`/admin/users/${id}/suspension`, {
      method: "PATCH",
      body: JSON.stringify({ suspended }),
    });

    await Promise.all([fetchSummary(), fetchUsers()]);
  }

  async function deleteUser(id) {
    await request(`/admin/users/${id}`, { method: "DELETE" });
    await Promise.all([fetchSummary(), fetchUsers()]);
  }

  function setActiveTab(showUsers) {
    const exchangesPanel = document.getElementById("exchangesPanel");
    const usersPanel = document.getElementById("usersPanel");
    const tabExchanges = document.getElementById("tabExchanges");
    const tabUsers = document.getElementById("tabUsers");

    exchangesPanel.classList.toggle("hidden", showUsers);
    usersPanel.classList.toggle("hidden", !showUsers);
    tabExchanges.classList.toggle("active", !showUsers);
    tabUsers.classList.toggle("active", showUsers);
  }

  function updateFilterChipUI() {
    const chips = document.querySelectorAll("[data-exchange-filter]");
    chips.forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.exchangeFilter === state.currentFilter);
    });
  }

  function wireActions() {
    const backButton = document.getElementById("adminBackBtn");
    const tabExchanges = document.getElementById("tabExchanges");
    const tabUsers = document.getElementById("tabUsers");

    if (backButton) {
      backButton.addEventListener("click", () => {
        window.location.href = "dashboard.html";
      });
    }

    tabExchanges.addEventListener("click", () => setActiveTab(false));
    tabUsers.addEventListener("click", () => setActiveTab(true));

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }

      if (!target.id.startsWith("exchangeStatus-")) {
        return;
      }

      const exchangeId = target.id.replace("exchangeStatus-", "");
      const expiryControl = document.getElementById(`exchangeExpiry-${exchangeId}`);
      if (!(expiryControl instanceof HTMLInputElement)) {
        return;
      }

      if (target.value === "open") {
        expiryControl.disabled = false;
        if (!expiryControl.value) {
          expiryControl.value = "10";
        }
      } else {
        expiryControl.disabled = true;
      }
    });

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const filterButton = target.closest("[data-exchange-filter]");
      if (filterButton instanceof HTMLElement) {
        state.currentFilter = filterButton.dataset.exchangeFilter || "all";
        updateFilterChipUI();
        await fetchExchanges();
        return;
      }

      const actionButton = target.closest("[data-action]");
      if (!(actionButton instanceof HTMLElement)) {
        return;
      }

      const action = actionButton.dataset.action;
      const id = actionButton.dataset.id;

      if (!action || !id) {
        return;
      }

      if (action === "save-exchange-status") {
        await changeExchangeStatus(id);
      }

      if (action === "delete-exchange") {
        await deleteExchange(id);
      }

      if (action === "change-role") {
        const role = actionButton.dataset.role || "user";
        await changeUserRole(id, role);
      }

      if (action === "toggle-suspension") {
        const currentlySuspended = actionButton.dataset.suspended === "true";
        await toggleUserSuspension(id, !currentlySuspended);
      }

      if (action === "delete-user") {
        await deleteUser(id);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const auth = getAuth();
    if (!auth) {
      return;
    }

    const syncedUser = await auth.syncCurrentUser();
    const user = syncedUser || auth.getUser();
    if (!user || user.role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }

    wireActions();
    setActiveTab(false);
    updateFilterChipUI();
    startRealtimeCalendar();
    await Promise.all([fetchSummary(), fetchExchangeTypeDistribution(), fetchExchanges(), fetchUsers()]);
  });
})();

/**
 * BEGINNER GUIDE: Landing page login modal behavior.
 * Controls open/close actions and login-related interactions.
 */
document.addEventListener("DOMContentLoaded", function () {
  var startBtn = document.getElementById("startExchanging");
  var backdrop = document.getElementById("loginModalBackdrop");
  var closeBtn = document.getElementById("closeLoginModal");

  if (!startBtn || !backdrop || !closeBtn) {
    return;
  }

  function isAuthenticated() {
    return Boolean(
      window.CashMorphAuth &&
        typeof window.CashMorphAuth.isAuthenticated === "function" &&
        window.CashMorphAuth.isAuthenticated()
    );
  }

  function openModal() {
    backdrop.classList.toggle("is-open", true);
    backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.toggle("modal-open", true);
  }

  function closeModal() {
    backdrop.classList.toggle("is-open", false);
    backdrop.setAttribute("aria-hidden", "true");
    document.body.classList.toggle("modal-open", false);
  }

  startBtn.addEventListener(
    "click",
    function (event) {
      if (isAuthenticated()) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      openModal();
    },
    true
  );

  closeBtn.addEventListener("click", closeModal);

  backdrop.addEventListener("click", function (event) {
    if (event.target === backdrop) {
      closeModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && backdrop.classList.contains("is-open")) {
      closeModal();
    }
  });
});

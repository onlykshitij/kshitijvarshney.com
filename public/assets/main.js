// Footer year, link-preview mode, and the service status check.
// /api/status (functions/api/status.js) reports whether each service's Cloudflare tunnel is up.
// A down service's card dims and reads "Down for maintenance"; when every service is down the
// section shows one maintenance line instead. If the check fails, the cards stay as they are.
// Add ?down to the URL to preview everything down, or ?down=trackhost,media for some of them.
(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  if (params.has("og")) document.documentElement.classList.add("og");

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  const section = document.querySelector("[data-services]");
  if (!section) return;
  const cards = Array.from(section.querySelectorAll("[data-service]"));

  function apply(services) {
    let down = 0;
    for (const card of cards) {
      const isDown = services[card.dataset.service] === "down";
      const desc = card.querySelector("[data-desc]");
      card.toggleAttribute("data-down", isDown);
      desc.textContent = isDown ? "Down for maintenance" : desc.dataset.desc;
      if (isDown) down++;
    }
    section.toggleAttribute("data-all-down", down === cards.length);
  }

  if (params.has("down")) {
    const names = params.get("down") || cards.map((c) => c.dataset.service).join(",");
    const services = {};
    for (const name of names.split(",")) services[name.trim()] = "down";
    apply(services);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  fetch("/api/status", { signal: controller.signal, headers: { accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => { if (data && data.services) apply(data.services); })
    .catch(() => {})
    .finally(() => clearTimeout(timer));
})();

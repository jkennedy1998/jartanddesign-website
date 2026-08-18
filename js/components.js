// Shared header + footer, one source of truth.
const NAV = [
  ["index.html", "Home"],
  ["illustration.html", "Illustration"],
  ["design.html", "Design"],
  ["development.html", "Development"],
  ["sketchbook.html", "Sketchbook"],
  ["contact.html", "Contact"],
];

function currentPage() {
  const p = location.pathname.split("/").pop() || "index.html";
  return p;
}

function renderHeader() {
  const el = document.querySelector("header.site");
  if (!el) return;
  const cur = currentPage();
  el.innerHTML =
    '<div class="tg-shell">' +
    '<a class="logo" href="index.html">JART &amp; DESIGN</a>' +
    "<nav>" +
    NAV.map(([href, label]) =>
      `<a href="${href}"${href === cur ? ' class="active"' : ""}>${label}</a>`
    ).join("") +
    "</nav>" +
    "</div>";
}

function renderFooter() {
  const el = document.querySelector("footer.site");
  if (!el) return;
  el.innerHTML = `<div class="tg-shell">&copy; ${new Date().getFullYear()} Jart &amp; Design</div>`;
}

// Hover video backgrounds for home buttons.
// Each .home-btn[data-video] gets a full-screen, non-interactive video that
// plays while hovered and pauses (reset to start) when the cursor leaves.
function initHomeVideoBackgrounds() {
  const buttons = document.querySelectorAll(".home-btn[data-video]");
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    const video = document.createElement("video");
    video.src = btn.dataset.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.className = "home-bg-video";
    document.body.appendChild(video);
    btn.addEventListener("mouseenter", () => {
      video.classList.add("is-playing");
      video.play().catch(() => {});
    });
    btn.addEventListener("mouseleave", () => {
      video.classList.remove("is-playing");
      video.pause();
      video.currentTime = 0;
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderFooter();
  initHomeVideoBackgrounds();
});

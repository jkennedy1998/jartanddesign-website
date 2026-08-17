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

// Measure the real ThaumMono glyph width at base size so ch-based
// grid math (--tg-ch) matches what is actually rendered.
function measureTypeGrid() {
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;font-size:1rem;";
  probe.textContent = "0000000000";
  document.body.appendChild(probe);
  const ch = probe.getBoundingClientRect().width / 10;
  probe.remove();
  document.documentElement.style.setProperty("--tg-ch", ch + "px");
}

document.addEventListener("DOMContentLoaded", () => {
  measureTypeGrid();
  renderHeader();
  renderFooter();
});

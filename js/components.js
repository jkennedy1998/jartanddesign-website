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
    '<a class="logo" href="index.html">JART &amp; DESIGN</a>' +
    "<nav>" +
    NAV.map(([href, label]) =>
      `<a href="${href}"${href === cur ? ' class="active"' : ""}>${label}</a>`
    ).join("") +
    "</nav>";
}

function renderFooter() {
  const el = document.querySelector("footer.site");
  if (!el) return;
  el.innerHTML = `&copy; ${new Date().getFullYear()} Jart &amp; Design`;
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderFooter();
});

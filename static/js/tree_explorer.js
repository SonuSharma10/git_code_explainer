(function () {
  // Mobile Nav Toggle
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }

  // Theme Switcher (Dark / Light)
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const savedTheme = localStorage.getItem("repex_theme");
  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("repex_theme", next);
    });
  }

  // File Tree Renderer
  window.renderTree = function renderTree(nodes, mount, filterText = "") {
    mount.innerHTML = "";
    const list = buildList(nodes || [], filterText.trim().toLowerCase());
    if (!list.hasChildNodes()) {
      mount.innerHTML = `<div class="mh-empty-tree">${filterText ? "No matching files." : "Empty repository tree."}</div>`;
    } else {
      mount.appendChild(list);
    }
  };

  function getFileIcon(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const icons = {
      py: "🐍",
      js: "🟨",
      ts: "🔷",
      jsx: "⚛️",
      tsx: "⚛️",
      html: "🌐",
      css: "🎨",
      json: "⚙️",
      md: "📝",
      sql: "🗄️",
      sh: "🐚",
      yml: "⚙️",
      yaml: "⚙️",
      txt: "📄",
    };
    return icons[ext] || "📄";
  }

  function buildList(nodes, filter) {
    const wrap = document.createElement("div");
    (nodes || []).forEach((node) => {
      const isDir = node.type === "tree" || (node.children && node.children.length);
      if (isDir) {
        const nestedList = buildList(node.children || [], filter);
        const hasMatchingChildren = nestedList.hasChildNodes();
        const matchesSelf = !filter || node.name.toLowerCase().includes(filter);

        if (!filter || hasMatchingChildren || matchesSelf) {
          const details = document.createElement("details");
          if (filter) details.open = true;
          const summary = document.createElement("summary");
          summary.textContent = `📁 ${node.name}/`;
          details.appendChild(summary);
          details.appendChild(nestedList);
          wrap.appendChild(details);
        }
      } else {
        const matches = !filter || node.name.toLowerCase().includes(filter) || node.path.toLowerCase().includes(filter);
        if (matches) {
          const btn = document.createElement("button");
          btn.type = "button";
          const icon = getFileIcon(node.name);
          btn.innerHTML = `<span>${icon}</span> <span>${node.name}</span>`;
          btn.dataset.filePath = node.path;
          btn.title = node.path;
          wrap.appendChild(btn);
        }
      }
    });
    return wrap;
  }
})();

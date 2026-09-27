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

  // 5 Best Complementary Color Palettes for Dark & Light modes
  const PALETTES = {
    dark: [
      { name: "Neo Orange", hex: "#f97316" },
      { name: "Electric Violet", hex: "#a855f7" },
      { name: "Cyber Cyan", hex: "#06b6d4" },
      { name: "Emerald Mint", hex: "#10b981" },
      { name: "Rose Pink", hex: "#f43f5e" }
    ],
    light: [
      { name: "Deep Amber", hex: "#ea580c" },
      { name: "Royal Indigo", hex: "#6366f1" },
      { name: "Teal Blue", hex: "#0d9488" },
      { name: "Forest Jade", hex: "#059669" },
      { name: "Crimson Ruby", hex: "#e11d48" }
    ]
  };

  const swatchButtons = document.querySelectorAll(".mh-swatch");
  let activeIndex = parseInt(localStorage.getItem("repex_swatch_idx") || "0", 10);
  if (isNaN(activeIndex) || activeIndex < 0 || activeIndex >= 5) activeIndex = 0;

  function getActiveTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function applyAccentColor(hex) {
    document.documentElement.style.setProperty("--color-accent", hex);
    // Darker shade for hover
    document.documentElement.style.setProperty("--color-accent-hover", adjustColorBrightness(hex, -20));
    // Translucent light shade for text highlights
    document.documentElement.style.setProperty("--color-accent-light", hexToRgba(hex, 0.18));
    const dot = document.getElementById("colorTriggerDot");
    if (dot) dot.style.backgroundColor = hex;
  }

  function renderSwatches(theme) {
    const colors = PALETTES[theme] || PALETTES.dark;
    swatchButtons.forEach((btn, idx) => {
      const col = colors[idx];
      if (col) {
        btn.style.backgroundColor = col.hex;
        btn.setAttribute("title", col.name);
        btn.setAttribute("data-color", col.hex);
        btn.classList.toggle("active", idx === activeIndex);
      }
    });
    // Apply current active color
    if (colors[activeIndex]) {
      applyAccentColor(colors[activeIndex].hex);
    }
  }

  function adjustColorBrightness(hex, percent) {
    let num = parseInt(hex.replace("#", ""), 16);
    let amt = Math.round(2.55 * percent);
    let R = (num >> 16) + amt;
    let G = (num >> 8 & 0x00FF) + amt;
    let B = (num & 0x0000FF) + amt;
    return "#" + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  // Initial render of swatches
  renderSwatches(getActiveTheme());

  const colorTriggerBtn = document.getElementById("colorTriggerBtn");
  const colorTriggerDot = document.getElementById("colorTriggerDot");
  const colorDropdown = document.getElementById("colorDropdown");

  // Toggle color dropdown popover
  colorTriggerBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!colorDropdown) return;
    const isHidden = colorDropdown.hasAttribute("hidden");
    if (isHidden) {
      colorDropdown.removeAttribute("hidden");
    } else {
      colorDropdown.setAttribute("hidden", "");
    }
  });

  // Close color dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (colorDropdown && !colorDropdown.contains(e.target) && !colorTriggerBtn?.contains(e.target)) {
      colorDropdown.setAttribute("hidden", "");
    }
  });

  // Handle swatch click
  swatchButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-swatch-idx"), 10);
      activeIndex = idx;
      localStorage.setItem("repex_swatch_idx", idx.toString());
      renderSwatches(getActiveTheme());
      // Close dropdown smoothly after selection
      setTimeout(() => {
        if (colorDropdown) colorDropdown.setAttribute("hidden", "");
      }, 150);
    });
  });

  // Re-render swatches when theme toggles
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      // Allow DOM attribute mutation from themeToggle listener to settle
      setTimeout(() => {
        renderSwatches(getActiveTheme());
      }, 10);
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
          btn.draggable = true;
          const icon = getFileIcon(node.name);
          btn.innerHTML = `<span>${icon}</span> <span>${node.name}</span>`;
          btn.dataset.filePath = node.path;
          btn.title = `Click to view or Drag to Chat: ${node.path}`;
          btn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", node.path);
            e.dataTransfer.setData("application/repex-file", node.path);
            e.dataTransfer.effectAllowed = "copy";
          });
          wrap.appendChild(btn);
        }
      }
    });
    return wrap;
  }
})();

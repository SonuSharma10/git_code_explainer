(function () {
  const root = document.querySelector("[data-issues]");
  if (!root) return;
  const csrf = root.dataset.csrf;
  const state = { owner: "", name: "" };
  const list = root.querySelector("[data-issue-list]");
  const out = root.querySelector("[data-fix-out]");

  root.querySelector("[data-issue-repo]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await load(event.target.url.value);
  });

  root.querySelectorAll("[data-recent-repo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const repo = btn.dataset.recentRepo;
      const input = root.querySelector("[data-issue-repo] input[name='url']");
      if (input) input.value = `https://github.com/${repo}`;
      load(`https://github.com/${repo}`);
    });
  });

  root.querySelector("[data-issue-q]")?.addEventListener("input", debounce(refresh, 300));

  // Check URL query parameters for auto-loaded repo
  const urlParams = new URLSearchParams(window.location.search);
  const repoParam = urlParams.get("repo") || urlParams.get("url");
  if (repoParam) {
    const input = root.querySelector("[data-issue-repo] input[name='url']");
    if (input) input.value = repoParam;
    load(repoParam);
  }

  list?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-fix]");
    if (!btn) return;
    const provider = root.querySelector("[data-provider]").value;
    if (provider !== "gemini") {
      out.innerHTML = `
        <div class="mh-chat-welcome">
          <div class="mh-welcome-icon">⚠️</div>
          <h3>Gemini is disabled</h3>
          <p>Select Gemini in the engine dropdown to run AI debugging.</p>
        </div>
      `;
      return;
    }
    out.innerHTML = `
      <div class="mh-chat-welcome">
        <div class="mh-welcome-icon">⚡</div>
        <h3>Analyzing Issue #${btn.dataset.number}...</h3>
        <p>Gemini is investigating root causes, exploring relevant files, and generating a fix diff.</p>
      </div>
    `;
    const response = await fetch("/issues/fix/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify({
        provider,
        number: Number(btn.dataset.number),
        title: btn.dataset.title,
        body: btn.dataset.body,
        repo_owner: state.owner,
        repo_name: state.name,
      }),
    });
    const data = await response.json();
    if (data.ok) {
      out.innerHTML = `<div class="mh-bubble mh-bubble-ai"><div class="mh-bubble-header">Gemini Fix Analysis</div><div>${escapeHtml(data.reply)}</div></div>`;
    } else {
      out.innerHTML = `<div class="mh-bubble mh-bubble-ai"><div class="mh-bubble-header">Error</div><div>⚠️ ${escapeHtml(data.error || "Failed to analyze issue.")}</div></div>`;
    }
  });

  async function load(url) {
    const parts = url.replace(/https?:\/\/github.com\//, "").split("/").filter(Boolean);
    state.owner = parts[0];
    state.name = (parts[1] || "").replace(/\.git$/, "");
    await refresh();
  }

  async function refresh() {
    if (!state.owner || !state.name) return;
    list.innerHTML = `<div class="mh-empty-tree">Fetching issues for ${state.owner}/${state.name}...</div>`;
    const q = root.querySelector("[data-issue-q]")?.value || "";
    const response = await fetch(`/issues/list/?owner=${encodeURIComponent(state.owner)}&name=${encodeURIComponent(state.name)}&q=${encodeURIComponent(q)}`);
    const data = await response.json();
    if (!data.ok) {
      list.innerHTML = `<div class="mh-empty-tree error">⚠️ ${escapeHtml(data.error)}</div>`;
      return;
    }
    if (!data.issues || data.issues.length === 0) {
      list.innerHTML = `<div class="mh-empty-tree">No open issues found.</div>`;
      return;
    }
    list.innerHTML = "";
    data.issues.forEach((issue) => {
      const card = document.createElement("article");
      card.className = "mh-issue-card";
      const labels = (issue.labels || []).map((name) => `<span class="mh-issue-tag">${escapeHtml(name)}</span>`).join("");
      card.innerHTML = `
        <h3>#${issue.number} ${escapeHtml(issue.title)}</h3>
        <div class="mh-issue-tags">${labels}</div>
        <p class="mh-issue-body">${escapeHtml((issue.body || "No description provided.").slice(0, 240))}${issue.body && issue.body.length > 240 ? "..." : ""}</p>
        <button type="button" class="mh-btn mh-btn-sm mh-btn-accent" data-fix data-number="${issue.number}" data-title="${escapeAttr(issue.title)}" data-body="${escapeAttr(issue.body || "")}">
          ⚡ Fix with Gemini
        </button>
      `;
      list.appendChild(card);
    });
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('"', "&quot;");
  }
})();

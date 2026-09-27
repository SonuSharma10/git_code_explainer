(function () {
  const root = document.querySelector("[data-issues]");
  if (!root) return;
  const csrf = root.dataset.csrf;
  const hasUserKey = root.dataset.hasUserKey === "true";

  const state = {
    owner: "",
    name: "",
    page: 1,
    perPage: 15,
    hasMore: false,
    loading: false,
    activeIssue: null,
    cachedIssues: [],
  };

  const list = root.querySelector("[data-issue-list]");
  const out = root.querySelector("[data-fix-out]");
  const titleEl = root.querySelector("[data-issue-pane-title]");
  const backBtn = root.querySelector("[data-issue-back-btn]");
  const searchInput = root.querySelector("[data-issue-id-input]");
  const searchBtn = root.querySelector("[data-issue-id-search-btn]");

  if (searchInput) {
    searchInput.value = "";
  }

  // Load repo from top form
  root.querySelector("[data-issue-repo]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (searchInput) searchInput.value = "";
    await loadRepoUrl(event.target.url.value);
  });

  // Check URL query parameters for auto-loaded repo
  const urlParams = new URLSearchParams(window.location.search);
  const repoParam = urlParams.get("repo") || urlParams.get("url");
  if (repoParam) {
    const input = root.querySelector("[data-issue-repo] input[name='url']");
    if (input) input.value = repoParam;
    loadRepoUrl(repoParam);
  }

  // Quick Issue ID / Keyword Search
  searchBtn?.addEventListener("click", () => handleSearch());
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  });

  async function handleSearch() {
    const raw = (searchInput?.value || "").trim();
    if (!state.owner || !state.name) {
      alert("Please load a GitHub repository first.");
      return;
    }
    // Check if it's a URL or pure digits (Issue ID)
    let issueNum = "";
    const urlMatch = raw.match(/\/issues\/(\d+)/);
    if (urlMatch) {
      issueNum = urlMatch[1];
    } else if (/^\d+$/.test(raw)) {
      issueNum = raw;
    }

    if (issueNum) {
      await fetchSingleIssue(issueNum);
    } else {
      // General filter query
      state.page = 1;
      state.cachedIssues = [];
      await fetchIssuesPage(1, false, raw);
    }
  }

  // Back button: return from single issue inspection to the list
  backBtn?.addEventListener("click", () => {
    state.activeIssue = null;
    backBtn.hidden = true;
    if (titleEl) titleEl.textContent = "Open Issues";
    renderCachedIssues();
  });

  async function loadRepoUrl(url) {
    const parts = url.replace(/https?:\/\/github.com\//, "").split("/").filter(Boolean);
    state.owner = parts[0];
    state.name = (parts[1] || "").replace(/\.git$/, "");
    state.page = 1;
    state.cachedIssues = [];
    state.activeIssue = null;
    if (backBtn) backBtn.hidden = true;
    if (titleEl) titleEl.textContent = "Open Issues";
    await fetchIssuesPage(1, false);
  }

  async function fetchIssuesPage(page = 1, append = false, query = "") {
    if (!state.owner || !state.name || state.loading) return;
    state.loading = true;

    if (!append) {
      list.innerHTML = `<div class="mh-empty-tree">Fetching issues from ${state.owner}/${state.name} (page ${page})...</div>`;
    }

    try {
      const q = encodeURIComponent(query);
      const url = `/issues/list/?owner=${encodeURIComponent(state.owner)}&name=${encodeURIComponent(state.name)}&page=${page}&per_page=${state.perPage}&q=${q}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.ok) {
        if (!append) {
          list.innerHTML = `<div class="mh-empty-tree error">⚠️ ${escapeHtml(data.error)}</div>`;
        }
        state.loading = false;
        return;
      }

      state.hasMore = data.has_more;
      state.page = page;

      if (!append) {
        state.cachedIssues = data.issues || [];
      } else {
        state.cachedIssues = state.cachedIssues.concat(data.issues || []);
      }

      renderCachedIssues();
    } catch (err) {
      console.error("Fetch issues error:", err);
      if (!append) {
        list.innerHTML = `<div class="mh-empty-tree error">⚠️ Network error while fetching issues.</div>`;
      }
    } finally {
      state.loading = false;
    }
  }

  function renderCachedIssues() {
    if (!state.cachedIssues || state.cachedIssues.length === 0) {
      list.innerHTML = `<div class="mh-empty-tree">No open issues found for this repository.</div>`;
      return;
    }

    list.innerHTML = "";
    state.cachedIssues.forEach((issue) => {
      const card = document.createElement("article");
      card.className = "mh-issue-card";
      card.dataset.issueNumber = issue.number;
      const labels = (issue.labels || []).map((name) => `<span class="mh-issue-tag">${escapeHtml(name)}</span>`).join("");

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <h3 style="margin: 0; cursor: pointer;" data-inspect-title>#${issue.number} ${escapeHtml(issue.title)}</h3>
          <span style="font-size: 11px; color: var(--color-text-muted); white-space: nowrap;">💬 ${issue.comments || 0}</span>
        </div>
        <div class="mh-issue-tags" style="margin-top: 6px;">${labels}</div>
        <p class="mh-issue-body">${escapeHtml((issue.body || "No description provided.").slice(0, 220))}${issue.body && issue.body.length > 220 ? "..." : ""}</p>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <button type="button" class="mh-btn mh-btn-sm mh-btn-accent" data-brainstorm data-number="${issue.number}">
            🧠 Brainstorm with Gemini
          </button>
          <button type="button" class="mh-btn mh-btn-sm mh-btn-ghost" data-inspect-btn data-number="${issue.number}">
            View Details
          </button>
          <a href="${issue.html_url}" target="_blank" rel="noopener noreferrer" class="mh-btn mh-btn-sm mh-btn-ghost" style="text-decoration: none;" title="Open in GitHub">
            GitHub ↗
          </a>
        </div>
      `;
      list.appendChild(card);
    });

    // Append "Load More" button if there are more pages
    if (state.hasMore) {
      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.type = "button";
      loadMoreBtn.className = "mh-load-more-btn";
      loadMoreBtn.innerHTML = `<span>↓ Load More Issues (Page ${state.page + 1})</span>`;
      loadMoreBtn.addEventListener("click", () => {
        loadMoreBtn.textContent = "Loading more...";
        fetchIssuesPage(state.page + 1, true);
      });
      list.appendChild(loadMoreBtn);
    }
  }

  // Infinite Scroll Trigger on list bottom
  list.addEventListener("scroll", () => {
    if (state.activeIssue || state.loading || !state.hasMore) return;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 50) {
      fetchIssuesPage(state.page + 1, true);
    }
  });

  // Fetch and display single issue by ID
  async function fetchSingleIssue(number) {
    if (!state.owner || !state.name) return;
    list.innerHTML = `<div class="mh-empty-tree">Fetching issue #${number}...</div>`;
    if (titleEl) titleEl.textContent = `Issue #${number}`;
    if (backBtn) backBtn.hidden = false;

    try {
      const response = await fetch(`/issues/list/?owner=${encodeURIComponent(state.owner)}&name=${encodeURIComponent(state.name)}&issue_number=${number}`);
      const data = await response.json();
      if (!data.ok || !data.issues || data.issues.length === 0) {
        list.innerHTML = `<div class="mh-empty-tree error">⚠️ Issue #${number} not found or could not be loaded.</div>`;
        return;
      }
      displaySingleIssue(data.issues[0]);
    } catch (err) {
      list.innerHTML = `<div class="mh-empty-tree error">⚠️ Network error while loading issue #${number}.</div>`;
    }
  }

  function displaySingleIssue(issue) {
    state.activeIssue = issue;
    if (titleEl) titleEl.textContent = `Issue #${issue.number}`;
    if (backBtn) backBtn.hidden = false;

    list.innerHTML = "";
    const detailBox = document.createElement("div");
    detailBox.className = "mh-issue-detail-view";

    const labels = (issue.labels || []).map((name) => `<span class="mh-issue-tag">${escapeHtml(name)}</span>`).join("");
    const bodyContent = issue.body ? (window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(issue.body)) : escapeHtml(issue.body)) : "<em>No description provided.</em>";

    detailBox.innerHTML = `
      <div class="mh-card" style="padding: 16px;">
        <h2 style="font-size: 16px; font-weight: 800; margin-bottom: 8px; color: var(--color-text-strong);">#${issue.number} ${escapeHtml(issue.title)}</h2>
        <div class="mh-issue-tags" style="margin-bottom: 12px;">${labels}</div>
        <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 14px; display: flex; gap: 12px;">
          <span>👤 ${escapeHtml(issue.user || "Author")}</span>
          <span>💬 ${issue.comments || 0} comments</span>
        </div>
        <div class="mh-markdown-body" style="border-top: 1px solid var(--color-border); padding-top: 12px; margin-bottom: 16px; max-height: 380px; overflow-y: auto;">
          ${bodyContent}
        </div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <button type="button" class="mh-btn mh-btn-accent" data-brainstorm data-number="${issue.number}">
            🧠 Brainstorm &amp; Understand with Gemini
          </button>
          <a href="${issue.html_url}" target="_blank" rel="noopener noreferrer" class="mh-btn mh-btn-ghost" style="text-decoration: none;">
            Open on GitHub ↗
          </a>
        </div>
      </div>
    `;
    list.appendChild(detailBox);
  }

  // Handle clicks inside list (Brainstorm trigger, inspect details)
  list.addEventListener("click", async (event) => {
    // 1. Click "View Details" or title to open single issue view
    const inspectBtn = event.target.closest("[data-inspect-btn]");
    const inspectTitle = event.target.closest("[data-inspect-title]");
    if (inspectBtn || inspectTitle) {
      const card = event.target.closest(".mh-issue-card");
      const num = Number(card?.dataset?.issueNumber);
      const found = state.cachedIssues.find((i) => i.number === num);
      if (found) {
        displaySingleIssue(found);
      } else if (num) {
        fetchSingleIssue(num);
      }
      return;
    }

    // 2. Click "Brainstorm with Gemini"
    const brainBtn = event.target.closest("[data-brainstorm]");
    if (!brainBtn) return;

    const num = Number(brainBtn.dataset.number);
    let targetIssue = state.activeIssue && state.activeIssue.number === num
      ? state.activeIssue
      : state.cachedIssues.find((i) => i.number === num);

    if (!targetIssue) {
      targetIssue = { number: num, title: `Issue #${num}`, body: "" };
    }

    out.innerHTML = `
      <div class="mh-chat-welcome">
        <div class="mh-welcome-icon">🧠</div>
        <h3>Senior Engineer Brainstorming Session...</h3>
        <p>Analyzing Issue #${targetIssue.number}: breaking down the problem, investigating architectural root causes, and evaluating solution trade-offs with Gemini AI.</p>
      </div>
    `;

    try {
      const response = await fetch("/issues/fix/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
        body: JSON.stringify({
          provider: "gemini",
          number: targetIssue.number,
          title: targetIssue.title,
          body: targetIssue.body,
          repo_owner: state.owner,
          repo_name: state.name,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        const formatted = window.marked && window.DOMPurify
          ? window.DOMPurify.sanitize(window.marked.parse(data.reply))
          : escapeHtml(data.reply);

        out.innerHTML = `
          <div class="mh-bubble mh-bubble-ai" style="width: 100%; max-width: 100%;">
            <div class="mh-bubble-header" style="color: var(--color-success); font-weight: 800; font-size: 12px; margin-bottom: 8px;">
              ⚡ Senior Staff Engineer · Architectural Breakdown &amp; Mentorship
            </div>
            <div class="mh-markdown-body">${formatted}</div>
          </div>
        `;
      } else {
        out.innerHTML = `
          <div class="mh-bubble mh-bubble-ai" style="width: 100%;">
            <div class="mh-bubble-header" style="color: var(--color-error-text); font-weight: 800;">Error</div>
            <div>⚠️ ${escapeHtml(data.error || "Failed to analyze issue.")}</div>
          </div>
        `;
      }
    } catch (err) {
      out.innerHTML = `
        <div class="mh-bubble mh-bubble-ai" style="width: 100%;">
          <div class="mh-bubble-header" style="color: var(--color-error-text); font-weight: 800;">Network Error</div>
          <div>⚠️ Request failed. Please check your network connection and Gemini API setup.</div>
        </div>
      `;
    }
  });

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
})();

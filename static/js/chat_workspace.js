(function () {
  const root = document.querySelector("[data-explore]");
  if (!root) return;

  const csrf = root.dataset.csrf;
  const workspaceEl = root.querySelector("[data-workspace]");
  const state = {
    owner: "",
    name: "",
    branch: "main",
    filePath: "",
    fileContent: "",
    conversationId: "",
    treeData: [],
    discovery: null,
    layoutMode: localStorage.getItem("explainer_layout_mode") || "chat-bottom",
    codeShrunk: false,
    chatExpanded: false,
    treeCollapsed: false,
  };

  const treeMount = root.querySelector("[data-tree]");
  const treeFilter = root.querySelector("[data-tree-filter]");
  const codeEl = root.querySelector("[data-code]");
  const codePre = root.querySelector("[data-code-pre]");
  const markdownPreview = root.querySelector("[data-markdown-preview]");
  const titleEl = root.querySelector("[data-file-title]");
  const transcript = root.querySelector("[data-transcript]");
  const statusEl = root.querySelector("[data-repo-status]");
  const promptHelp = root.querySelector("[data-prompt-help]");
  const promptSelect = root.querySelector("[data-prompt]");
  const download = root.querySelector("[data-download]");
  const copyBtn = root.querySelector("[data-copy-code]");
  const discoveryBar = root.querySelector("[data-discovery-bar]");
  const discoveryInfo = root.querySelector("[data-discovery-info]");
  const branchWrap = root.querySelector("[data-branch-wrap]");
  const branchSelect = root.querySelector("[data-branch-select]");
  const hasUserKey = root.dataset.hasUserKey === "true";

  const helpText = {
    setup_guide: "Repository setup guide: prerequisites, dependencies, and required API keys.",
    file_deep_dive: "Detailed line-by-line explanation of the active file, design patterns, and edge cases.",
    api_working_fields: "API endpoints, request/response schema, payloads, and underlying working fields.",
    architecture_mermaid: "Generates an interactive Mermaid.js diagram directly inside the chat.",
    readme_generator: "README generator: fills in missing architecture, setup, and features.",
    issue_fix: "Root-cause analysis, proposed fix, and copy-pasteable git diff snippet.",
    eli5: "Explain like I'm 5: simple stories, everyday words, no jargon.",
    study_notes: "Clean Markdown notes formatted for export and revision.",
  };

  const codePane = root.querySelector("[data-code-pane]");
  const chatPane = root.querySelector("[data-chat-pane]");

  // -------------------------------------------------------------
  // Layout & Customization Controls
  // -------------------------------------------------------------
  function applyLayout(mode) {
    state.layoutMode = mode;
    localStorage.setItem("explainer_layout_mode", mode);
    if (!workspaceEl) return;

    // Reset inline dimensions so resizes from one layout don't break the other layout
    if (codePane) {
      codePane.style.width = "";
      codePane.style.height = "";
    }
    if (chatPane) {
      chatPane.style.width = "";
      chatPane.style.height = "";
    }

    workspaceEl.classList.remove("mh-layout-chat-bottom", "mh-layout-three-pane", "mh-layout-chat-focus");
    if (mode === "three-pane") {
      workspaceEl.classList.add("mh-layout-three-pane");
    } else {
      workspaceEl.classList.add("mh-layout-chat-bottom");
    }

    root.querySelectorAll("[data-layout-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.layoutMode === mode);
    });
  }

  // Synchronize vertical expansion in 3-pane mode so all panes expand together smoothly
  if (window.ResizeObserver && codePane && chatPane) {
    const syncObserver = new ResizeObserver((entries) => {
      if (state.layoutMode !== "three-pane") return;
      for (let entry of entries) {
        const target = entry.target;
        const newHeight = target.offsetHeight;
        if (newHeight > 0) {
          const treePane = root.querySelector("[data-tree-pane]");
          if (treePane && Math.abs(treePane.offsetHeight - newHeight) > 10) {
            treePane.style.height = `${newHeight}px`;
          }
          if (target === codePane && chatPane && Math.abs(chatPane.offsetHeight - newHeight) > 10) {
            chatPane.style.height = `${newHeight}px`;
          } else if (target === chatPane && codePane && Math.abs(codePane.offsetHeight - newHeight) > 10) {
            codePane.style.height = `${newHeight}px`;
          }
        }
      }
    });
    syncObserver.observe(codePane);
    syncObserver.observe(chatPane);
  }

  // Initial layout
  applyLayout(state.layoutMode);

  // Layout switcher buttons
  root.querySelectorAll("[data-layout-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyLayout(btn.dataset.layoutMode);
    });
  });

  // Shrink / Expand Code Pane
  const toggleCodeBtn = root.querySelector("[data-toggle-code-size]");
  const codeSizeLabel = root.querySelector("[data-code-size-label]");
  toggleCodeBtn?.addEventListener("click", () => {
    state.codeShrunk = !state.codeShrunk;
    workspaceEl.classList.toggle("code-shrink", state.codeShrunk);
    if (codeSizeLabel) {
      codeSizeLabel.textContent = state.codeShrunk ? "Expand Code" : "Shrink";
    }
  });

  // Expand / Shrink Chat Area
  const toggleChatBtn = root.querySelector("[data-toggle-chat-size]");
  const chatSizeLabel = root.querySelector("[data-chat-size-label]");
  toggleChatBtn?.addEventListener("click", () => {
    state.chatExpanded = !state.chatExpanded;
    workspaceEl.classList.toggle("chat-expand", state.chatExpanded);
    if (chatSizeLabel) {
      chatSizeLabel.textContent = state.chatExpanded ? "Default Chat" : "Expand Chat";
    }
  });

  // Toggle Tree Pane collapse
  function setTreeCollapsed(collapsed) {
    state.treeCollapsed = collapsed;
    workspaceEl.classList.toggle("tree-collapsed", collapsed);
  }

  const toggleTreeBtn = root.querySelector("[data-toggle-tree]");
  toggleTreeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setTreeCollapsed(!state.treeCollapsed);
  });

  // Expand back when clicking folder icon, header title, or tree pane while collapsed
  const treeTitleBtn = root.querySelector("[data-tree-title-btn]");
  treeTitleBtn?.addEventListener("click", () => {
    if (state.treeCollapsed) {
      setTreeCollapsed(false);
    }
  });

  const treePaneEl = root.querySelector("[data-tree-pane]");
  treePaneEl?.addEventListener("click", (e) => {
    if (state.treeCollapsed) {
      // If user clicks anywhere on the collapsed tree pane strip, expand it back
      setTreeCollapsed(false);
    }
  });

  // Reset Tree View and Code Inspector
  const resetTreeBtn = root.querySelector("[data-reset-tree]");
  resetTreeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    // Collapse all details elements in tree
    if (treeMount) {
      treeMount.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
      treeMount.querySelectorAll("button.active").forEach((b) => b.classList.remove("active"));
    }
    // Reset code inspector & dimensions
    state.filePath = "";
    state.fileContent = "";
    if (codePane) {
      codePane.style.width = "";
      codePane.style.height = "";
    }
    if (chatPane) {
      chatPane.style.width = "";
      chatPane.style.height = "";
    }
    if (titleEl) titleEl.textContent = "Select a file to inspect";
    if (markdownPreview) markdownPreview.hidden = true;
    if (codePre) codePre.hidden = false;
    if (codeEl) {
      codeEl.className = "language-clike";
      codeEl.textContent = "// Select any file from the left tree to inspect source code.";
      if (window.Prism) {
        window.Prism.highlightElement(codeEl);
      }
    }
  });

  promptSelect?.addEventListener("change", () => {
    if (promptHelp) promptHelp.textContent = helpText[promptSelect.value] || "";
  });

  // Mount repo from main form
  root.querySelector("[data-repo-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = event.target.url.value.trim();
    if (url) await loadRepo(url);
  });

  // Quick example chips
  root.querySelectorAll("[data-quick-repo]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const repo = chip.dataset.quickRepo;
      const input = root.querySelector("[data-repo-form] input[name='url']");
      if (input) input.value = `https://github.com/${repo}`;
      loadRepo(`https://github.com/${repo}`);
    });
  });

  // Recent repos list
  root.querySelectorAll("[data-recent-repo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const repo = btn.dataset.recentRepo;
      const input = root.querySelector("[data-repo-form] input[name='url']");
      if (input) input.value = `https://github.com/${repo}`;
      loadRepo(`https://github.com/${repo}`);
    });
  });

  // Tree filter
  treeFilter?.addEventListener("input", (e) => {
    if (window.renderTree && state.treeData) {
      window.renderTree(state.treeData, treeMount, e.target.value);
    }
  });

  // Tree file click
  treeMount?.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    const path = btn?.dataset?.filePath;
    if (path) {
      treeMount.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      openFile(path);
    }
  });

  // Copy code button in center pane
  copyBtn?.addEventListener("click", () => {
    if (!state.fileContent) return;
    navigator.clipboard.writeText(state.fileContent).then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `✓ Copied!`;
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 1500);
    });
  });

  // Chat composer form
  const chatForm = root.querySelector("[data-chat-form]");
  const chatTextarea = chatForm?.querySelector("textarea");

  chatTextarea?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  // -------------------------------------------------------------
  // LocalStorage Chat Persistence & History Restoration
  // (Only enabled if user is logged in: if not logged in, no activity stored)
  // -------------------------------------------------------------
  const isAuthenticated = root.dataset.authenticated === "true";

  function getStorageKey() {
    if (!state.owner || !state.name) return "repo_chat_default";
    return `repo_chat_${state.owner.toLowerCase()}_${state.name.toLowerCase()}`;
  }

  function saveMessageToStorage(role, text) {
    if (!isAuthenticated) return; // Do not store anything if user is not logged in
    try {
      const key = getStorageKey();
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push({ role, text, timestamp: Date.now() });
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.warn("Could not save message to localStorage:", e);
    }
  }

  function restoreHistoryFromStorage() {
    if (!isAuthenticated) {
      alert("Please sign in or create an account to persist and restore chat history.");
      return;
    }
    const key = getStorageKey();
    const stored = localStorage.getItem(key);
    if (!stored) {
      alert(`No saved conversation found in local storage for ${state.owner ? state.owner + "/" + state.name : "this repository"}.`);
      return;
    }
    try {
      const messages = JSON.parse(stored);
      if (!messages || messages.length === 0) {
        alert("Saved chat history is empty.");
        return;
      }
      transcript.innerHTML = "";
      messages.forEach((msg) => {
        appendBubble(msg.role, msg.text, false);
      });
      // Add a system notice
      const notice = document.createElement("div");
      notice.className = "mh-chat-welcome";
      notice.style.padding = "8px 12px";
      notice.style.margin = "10px 0";
      notice.innerHTML = `<span style="color: var(--color-accent); font-weight: 600;">✓ Restored ${messages.length} messages from local storage.</span>`;
      transcript.appendChild(notice);
      transcript.scrollTop = transcript.scrollHeight;
    } catch (e) {
      console.error("Error restoring history:", e);
      alert("Failed to parse saved conversation history.");
    }
  }

  // Restore history button
  root.querySelector("[data-restore-chat]")?.addEventListener("click", () => {
    restoreHistoryFromStorage();
  });

  // Gemini Status Button -> opens Profile Vault if logged in
  const geminiStatusBtn = root.querySelector("#geminiStatusBtn");
  if (geminiStatusBtn && geminiStatusBtn.tagName === "BUTTON") {
    geminiStatusBtn.addEventListener("click", () => {
      const vaultOverlay = document.getElementById("vaultOverlay");
      if (vaultOverlay) {
        vaultOverlay.hidden = false;
        if (window.loadVaultKeys) window.loadVaultKeys();
      }
    });
  }

  // Clear chat button with safety confirmation warning
  root.querySelector("[data-clear-chat]")?.addEventListener("click", () => {
    const confirmed = window.confirm("⚠️ Are you sure you want to clear this entire conversation history? This will delete all messages for this repository and reset the code viewer.");
    if (!confirmed) return;

    // Remove from localStorage
    const key = getStorageKey();
    localStorage.removeItem(key);

    // Clear transcript DOM
    transcript.innerHTML = `
      <div class="mh-chat-welcome">
        <div class="mh-welcome-icon">💬</div>
        <h3>Chat conversation cleared</h3>
        <p>Your local conversation history has been wiped. Select a file or ask Gemini any question about this repository.</p>
      </div>
    `;

    // Reset code view and dimensions back to repository default
    state.filePath = "";
    state.fileContent = "";
    if (codePane) {
      codePane.style.width = "";
      codePane.style.height = "";
    }
    if (chatPane) {
      chatPane.style.width = "";
      chatPane.style.height = "";
    }
    if (titleEl) titleEl.textContent = "Select a file to inspect";
    if (markdownPreview) markdownPreview.hidden = true;
    if (codePre) codePre.hidden = false;
    if (codeEl) {
      codeEl.className = "language-clike";
      codeEl.textContent = "// Select any file from the left tree to inspect source code.";
      if (window.Prism) {
        window.Prism.highlightElement(codeEl);
      }
    }
    if (download) download.href = "#";
  });

  chatForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const provider = root.querySelector("[data-provider]").value;
    const message = chatTextarea.value.trim();
    if (!message) return;

    if (provider !== "gemini") {
      appendBubble("assistant", "Select Gemini in the engine selector to call Gemini AI.");
      return;
    }

    appendBubble("user", message, true);
    chatTextarea.value = "";

    // If user is not logged in, politely encourage them to sign in and add their Gemini key
    if (!isAuthenticated) {
      appendBubble(
        "assistant",
        "👋 **Welcome to Repo Explainer!**\n\nTo unlock personalized AI explanations, save your chat history, and use custom Gemini models, please **[Sign In](/auth/login/?next=/explore/)** or **[Create an Account](/auth/signup/)** and set up your free Google Gemini API key in the **Profile Vault**.\n\nYou can get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).",
        false
      );
      return;
    }

    const eli5Input = root.querySelector("[data-eli5]");
    const isEli5 = eli5Input ? eli5Input.checked : promptSelect.value === "eli5";

    const payload = {
      provider: provider || "gemini",
      message,
      conversation_id: state.conversationId,
      session_type: promptSelect.value === "issue_fix" ? "issue_fix" : "code_explanation",
      prompt_template_id: promptSelect.value,
      eli5: isEli5,
      repo_owner: state.owner,
      repo_name: state.name,
      file_path: state.filePath,
      file_content: state.fileContent,
      context_identifier: state.filePath || `${state.owner}/${state.name}`,
    };

    const loadingDiv = appendBubble("assistant", "Thinking with Gemini...", false);
    const data = await post("/ai/chat/", payload);
    loadingDiv.remove();

    if (!data.ok) {
      appendBubble("assistant", `⚠️ Error: ${data.error || "Gemini request failed."}`, false);
      return;
    }

    state.conversationId = data.conversation_id;
    appendBubble("assistant", data.reply, true);
    renderPast(data.past_conversations || []);
    if (download) download.href = `/ai/notes/?conversation_id=${data.conversation_id}`;
  });

  // Render Architecture button -> Sends Mermaid query to Gemini
  root.querySelector("[data-arch]")?.addEventListener("click", () => {
    if (promptSelect) {
      promptSelect.value = "architecture_mermaid";
      if (promptHelp) promptHelp.textContent = helpText["architecture_mermaid"];
    }
    const msg = state.filePath
      ? `Explain how \`${state.filePath}\` fits into the repository architecture and generate an interactive Mermaid flowchart diagram.`
      : "Explain the overall architecture and data flow of this repository and generate an interactive Mermaid flowchart diagram.";
    chatTextarea.value = msg;
    chatForm.requestSubmit();
  });

  // Past conversations load
  root.querySelector("[data-past]")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-load-conv]");
    const id = btn?.dataset?.loadConv;
    if (!id) return;
    const data = await get(`/ai/conversations/${id}/`);
    if (!data.ok) return;
    state.conversationId = data.conversation_id;
    transcript.innerHTML = "";
    (data.messages || []).forEach((item) => appendBubble(item.role, item.content));
    if (download) download.href = `/ai/notes/?conversation_id=${data.conversation_id}`;
  });

  const copyTreeBtn = root.querySelector("[data-copy-tree]");
  const checklistBox = root.querySelector("[data-repo-checklist]");
  const checklistSteps = {
    validate: root.querySelector('[data-step="validate"]'),
    tree: root.querySelector('[data-step="tree"]'),
    keys: root.querySelector('[data-step="keys"]'),
    ready: root.querySelector('[data-step="ready"]'),
  };

  function updateChecklistStep(stepName, state, text) {
    const el = checklistSteps[stepName];
    if (!el) return;
    el.classList.remove("active", "completed", "failed");
    const icon = el.querySelector(".mh-step-icon");
    const label = el.querySelector(".mh-step-label");
    if (text && label) label.textContent = text;

    if (state === "loading") {
      el.classList.add("active");
      if (icon) icon.textContent = "⏳";
    } else if (state === "done") {
      el.classList.add("completed");
      if (icon) icon.textContent = "✅";
    } else if (state === "error") {
      el.classList.add("failed");
      if (icon) icon.textContent = "❌";
    } else {
      if (icon) icon.textContent = "⚪";
    }
  }

  function resetChecklist() {
    if (!checklistBox) return;
    checklistBox.classList.remove("checklist-fade-out");
    checklistBox.hidden = false;
    updateChecklistStep("validate", "loading", "Validating repository & access permissions");
    updateChecklistStep("tree", "pending", "Fetching Git trees & directory hierarchy");
    updateChecklistStep("keys", "pending", "Scanning environment files & required API keys");
    updateChecklistStep("ready", "pending", "Building interactive code viewer & AI workspace");
  }

  function formatTreeAsText(nodes, prefix = "") {
    let result = "";
    if (!nodes || !nodes.length) return "";
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const pointer = isLast ? "└── " : "├── ";
      result += `${prefix}${pointer}${node.name}${node.type === "tree" ? "/" : ""}\n`;
      if (node.children && node.children.length) {
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        result += formatTreeAsText(node.children, nextPrefix);
      }
    });
    return result;
  }

  copyTreeBtn?.addEventListener("click", () => {
    if (!state.treeData || !state.treeData.length) {
      alert("Mount a repository first to copy its directory tree.");
      return;
    }
    const header = `${state.owner}/${state.name} (${state.branch})\n`;
    const treeText = header + formatTreeAsText(state.treeData);
    navigator.clipboard.writeText(treeText).then(() => {
      const original = copyTreeBtn.innerHTML;
      copyTreeBtn.innerHTML = `<span>✓ Copied Tree!</span>`;
      setTimeout(() => { copyTreeBtn.innerHTML = original; }, 1800);
    });
  });

  async function loadRepo(url, branch = "") {
    statusEl.textContent = "";
    resetChecklist();

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Step 1: Validating
    await sleep(250);
    updateChecklistStep("validate", "loading");

    const data = await post("/explore/load/", { url, branch });

    if (!data.ok) {
      const err = data.error || "Failed to load repository.";
      const isPrivate = err.toLowerCase().includes("private") || err.toLowerCase().includes("not found");
      updateChecklistStep("validate", "error", isPrivate ? `🔒 Private repo or invalid URL: ${err}` : `❌ ${err}`);
      statusEl.textContent = isPrivate ? `🔒 Warning: Repository appears private or unreachable. ${err}` : `❌ ${err}`;
      return;
    }

    updateChecklistStep("validate", "done", `Verified public repository: ${data.owner}/${data.name}`);

    // Step 2: Directory Tree
    updateChecklistStep("tree", "loading");
    await sleep(200);
    state.owner = data.owner;
    state.name = data.name;
    state.branch = data.active_branch || data.default_branch;
    state.treeData = data.tree;
    state.discovery = data.discovery;

    // Populate branch selector
    if (branchWrap && branchSelect) {
      const branches = data.branches || [state.branch];
      branchSelect.innerHTML = "";
      branches.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        if (b === state.branch) opt.selected = true;
        branchSelect.appendChild(opt);
      });
      branchWrap.hidden = false;
    }

    window.renderTree(data.tree, treeMount, treeFilter ? treeFilter.value : "");
    updateChecklistStep("tree", "done", `Directory tree loaded (${data.tree.length} root items)`);

    // Step 3: Discovery & API Keys
    updateChecklistStep("keys", "loading");
    await sleep(200);
    const keysCount = (data.discovery?.api_keys || []).length;
    updateChecklistStep(
      "keys",
      "done",
      keysCount > 0
        ? `Found ${keysCount} API key(s) in env templates (${data.discovery.api_keys.slice(0, 3).join(", ")})`
        : "Scanned configuration files & README"
    );

    // Step 4: Workspace ready
    updateChecklistStep("ready", "done", "Workspace ready! Select any file to explore.");
    statusEl.textContent = `Mounted: ${data.owner}/${data.name} (branch: ${state.branch})`;

    // Update Brainstorm Issues link to carry repo parameter
    const brainstormLink = root.querySelector("[data-brainstorm-link]");
    if (brainstormLink) {
      brainstormLink.href = `/issues/?url=https://github.com/${encodeURIComponent(data.owner)}/${encodeURIComponent(data.name)}`;
    }

    // Auto-restore chat from local storage if user is logged in and stored history exists
    if (isAuthenticated) {
      const storedHistory = localStorage.getItem(getStorageKey());
      if (storedHistory) {
        try {
          const msgs = JSON.parse(storedHistory);
          if (msgs && msgs.length > 0) {
            transcript.innerHTML = "";
            msgs.forEach((m) => appendBubble(m.role, m.text, false));
            const notice = document.createElement("div");
            notice.className = "mh-chat-welcome";
            notice.style.padding = "6px 10px";
            notice.style.margin = "8px 0";
            notice.innerHTML = `<span style="color: var(--color-accent); font-size: 12px; font-weight: 600;">✓ Auto-restored conversation from local storage.</span>`;
            transcript.appendChild(notice);
            transcript.scrollTop = transcript.scrollHeight;
          }
        } catch (e) {
          console.warn("Could not auto-restore stored chat:", e);
        }
      }
    }

    // Handle discovery banner
    if (discoveryBar && data.discovery) {
      const hasReadme = data.discovery.has_readme;
      let infoText = "";
      if (keysCount > 0) {
        infoText += `🔑 Found ${keysCount} API key(s) in env templates (${data.discovery.api_keys.slice(0, 3).join(", ")}${keysCount > 3 ? "..." : ""}). `;
      } else {
        infoText += `No sample .env detected. `;
      }
      infoText += hasReadme ? `📄 README detected (${data.discovery.readme_length} chars).` : `⚠️ No README found in repo root.`;
      
      if (discoveryInfo) discoveryInfo.textContent = infoText;
      discoveryBar.hidden = false;
    }

    // Auto-vanish checklist smoothly after 3 seconds on success
    setTimeout(() => {
      if (checklistBox) {
        checklistBox.classList.add("checklist-fade-out");
        setTimeout(() => {
          checklistBox.hidden = true;
          checklistBox.classList.remove("checklist-fade-out");
        }, 500);
      }
    }, 2800);
  }

  // Branch switcher event
  branchSelect?.addEventListener("change", async () => {
    const selectedBranch = branchSelect.value;
    if (selectedBranch && state.owner && state.name) {
      state.branch = selectedBranch;
      await loadRepo(`https://github.com/${state.owner}/${state.name}`, selectedBranch);
    }
  });

  function getLangClassFromPath(path) {
    const ext = (path.split(".").pop() || "").toLowerCase();
    const map = {
      js: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      jsx: "jsx",
      ts: "typescript",
      tsx: "tsx",
      py: "python",
      html: "html",
      htm: "html",
      css: "css",
      scss: "scss",
      json: "json",
      md: "markdown",
      sql: "sql",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      yml: "yaml",
      yaml: "yaml",
      rs: "rust",
      go: "go",
      java: "java",
      c: "c",
      cpp: "cpp",
      cs: "csharp",
      php: "php",
      rb: "ruby",
      dockerfile: "docker",
    };
    return map[ext] || "clike";
  }

  async function openFile(path) {
    titleEl.textContent = `Loading ${path}...`;
    const params = new URLSearchParams({
      owner: state.owner,
      name: state.name,
      path,
      ref: state.branch,
    });
    const data = await get(`/explore/file/?${params}`);
    if (!data.ok) {
      if (codeEl) codeEl.textContent = data.error || "Could not load file contents.";
      titleEl.textContent = path;
      return;
    }
    state.filePath = data.path;
    state.fileContent = data.content;
    titleEl.textContent = data.path;

    const isMarkdown = data.path.toLowerCase().endsWith(".md") || data.path.toLowerCase() === "readme";

    if (isMarkdown && markdownPreview && window.marked && window.DOMPurify) {
      // Auto-format README and markdown files
      markdownPreview.innerHTML = window.DOMPurify.sanitize(window.marked.parse(data.content));
      markdownPreview.hidden = false;
      if (codePre) codePre.hidden = true;
    } else {
      if (markdownPreview) markdownPreview.hidden = true;
      if (codePre) codePre.hidden = false;

      const lang = getLangClassFromPath(data.path);
      codeEl.className = `language-${lang}`;
      codeEl.textContent = data.content;

      // Trigger Prism syntax highlighting and line numbers
      if (window.Prism) {
        window.Prism.highlightElement(codeEl);
        const pre = codeEl.closest("pre");
        if (pre && window.Prism.plugins && window.Prism.plugins.lineNumbers) {
          window.Prism.plugins.lineNumbers.resize(pre);
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Markdown & Mermaid Bubble Formatter with Copy Buttons
  // -------------------------------------------------------------
  let mermaidCounter = 0;

  function appendBubble(role, text, saveToStorage = false) {
    if (saveToStorage && text) {
      saveMessageToStorage(role, text);
    }

    const div = document.createElement("div");
    const isAi = role === "assistant" || role === "model";
    div.className = `mh-bubble ${isAi ? "mh-bubble-ai" : "mh-bubble-user"}`;

    const header = document.createElement("div");
    header.className = "mh-bubble-header";
    header.textContent = isAi ? "Gemini AI" : "You";
    div.appendChild(header);

    const content = document.createElement("div");
    content.className = "mh-bubble-content mh-markdown-body";

    if (!isAi) {
      content.textContent = text;
      div.appendChild(content);
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
      return div;
    }

    // AI message: parse Markdown & separate Mermaid blocks
    renderFormattedAiResponse(content, text);
    div.appendChild(content);
    transcript.appendChild(div);
    transcript.scrollTop = transcript.scrollHeight;
    return div;
  }

  function renderFormattedAiResponse(container, rawText) {
    // Check if rawText contains ```mermaid ... ```
    const mermaidRegex = /```mermaid([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    const segments = [];

    while ((match = mermaidRegex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "markdown", content: rawText.substring(lastIndex, match.index) });
      }
      segments.push({ type: "mermaid", content: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < rawText.length) {
      segments.push({ type: "markdown", content: rawText.substring(lastIndex) });
    }

    segments.forEach((seg) => {
      if (seg.type === "markdown") {
        const mdDiv = document.createElement("div");
        if (window.marked && window.DOMPurify) {
          mdDiv.innerHTML = window.DOMPurify.sanitize(window.marked.parse(seg.content));
          // Attach copy buttons to all code blocks inside this markdown snippet
          attachCodeCopyButtons(mdDiv);
        } else {
          mdDiv.textContent = seg.content;
        }
        container.appendChild(mdDiv);
      } else if (seg.type === "mermaid") {
        renderMermaidBlock(container, seg.content);
      }
    });
  }

  function attachCodeCopyButtons(parentEl) {
    parentEl.querySelectorAll("pre").forEach((pre) => {
      const codeEl = pre.querySelector("code");
      const rawCode = codeEl ? codeEl.innerText : pre.innerText;

      // Extract language class if present (e.g. language-python)
      const className = codeEl?.className || "";
      const langMatch = className.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : "code";

      const wrapper = document.createElement("div");
      wrapper.className = "mh-chat-code-block";

      const bar = document.createElement("div");
      bar.className = "mh-chat-code-header";

      const langSpan = document.createElement("span");
      langSpan.className = "mh-chat-code-lang";
      langSpan.textContent = lang;

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "mh-code-copy-btn";
      copyBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy</span>
      `;

      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(rawCode).then(() => {
          copyBtn.innerHTML = `<span>✓ Copied!</span>`;
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span>Copy</span>
            `;
          }, 1500);
        });
      });

      bar.appendChild(langSpan);
      bar.appendChild(copyBtn);

      pre.className = "mh-chat-code-pre";
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(bar);
      wrapper.appendChild(pre);
    });
  }

  function renderMermaidBlock(container, diagramCode) {
    mermaidCounter++;
    const card = document.createElement("div");
    card.className = "mh-chat-mermaid-card";

    const header = document.createElement("div");
    header.className = "mh-chat-mermaid-header";
    header.innerHTML = `
      <span>📊 Architecture Flowchart</span>
      <button type="button" class="mh-code-copy-btn" title="Copy Mermaid Syntax">
        <span>Copy Syntax</span>
      </button>
    `;

    const copyBtn = header.querySelector("button");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(diagramCode).then(() => {
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy Syntax"; }, 1500);
      });
    });

    const svgWrap = document.createElement("div");
    svgWrap.className = "mh-chat-mermaid-svg";
    const graphId = `mermaid_graph_${mermaidCounter}`;
    svgWrap.id = graphId;

    card.appendChild(header);
    card.appendChild(svgWrap);
    container.appendChild(card);

    if (window.mermaid) {
      try {
        window.mermaid.render(graphId + "_svg", diagramCode).then(({ svg }) => {
          svgWrap.innerHTML = svg;
          transcript.scrollTop = transcript.scrollHeight;
        }).catch((err) => {
          console.warn("Mermaid render error:", err);
          svgWrap.innerHTML = `<pre class="mh-chat-code-pre"><code>${diagramCode}</code></pre>`;
        });
      } catch (err) {
        console.warn("Mermaid sync exception:", err);
        svgWrap.innerHTML = `<pre class="mh-chat-code-pre"><code>${diagramCode}</code></pre>`;
      }
    } else {
      svgWrap.innerHTML = `<pre class="mh-chat-code-pre"><code>${diagramCode}</code></pre>`;
    }
  }

  function renderPast(items) {
    const list = root.querySelector("[data-past]");
    if (!list) return;
    list.innerHTML = "";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mh-past-item";
      btn.dataset.loadConv = item.conversation_id;
      btn.innerHTML = `
        <span class="mh-past-id">${item.conversation_id}</span>
        <span class="mh-past-tag">${item.session_type}</span>
      `;
      list.appendChild(btn);
    });
  }

  async function post(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrf,
      },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async function get(url) {
    const response = await fetch(url);
    return response.json();
  }
})();

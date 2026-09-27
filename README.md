# 🚀 Repo Explainer

> **Understand any GitHub repository in minutes.** An AI-powered full-stack developer platform that turns complex, unfamiliar open-source codebases into interactive architecture flowcharts, file deep-dives, and guided Staff Engineer issue mentorship powered by Google Gemini AI.

---

## 🌟 Overview

Navigating large, unfamiliar codebases is often intimidating and time-consuming. **Repo Explainer** eliminates that friction. Paste any public GitHub repository link to instantly inspect directory trees, view syntax-highlighted source code, generate interactive Mermaid architecture diagrams, and brainstorm GitHub issues with step-by-step engineering guidance.

Try it: https://git-code-explainer.onrender.com
---

## ✨ Key Features

### 1. 🔍 Repository Explorer & Code Viewer
- **Interactive Directory Hierarchy:** Dynamic, collapsible tree view with instant regex/extension filtering (`.py`, `utils/`, etc.) and a one-click **Copy Tree** button.
- **Multi-Branch Support:** Switch seamlessly between active branches (`main`, `master`, `dev`, release branches) in real time.
- **Smart Markdown & Syntax Viewer:** Integrated **Prism.js** syntax highlighting with line numbering for all major languages, plus automated Markdown rendering for `README.md` and documentation files.
- **Config & Secret Discovery:** Scans root config files and `.env.example` templates to identify prerequisites and required third-party API keys automatically.

### 2. ⚡ AI Explainer & Architecture Flowcharts
- **Interactive Mermaid Flowcharts:** Generates and renders live architecture diagrams directly inside chat bubbles with zoom, pan, and SVG copy tools.
- **Tailored AI Prompt Modes:**
  - 🛠️ **Setup Guide:** Prerequisites, runtime dependencies, and step-by-step local environment configuration.
  - 🔬 **File Deep Dive:** Line-by-line code explanation, design patterns, and edge case evaluation.
  - 🔌 **API Schema & Working Fields:** Request/response payloads, endpoints, and data model breakdowns.
  - 👶 **ELI5 (Explain Like I'm 5):** Plain English, jargon-free analogies for beginners.
  - 📝 **Exportable Study Notes:** Export your entire explanation history as formatted Markdown files.
- **Drag-and-Drop Code Context:** Drag and drop files from the directory tree straight into the chat box to attach file context into Gemini prompts.

### 3. 🧠 Issue Explainer & Senior Engineering Mentor
- **Pair-Programming Mentorship:** Re-architects GitHub issue troubleshooting like a Senior Staff Engineer.
- **Deep Root-Cause Analysis:** Breaks down underlying assumptions, architectural impacts, and trade-offs rather than generic quick fixes.
- **Ready-to-Use Git Diff Snippets:** Provides concrete pseudocode, patch paths, and unit test regression verification checklists.
- **Direct Issue Search & Infinite Scroll:** Query issues by number (`#66336`), search keywords, or paginate smoothly through open issues.

### 4. 🔐 Security & Personal API Key Vault
- **AES-128 Fernet Encryption:** Save your personal Google Gemini API keys securely in PostgreSQL with symmetric encryption.
- **Zero LocalStorage Leakage:** Activity and sensitive sessions are isolated; non-authenticated users never leak history into client storage.
- **Instant Key Validation:** Verify your Gemini API credentials live with real-time model health checks.

### 5. 🎨 Modern Neo-Brutalist UI
- **Flexible Workspace Views:** Toggle between **Bottom View** (Editor + Wide Chat) and traditional **3-Pane View** (Files | Code | Chat) with synchronized vertical resizing.
- **Dual Theme Support:** Sleek Dark Mode and clean Solar Paper Light Mode.
- **Custom Accent Palettes:** 5 curated complementary color swatches auto-applied to text highlights, buttons, and badges.

---

## 🛠️ Architecture & Tech Stack

```
   ┌────────────────────────────────────────────────────────┐
   │                   Web Frontend                         │
   │  Modern Vanilla JS · Neo-Brutalist CSS · Prism.js      │
   │  Mermaid.js · Marked.js & DOMPurify                    │
   └───────────────────────────┬────────────────────────────┘
                               │ JSON / HTTP
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │                   Django 6.1 Backend                   │
   │  • explorer_views  • issue_views   • vault_views       │
   │  • auth_views      • redis_service • github_service    │
   └───────────────┬────────────────────────────┬───────────┘
                   │                            │
         Psycopg 3 │                  REST APIs │
                   ▼                            ▼
   ┌───────────────────────────┐    ┌───────────────────────┐
   │    PostgreSQL Database    │    │   Google Gemini AI    │
   │  • auth_user  • profiles  │    │  (Flash / Pro Models) │
   │  • vault_keys • chats     │    └───────────────────────┘
   │  • repo_cache (JSONB)     │                │
   └───────────────────────────┘    ┌───────────▼───────────┐
                   ▲                │      GitHub API       │
                   │                │  (Public Trees & API) │
   ┌───────────────┴───────────┐    └───────────────────────┘
   │    Redis Cache & JWT      │
   │  (Sessions & API Tokens)  │
   └───────────────────────────┘
```

- **Backend:** Python 3.12, Django 6.1.1, Psycopg 3 (PostgreSQL Direct Driver)
- **Database:** PostgreSQL (with JSONB for nested Git trees and conversation transcripts)
- **Caching & Sessions:** Redis Cloud / Local Redis
- **Security:** Fernet (AES-128 symmetric encryption via Python `cryptography`)
- **AI Engine:** Google Gemini AI (`gemini-3.1-flash-lite`, `gemini-1.5-pro`)
- **Frontend:** Vanilla JavaScript (ES6+), Vanilla CSS (Responsive Flex/Grid), Prism.js, Mermaid.js, Marked.js, DOMPurify

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.11 or 3.12+
- PostgreSQL database
- (Optional) Redis instance (Local or Redis Cloud)
- Google Gemini API Key ([Get a free key here](https://aistudio.google.com/app/apikey))
- (Optional) GitHub Personal Access Token ([Generate here](https://github.com/settings/tokens))

### 2. Clone the Repository
```bash
git clone https://github.com/SonuSharma10/git_code_explainer.git
cd git_code_explainer
```

### 3. Create and Activate Virtual Environment
```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Configure Environment Variables
Copy the sample environment file:
```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:
```env
SECRET_KEY=your-django-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/github_repo_explainer

# Fernet encryption key for API Vault (Generate using: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
FERNET_KEY=your-generated-fernet-key

# Google Gemini AI credentials
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-3.1-flash-lite
ALLOW_SYSTEM_GEMINI_FALLBACK=True

# GitHub Token (Increases rate limit from 60 to 5,000 requests/hour)
GITHUB_TOKEN=ghp_yourPersonalAccessToken

# Redis Connection URL (Optional but recommended)
REDIS_URL=redis://localhost:6379/0
```

### 6. Run Migrations & Setup Database Tables
```bash
python manage.py migrate
```

### 7. Start the Development Server
```bash
python manage.py runserver
```

Open your browser and visit:
```
http://localhost:8000/explore/
```

---

## 📖 Usage Guide

1. **Mount a Repo:** In the Explorer top bar, paste any public repository (e.g. `pallets/flask` or `https://github.com/facebook/react`) and click **Explain**.
2. **Inspect Files:** Browse files in the directory tree on the left. Click on any file to inspect code with syntax highlighting.
3. **Ask Questions:** Use the AI Explainer prompt bar to ask questions, explain functions, or click **Diagram** to generate an architecture flowchart.
4. **Brainstorm Issues:** Navigate to **Issue Explainer**, enter the repo URL, select any issue, and click **Brainstorm & Understand with Gemini** for senior engineering insights and fix paths.
5. **Manage API Keys:** Click **Profile Vault** in the navbar to securely save and switch between your personal Gemini API keys.

---

## 🔒 Security Best Practices

- **Zero-Storage for Guests:** No chat history or activities are stored locally unless the user is securely authenticated.
- **Hardware-grade Encryption:** Personal API keys saved in the Profile Vault are encrypted with Fernet AES-128 before writing to PostgreSQL.
- **CSRF & Token Validation:** All mutation endpoints enforce Django CSRF protection and sanitized inputs with DOMPurify.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to open an issue or submit a pull request.

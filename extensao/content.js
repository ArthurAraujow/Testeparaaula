// Content script - captures copied text and shows answer overlay

let overlay = null;
let hideTimeout = null;
let lastCopiedText = "";

// ============================================
// 1. CAPTURE COPIED TEXT AUTOMATICALLY
// ============================================

// Listen for copy events to store the text
document.addEventListener("copy", () => {
  setTimeout(() => {
    const selection = window.getSelection().toString().trim();
    if (selection) {
      lastCopiedText = selection;
      // Also store in background for reliability
      chrome.runtime.sendMessage({ action: "store-copied-text", text: selection });
    }
  }, 50);
});

// Also capture Ctrl+C / Ctrl+A+C patterns
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "c") {
    setTimeout(() => {
      const selection = window.getSelection().toString().trim();
      if (selection) {
        lastCopiedText = selection;
        chrome.runtime.sendMessage({ action: "store-copied-text", text: selection });
      }
    }, 50);
  }
});

// ============================================
// 2. OVERLAY MANAGEMENT
// ============================================

function ensureOverlay() {
  // Check if overlay already exists (avoid duplicates from re-injection)
  let existing = document.getElementById("qa-overlay");
  if (existing) {
    overlay = existing;
    return overlay;
  }

  overlay = document.createElement("div");
  overlay.id = "qa-overlay";
  overlay.innerHTML = '<div id="qa-overlay-inner"></div>';

  // Make sure body exists
  if (document.body) {
    document.body.appendChild(overlay);
  } else {
    document.documentElement.appendChild(overlay);
  }

  return overlay;
}

function showOverlay(text, type = "answer") {
  const el = ensureOverlay();
  const inner = el.querySelector("#qa-overlay-inner");

  // Reset classes
  inner.className = "";
  if (type === "loading") inner.classList.add("qa-loading");
  if (type === "error") inner.classList.add("qa-error");

  inner.textContent = text;

  // Force show
  clearTimeout(hideTimeout);
  el.style.display = "block";
  el.classList.remove("qa-visible");

  // Trigger reflow then animate in
  void el.offsetHeight;
  el.classList.add("qa-visible");

  // Auto-hide
  const delay = type === "answer" ? 8000 : type === "error" ? 4000 : 30000;
  hideTimeout = setTimeout(() => {
    el.classList.remove("qa-visible");
    setTimeout(() => {
      el.style.display = "none";
    }, 300);
  }, delay);
}

// ============================================
// 3. MESSAGE HANDLING
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "trigger-answer") {
    handleTrigger();
    sendResponse({ ok: true });
  }
});

async function handleTrigger() {
  // Try multiple sources for the text
  let text = "";

  // Source 1: Currently selected text on page
  const selection = window.getSelection().toString().trim();
  if (selection) {
    text = selection;
  }

  // Source 2: Last copied text (captured by our copy listener)
  if (!text && lastCopiedText) {
    text = lastCopiedText;
  }

  // Source 3: Ask background for stored text
  if (!text) {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "get-copied-text" }, resolve);
      });
      if (response && response.text) {
        text = response.text;
      }
    } catch (e) {
      // ignore
    }
  }

  // Source 4: Try clipboard API (may work on some sites)
  if (!text) {
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      // Clipboard API blocked - that's fine
    }
  }

  if (!text || text.trim().length === 0) {
    showOverlay("Selecione ou copie o texto primeiro", "error");
    return;
  }

  showOverlay("...", "loading");

  // Send to background for Gemini API call
  chrome.runtime.sendMessage(
    { action: "query-ai", text: text.trim() },
    (response) => {
      if (chrome.runtime.lastError) {
        showOverlay("Erro de conexão", "error");
        return;
      }

      if (response && response.success) {
        showOverlay(response.answer, "answer");
      } else {
        showOverlay(response?.error || "Erro", "error");
      }
    }
  );
}

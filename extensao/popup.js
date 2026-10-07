// Popup script - API key & Provider management with live test

const providerSelect = document.getElementById("provider");
const apiKeyInput = document.getElementById("apiKey");
const keyLabel = document.getElementById("keyLabel");
const helpLink = document.getElementById("helpLink");
const freeBadge = document.getElementById("freeBadge");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const statusDot = document.getElementById("statusDot");

const PROVIDER_DATA = {
  groq: {
    label: "Groq API Key",
    placeholder: "gsk_...",
    link: "https://console.groq.com/keys",
    linkText: "Criar chave grátis no Groq →",
    isFree: true
  },
  gemini: {
    label: "Gemini API Key",
    placeholder: "AIza...",
    link: "https://aistudio.google.com/app/apikey",
    linkText: "Criar chave grátis no Google AI Studio →",
    isFree: true
  },
  openai: {
    label: "OpenAI API Key",
    placeholder: "sk-...",
    link: "https://platform.openai.com/api-keys",
    linkText: "Pegar chave da OpenAI →",
    isFree: false
  },
  auto: {
    label: "API Key",
    placeholder: "gsk_... ou AIza... ou sk-...",
    link: "https://console.groq.com/keys",
    linkText: "Criar chave grátis no Groq →",
    isFree: true
  }
};

function updateProviderUI(provider) {
  const data = PROVIDER_DATA[provider] || PROVIDER_DATA.groq;
  keyLabel.textContent = data.label;
  apiKeyInput.placeholder = data.placeholder;
  helpLink.href = data.link;
  helpLink.textContent = data.linkText;
  freeBadge.style.display = data.isFree ? "inline-block" : "none";
}

// Load saved settings
chrome.storage.sync.get(["apiKey", "provider"], ({ apiKey, provider }) => {
  if (provider) {
    providerSelect.value = provider;
  }
  updateProviderUI(providerSelect.value);

  if (apiKey) {
    apiKeyInput.value = apiKey;
    statusDot.className = "header-dot active";
    statusEl.textContent = "Conectado";
    statusEl.className = "status success";
  }
});

// Update UI when provider changes
providerSelect.addEventListener("change", () => {
  updateProviderUI(providerSelect.value);
});

// Auto-detect provider when typing/pasting
apiKeyInput.addEventListener("input", () => {
  const val = apiKeyInput.value.trim();
  if (val.startsWith("gsk_")) {
    providerSelect.value = "groq";
    updateProviderUI("groq");
  } else if (val.startsWith("AIza")) {
    providerSelect.value = "gemini";
    updateProviderUI("gemini");
  } else if (val.startsWith("sk-")) {
    providerSelect.value = "openai";
    updateProviderUI("openai");
  }
});

async function testConnection(provider, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    let activeProvider = provider;
    if (activeProvider === "auto") {
      if (key.startsWith("gsk_")) activeProvider = "groq";
      else if (key.startsWith("AIza")) activeProvider = "gemini";
      else if (key.startsWith("sk-")) activeProvider = "openai";
      else activeProvider = "groq";
    }

    if (activeProvider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { "Authorization": `Bearer ${key}` },
        signal: controller.signal
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Groq erro ${res.status}`);
      }
      return "Groq conectado com sucesso!";
    }

    if (activeProvider === "gemini") {
      let ok = false;
      for (const ver of ["v1beta", "v1"]) {
        const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${key}`, {
          signal: controller.signal
        });
        if (res.ok) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        throw new Error("Chave do Gemini inválida ou sem permissão.");
      }
      return "Gemini conectado com sucesso!";
    }

    if (activeProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${key}` },
        signal: controller.signal
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error?.message || `OpenAI erro ${res.status}`;
        if (res.status === 401) throw new Error("Chave da OpenAI inválida.");
        throw new Error(msg);
      }
      return "OpenAI conectado!";
    }

    return "Chave salva!";
  } finally {
    clearTimeout(timer);
  }
}

saveBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  const provider = providerSelect.value;

  if (!key) {
    statusEl.textContent = "Digite uma chave válida";
    statusEl.className = "status error";
    return;
  }

  saveBtn.disabled = true;
  statusDot.className = "header-dot testing";
  statusEl.textContent = "Testando conexão...";
  statusEl.className = "status testing";

  try {
    const successMsg = await testConnection(provider, key);
    
    // Save to storage
    chrome.storage.sync.set({ apiKey: key, provider }, () => {
      statusDot.className = "header-dot active";
      statusEl.textContent = successMsg;
      statusEl.className = "status success";
    });
  } catch (err) {
    statusDot.className = "header-dot";
    statusEl.textContent = err.message || "Erro na conexão";
    statusEl.className = "status error";

    // Even on test failure, let user save if they want
    chrome.storage.sync.set({ apiKey: key, provider });
  } finally {
    saveBtn.disabled = false;
  }
});

// Save on Enter
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});

// Background service worker - handles commands and AI API calls

let lastCopiedText = "";

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "trigger-answer") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      chrome.tabs.sendMessage(tab.id, { action: "trigger-answer" }, (response) => {
        if (chrome.runtime.lastError) {
          injectAndTrigger(tab.id);
        }
      });
    } catch (e) {
      injectAndTrigger(tab.id);
    }
  }
});

async function injectAndTrigger(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"]
    });
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: "trigger-answer" });
    }, 100);
  } catch (e) {
    console.error("Failed to inject content script:", e);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "store-copied-text") {
    lastCopiedText = message.text;
    return;
  }

  if (message.action === "get-copied-text") {
    sendResponse({ text: lastCopiedText });
    return;
  }

  if (message.action === "query-ai") {
    queryAI(message.text)
      .then((answer) => sendResponse({ success: true, answer }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function queryAI(text) {
  const { apiKey, provider = "auto" } = await chrome.storage.sync.get(["apiKey", "provider"]);

  if (!apiKey || !apiKey.trim()) {
    throw new Error("Configure sua API key no ícone da extensão!");
  }

  const trimmedKey = apiKey.trim();

  // Auto-detect provider if needed
  let activeProvider = provider;
  if (!activeProvider || activeProvider === "auto") {
    if (trimmedKey.startsWith("gsk_")) {
      activeProvider = "groq";
    } else if (trimmedKey.startsWith("AIza")) {
      activeProvider = "gemini";
    } else if (trimmedKey.startsWith("sk-")) {
      activeProvider = "openai";
    } else {
      activeProvider = "groq";
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    if (activeProvider === "groq") {
      return await callGroq(trimmedKey, text, controller.signal);
    } else if (activeProvider === "gemini") {
      return await callGemini(trimmedKey, text, controller.signal);
    } else if (activeProvider === "openai") {
      return await callOpenAI(trimmedKey, text, controller.signal);
    } else {
      return await callGroq(trimmedKey, text, controller.signal);
    }
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Timeout - o servidor demorou para responder.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ========================================================
// 1. GROQ (100% Grátis e Ultra Rápido) - Descoberta Dinâmica
// ========================================================
async function callGroq(apiKey, text, signal) {
  let models = [];

  // Query live model catalog from Groq for this key
  try {
    const listRes = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal
    });

    if (listRes.ok) {
      const data = await listRes.json();
      const allIds = (data.data || []).map(m => m.id);
      models = allIds.filter(id => 
        !id.includes("whisper") && 
        !id.includes("guard") && 
        !id.includes("vision") && 
        !id.includes("embed")
      );

      // Prioritize active chat models
      models.sort((a, b) => {
        const score = (name) => {
          if (name.includes("llama-3.3-70b")) return 10;
          if (name.includes("llama-3.1-8b")) return 9;
          if (name.includes("llama-3")) return 8;
          if (name.includes("llama")) return 7;
          if (name.includes("mixtral")) return 6;
          if (name.includes("gemma")) return 5;
          return 1;
        };
        return score(b) - score(a);
      });
    }
  } catch (e) {
    console.warn("Could not list Groq models:", e);
  }

  if (models.length === 0) {
    models = [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it"
    ];
  }

  let lastErr = null;
  for (const model of models) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "Você é um assistente de respostas rápidas para questões de múltipla escolha. Responda APENAS com a letra da alternativa correta seguida do texto da alternativa. Formato: \"a) texto da alternativa\". Não explique, não justifique, seja direto."
            },
            {
              role: "user",
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 150
        }),
        signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err.error?.message || `Groq Erro ${response.status}`;
        if (response.status === 404 || msg.includes("does not exist") || msg.includes("decommissioned")) {
          lastErr = new Error(msg);
          continue; // Try next model in catalog
        }
        throw new Error(msg);
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content;
      if (!answer) throw new Error("Sem resposta do Groq");
      return answer.trim();
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastErr = e;
    }
  }

  throw lastErr || new Error("Nenhum modelo compatível no Groq.");
}

// ========================================================
// 2. GOOGLE GEMINI (100% Grátis) - Descoberta Dinâmica
// ========================================================
async function callGemini(apiKey, text, signal) {
  let candidates = [];

  // Query ListModels to find active models and supported version
  for (const apiVersion of ["v1beta", "v1"]) {
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/${apiVersion}/models?key=${apiKey}`, { signal });
      if (listRes.ok) {
        const data = await listRes.json();
        const models = (data.models || []).filter(m => 
          m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
        );
        for (const m of models) {
          const modelId = m.name.replace(/^models\//, "");
          candidates.push({ apiVersion, modelId });
        }
        if (candidates.length > 0) break; // Found working version
      }
    } catch (e) {
      console.warn(`Could not list Gemini models for ${apiVersion}:`, e);
    }
  }

  // Sort candidates so flash/fast models come first
  candidates.sort((a, b) => {
    const score = (item) => {
      const id = item.modelId.toLowerCase();
      if (id.includes("2.0-flash")) return 10;
      if (id.includes("flash")) return 9;
      if (id.includes("pro")) return 5;
      return 1;
    };
    return score(b) - score(a);
  });

  if (candidates.length === 0) {
    candidates = [
      { apiVersion: "v1beta", modelId: "gemini-2.0-flash" },
      { apiVersion: "v1beta", modelId: "gemini-1.5-flash-latest" },
      { apiVersion: "v1", modelId: "gemini-1.5-flash" },
      { apiVersion: "v1beta", modelId: "gemini-1.5-pro" },
      { apiVersion: "v1beta", modelId: "gemini-pro" }
    ];
  }

  let lastErr = null;
  for (const { apiVersion, modelId } of candidates) {
    try {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelId}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Você é um assistente de respostas rápidas para questões de múltipla escolha. Responda APENAS com a letra da alternativa correta seguida do texto da alternativa. Formato: \"a) texto da alternativa\". Não explique, não justifique, seja direto.\n\nQuestão:\n" + text
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 150
          }
        }),
        signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err.error?.message || `Gemini Erro ${response.status}`;
        if (response.status === 404 || msg.includes("not found")) {
          lastErr = new Error(msg);
          continue;
        }
        throw new Error(msg);
      }

      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!answer) throw new Error("Sem resposta do Gemini");
      return answer.trim();
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastErr = e;
    }
  }

  throw lastErr || new Error("Nenhum modelo do Gemini disponível.");
}

// ========================================================
// 3. OPENAI / CHATGPT (Requer créditos pagos)
// ========================================================
async function callOpenAI(apiKey, text, signal) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Você é um assistente de respostas rápidas para questões de múltipla escolha. Responda APENAS com a letra da alternativa correta seguida do texto da alternativa. Formato: \"a) texto da alternativa\". Não explique, não justifique, seja direto."
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.1,
      max_tokens: 150
    }),
    signal
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `OpenAI Erro ${response.status}`;
    if (response.status === 429 || msg.includes("quota")) {
      throw new Error("OpenAI sem tokens/créditos. Use Groq ou Gemini que são grátis!");
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content;
  if (!answer) throw new Error("Sem resposta do ChatGPT");
  return answer.trim();
}

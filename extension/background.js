const api = globalThis.browser ?? globalThis.chrome;

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function postForm(url, text) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ q: text }),
  });
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

// Два бесплатных адреса Google. Если один ответил 429, идём на следующий.
const PROVIDERS = [
  {
    name: "clients5",
    async translate(text, target) {
      const params = new URLSearchParams({ client: "dict-chrome-ex", sl: "auto", tl: target });
      const data = await postForm(`https://clients5.google.com/translate_a/t?${params}`, text);
      // Ответ: [["перевод", "en"]]
      const [translation, detected] = Array.isArray(data[0]) ? data[0] : [data[0], ""];
      return { translation, detected };
    },
  },
  {
    name: "gtx",
    async translate(text, target) {
      const params = new URLSearchParams({ client: "gtx", sl: "auto", tl: target, dt: "t" });
      const data = await postForm(`https://translate.googleapis.com/translate_a/single?${params}`, text);
      const translation = (data[0] || []).map((part) => part[0] || "").join("");
      return { translation, detected: data[2] || "" };
    },
  },
];

const COOLDOWN_MS = 5 * 60 * 1000;
const cooledUntil = new Map(); // provider name → timestamp

async function googleTranslate(text, target) {
  const now = Date.now();
  const ready = PROVIDERS.filter((p) => (cooledUntil.get(p.name) || 0) <= now);
  // Если все «остывают», всё равно пробуем все: лучше попытка, чем отказ.
  const order = ready.length ? ready : PROVIDERS;
  let lastError;
  for (const provider of order) {
    try {
      const result = await provider.translate(text, target);
      if (result.translation) return result;
      lastError = new Error("Пустой ответ");
    } catch (err) {
      lastError = err;
      if (err.status === 429) cooledUntil.set(provider.name, Date.now() + COOLDOWN_MS);
    }
  }
  if (lastError?.status === 429) {
    throw new Error("Google временно ограничил запросы (429). Попробуйте через пару минут.");
  }
  throw new Error(lastError?.message || "Сервис перевода недоступен");
}

// Небольшой кэш: повторное выделение того же текста не тратит запрос.
const CACHE_LIMIT = 200;
const cache = new Map();

function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value); // освежаем позицию
  return value;
}

function cacheSet(key, value) {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

// Переводим на основной язык; если текст уже на нём — на второй язык.
async function translate(text, primary, secondary) {
  const key = `${primary}|${secondary}|${text}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let result;
  const first = await googleTranslate(text, primary);
  if (first.detected === primary && secondary && secondary !== primary) {
    result = { ...(await googleTranslate(text, secondary)), target: secondary };
  } else {
    result = { ...first, target: primary };
  }
  cacheSet(key, result);
  return result;
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "translate") return false;
  translate(msg.text, msg.primary, msg.secondary)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // ответ придёт асинхронно
});

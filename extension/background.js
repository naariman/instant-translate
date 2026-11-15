const api = globalThis.browser ?? globalThis.chrome;

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function googleTranslate(text, target) {
  const params = new URLSearchParams({ client: "gtx", sl: "auto", tl: target, dt: "t" });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ q: text }),
  });
  if (!res.ok) throw new Error(`Сервис перевода ответил ${res.status}`);
  const data = await res.json();
  const translation = (data[0] || []).map((part) => part[0] || "").join("");
  return { translation, detected: data[2] || "" };
}

// Переводим на основной язык; если текст уже на нём — на второй язык.
async function translate(text, primary, secondary) {
  const first = await googleTranslate(text, primary);
  if (first.detected === primary && secondary && secondary !== primary) {
    const second = await googleTranslate(text, secondary);
    return { ...second, target: secondary };
  }
  return { ...first, target: primary };
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "translate") return false;
  translate(msg.text, msg.primary, msg.secondary)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // ответ придёт асинхронно
});

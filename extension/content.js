(() => {
  if (window.__instantTranslateLoaded) return;
  window.__instantTranslateLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const MAX_CHARS = 5000;
  const DEFAULTS = { enabled: true, primary: "ru", secondary: "en" };
  const LANG_NAMES = {
    ru: "русский", en: "английский", kk: "казахский", de: "немецкий", fr: "французский",
    es: "испанский", it: "итальянский", tr: "турецкий", zh: "китайский", "zh-CN": "китайский",
    ja: "японский", ko: "корейский", uk: "украинский", uz: "узбекский", ar: "арабский",
  };

  let settings = { ...DEFAULTS };
  let host = null;
  let lastText = "";
  let requestId = 0;

  new Promise((resolve) => {
    const maybe = api.storage.local.get(DEFAULTS, resolve);
    if (maybe?.then) maybe.then(resolve);
  }).then((s) => (settings = { ...DEFAULTS, ...s }));

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
    if (!settings.enabled) closePopup();
  });

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        const maybe = api.runtime.sendMessage(msg, (res) => {
          const err = api.runtime.lastError;
          err ? reject(new Error(err.message)) : resolve(res);
        });
        if (maybe?.then) maybe.then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ---------- выделение ----------

  function getSelectionInfo() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|url|email)?$/i.test(el.type)))) {
      const text = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
      return text.trim() ? { text, rect: el.getBoundingClientRect() } : null;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const text = sel.toString();
    if (!text.trim()) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return { text, rect };
  }

  function isInsidePopup(event) {
    return host && event.composedPath().includes(host);
  }

  document.addEventListener("mousedown", (e) => {
    if (!isInsidePopup(e)) closePopup();
  }, true);

  document.addEventListener("mouseup", (e) => {
    if (!settings.enabled || e.button !== 0 || isInsidePopup(e)) return;
    // даём браузеру завершить выделение
    setTimeout(handleSelection, 10);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
  }, true);

  function handleSelection() {
    const info = getSelectionInfo();
    if (!info) return;
    const text = info.text.trim().slice(0, MAX_CHARS);
    if (host && text === lastText) return;
    lastText = text;
    showPopup(info.rect, text);
  }

  // ---------- окно ----------

  const STYLE = `
    :host { all: initial; }
    .box {
      position: absolute; z-index: 2147483647; box-sizing: border-box;
      width: max-content; max-width: min(420px, calc(100vw - 24px)); min-width: 180px;
      max-height: 320px; display: flex; flex-direction: column;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
      color: #1d1d1f; background: rgba(255,255,255,0.97);
      border: 1px solid rgba(0,0,0,0.12); border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08);
      -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
      animation: pop .12s ease-out;
    }
    @keyframes pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    .text { padding: 10px 14px 6px; overflow: auto; white-space: pre-wrap; word-wrap: break-word; user-select: text; -webkit-user-select: text; }
    .muted { color: #86868b; }
    .error { color: #d70015; }
    .bar {
      display: flex; align-items: center; gap: 8px; padding: 4px 8px 6px 14px;
      font-size: 11.5px; color: #86868b; border-top: 1px solid rgba(0,0,0,0.06);
    }
    .bar span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button {
      all: unset; cursor: pointer; padding: 3px 8px; border-radius: 6px;
      font-size: 11.5px; color: #0066cc;
    }
    button:hover { background: rgba(0,102,204,0.1); }
    @media (prefers-color-scheme: dark) {
      .box { color: #f5f5f7; background: rgba(40,40,42,0.97); border-color: rgba(255,255,255,0.14); }
      .bar { border-top-color: rgba(255,255,255,0.08); }
      button { color: #4da3ff; }
      button:hover { background: rgba(77,163,255,0.15); }
    }
  `;

  function closePopup() {
    requestId++;
    lastText = "";
    host?.remove();
    host = null;
  }

  function showPopup(rect, text) {
    closePopup();
    lastText = text;
    const myId = ++requestId;

    host = document.createElement("instant-translate-popup");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="box" role="dialog" aria-label="Перевод">
        <div class="text muted">Перевожу…</div>
        <div class="bar"><span></span><button type="button" hidden>Копировать</button></div>
      </div>`;
    document.documentElement.appendChild(host);

    const box = root.querySelector(".box");
    const out = root.querySelector(".text");
    const meta = root.querySelector(".bar span");
    const copyBtn = root.querySelector("button");

    place(box, rect);

    sendMessage({ type: "translate", text, primary: settings.primary, secondary: settings.secondary })
      .then((res) => {
        if (myId !== requestId) return;
        if (!res?.ok) throw new Error(res?.error || "Нет ответа от расширения");
        out.classList.remove("muted");
        out.textContent = res.translation;
        meta.textContent = `${langName(res.detected)} → ${langName(res.target)}`;
        copyBtn.hidden = false;
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(res.translation);
            copyBtn.textContent = "Скопировано";
          } catch {
            copyBtn.textContent = "Не удалось";
          }
        };
        place(box, rect);
      })
      .catch((err) => {
        if (myId !== requestId) return;
        out.classList.remove("muted");
        out.classList.add("error");
        out.textContent = `Не получилось перевести: ${err.message}`;
        place(box, rect);
      });
  }

  function langName(code) {
    return LANG_NAMES[code] || code || "?";
  }

  // Под выделением, а если снизу не помещается — над ним.
  function place(box, rect) {
    const margin = 8;
    const { innerWidth: vw, innerHeight: vh, scrollX, scrollY } = window;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let left = Math.min(Math.max(rect.left, 12), vw - w - 12);
    let top = rect.bottom + margin;
    if (top + h > vh - 12 && rect.top - margin - h > 12) top = rect.top - margin - h;
    box.style.left = `${left + scrollX}px`;
    box.style.top = `${top + scrollY}px`;
  }
})();

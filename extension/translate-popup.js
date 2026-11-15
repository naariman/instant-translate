// Окно перевода, общее для выделения текста и субтитров YouTube.
// DOM строится только через createElement/textContent: на YouTube действует
// Trusted Types, и innerHTML там запрещён.
(() => {
  if (globalThis.ITPopup) return;

  const LANG_NAMES = {
    ru: "русский", en: "английский", kk: "казахский", de: "немецкий", fr: "французский",
    es: "испанский", it: "итальянский", tr: "турецкий", zh: "китайский", "zh-CN": "китайский",
    ja: "японский", ko: "корейский", uk: "украинский", uz: "узбекский", ar: "арабский",
  };

  const STYLE = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    .box {
      position: fixed; z-index: 2147483647; box-sizing: border-box;
      width: max-content; max-width: min(420px, calc(100vw - 24px)); min-width: 200px;
      max-height: min(360px, calc(100vh - 24px)); display: flex; flex-direction: column;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
      color: #1d1d1f; background: rgba(255,255,255,0.97);
      border: 1px solid rgba(0,0,0,0.12); border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08);
      -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
      animation: pop .12s ease-out;
    }
    @keyframes pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    .body { padding: 10px 14px 6px; overflow: auto; }
    .text { white-space: pre-wrap; word-wrap: break-word; user-select: text; -webkit-user-select: text; }
    .muted { color: #86868b; }
    .error { color: #d70015; }
    .extra { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.08); }
    .label { font-size: 11px; color: #86868b; margin-bottom: 2px; }
    .bar {
      display: flex; align-items: center; gap: 4px; padding: 4px 6px 6px 14px;
      font-size: 11.5px; color: #86868b; border-top: 1px solid rgba(0,0,0,0.06);
    }
    .meta { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 4px; }
    button {
      all: unset; cursor: pointer; padding: 3px 7px; border-radius: 6px;
      font-size: 11.5px; color: #0066cc; white-space: nowrap;
    }
    button:hover { background: rgba(0,102,204,0.1); }
    button.close { color: #86868b; }
    @media (prefers-color-scheme: dark) {
      .box { color: #f5f5f7; background: rgba(40,40,42,0.97); border-color: rgba(255,255,255,0.14); }
      .bar, .extra { border-top-color: rgba(255,255,255,0.08); }
      button { color: #4da3ff; }
      button:hover { background: rgba(77,163,255,0.15); }
    }
  `;

  let host = null;
  let current = null;
  let requestId = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(text, { title, className, hidden = false } = {}) {
    const b = el("button", className, text);
    b.type = "button";
    if (title) b.title = title;
    b.hidden = hidden;
    return b;
  }

  function langName(code) {
    return LANG_NAMES[code] || code || "?";
  }

  function translate(text) {
    const s = globalThis.ITSettings.current;
    return globalThis.ITSettings
      .sendMessage({ type: "translate", text, primary: s.primary, secondary: s.secondary })
      .then((res) => {
        if (!res?.ok) throw new Error(res?.error || "Нет ответа от расширения");
        return res;
      });
  }

  function speak(text, lang) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (lang) utterance.lang = lang;
    speechSynthesis.speak(utterance);
  }

  // По умолчанию под выделением (а если не помещается — над ним).
  // prefer: "above" — сначала над словом, чтобы не закрывать субтитры.
  function place() {
    if (!current) return;
    const { box, rect, prefer } = current;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const left = Math.min(Math.max(rect.left, 12), Math.max(12, vw - w - 12));
    const above = rect.top - margin - h;
    const below = rect.bottom + margin;
    const fitsAbove = above > 12;
    const fitsBelow = below + h <= vh - 12;
    let top;
    if (prefer === "above") top = fitsAbove ? above : fitsBelow ? below : Math.max(12, vh - h - 12);
    else top = fitsBelow ? below : fitsAbove ? above : Math.max(12, vh - h - 12);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  function showError(out, err) {
    out.className = "text error";
    out.textContent = `Не получилось перевести: ${err.message}`;
  }

  function close(reason = "api", event = null) {
    if (!host) return;
    requestId++;
    const onClose = current?.onClose;
    host.remove();
    host = null;
    current = null;
    if (onClose) {
      try {
        onClose(reason, event);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // extraActions: [{ label, title, getText }] — кнопки, которые переводят
  // дополнительный текст (например, всю строку субтитров) в том же окне.
  function show({ rect, text, extraActions = [], onClose, prefer = "below" } = {}) {
    close("replaced");
    const myId = ++requestId;

    host = document.createElement("instant-translate-popup");
    const root = host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = STYLE;

    const box = el("div", "box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Перевод");
    const body = el("div", "body");
    const out = el("div", "text muted", "Перевожу…");
    body.append(out);

    const bar = el("div", "bar");
    const meta = el("span", "meta");
    const speakBtn = button("🔊", { title: "Произнести", hidden: true });
    const extraBtns = extraActions.map((action) => [action, button(action.label, { hidden: true })]);
    const copyBtn = button("Копировать", { hidden: true });
    const closeBtn = button("✕", { title: "Закрыть (Esc)", className: "close" });
    bar.append(meta, speakBtn, ...extraBtns.map(([, b]) => b), copyBtn, closeBtn);

    box.append(body, bar);
    root.append(style, box);
    (document.fullscreenElement || document.documentElement).appendChild(host);

    current = { box, body, rect, onClose, myId, prefer };
    place();
    closeBtn.addEventListener("click", () => close("button"));

    translate(text)
      .then((res) => {
        if (myId !== requestId) return;
        out.className = "text";
        out.textContent = res.translation;
        meta.textContent = `${langName(res.detected)} → ${langName(res.target)}`;

        speakBtn.hidden = false;
        speakBtn.addEventListener("click", () => speak(text, res.detected));

        copyBtn.hidden = false;
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(res.translation);
            copyBtn.textContent = "Скопировано";
          } catch {
            copyBtn.textContent = "Не удалось";
          }
        });

        for (const [action, btn] of extraBtns) {
          btn.hidden = false;
          btn.addEventListener("click", () => runExtra(action, btn, myId), { once: true });
        }
        place();
      })
      .catch((err) => {
        if (myId !== requestId) return;
        showError(out, err);
        place();
      });
  }

  function runExtra(action, btn, myId) {
    if (!current || current.myId !== myId) return;
    btn.hidden = true;
    const section = el("div", "extra");
    const out = el("div", "text muted", "Перевожу…");
    section.append(el("div", "label", action.title || action.label), out);
    current.body.append(section);
    place();
    translate(action.getText())
      .then((res) => {
        if (myId !== requestId) return;
        out.className = "text";
        out.textContent = res.translation;
        place();
      })
      .catch((err) => {
        if (myId !== requestId) return;
        showError(out, err);
        place();
      });
  }

  function contains(event) {
    return Boolean(host && event.composedPath().includes(host));
  }

  document.addEventListener("mousedown", (e) => {
    if (host && !contains(e)) close("outside", e);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (host && e.key === "Escape") close("escape", e);
  }, true);

  window.addEventListener("scroll", (e) => {
    if (host && !contains(e)) close("scroll", e);
  }, true);

  document.addEventListener("fullscreenchange", () => close("fullscreen"));

  globalThis.ITPopup = {
    show,
    close,
    contains,
    isOpen: () => Boolean(host),
  };
})();

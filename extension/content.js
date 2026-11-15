// Перевод выделенного текста на любой странице. Окно — в translate-popup.js.
(() => {
  if (globalThis.__instantTranslateSelection) return;
  globalThis.__instantTranslateSelection = true;

  const MAX_CHARS = 5000;
  const { ITSettings, ITPopup } = globalThis;
  let lastText = "";

  ITSettings.onChange((s) => {
    if (!s.enabled) ITPopup.close("disabled");
  });

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
    return { text, rect: sel.getRangeAt(0).getBoundingClientRect() };
  }

  function handleSelection() {
    const info = getSelectionInfo();
    if (!info) return;
    const text = info.text.trim().slice(0, MAX_CHARS);
    if (ITPopup.isOpen() && text === lastText) return;
    ITPopup.show({ rect: info.rect, text, onClose: () => { lastText = ""; } });
    lastText = text;
  }

  document.addEventListener("mouseup", (e) => {
    if (!ITSettings.current.enabled || e.button !== 0 || ITPopup.contains(e)) return;
    // даём браузеру завершить выделение
    setTimeout(handleSelection, 10);
  }, true);
})();

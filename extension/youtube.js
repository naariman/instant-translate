// Субтитры YouTube: клик по слову → пауза и перевод, пауза при наведении на субтитры.
//
// Разметку субтитров не меняем: YouTube сам обновляет строки, и подмена его узлов
// может их «заморозить». Поверх нижних субтитров у YouTube лежит невидимый слой
// панели управления, поэтому слово ищем не по event.target, а по координатам:
// перебираем прямоугольники слов через Range.getClientRects(). Подсветку рисуем
// отдельным слоем поверх.
(() => {
  if (globalThis.__instantTranslateYouTube) return;
  globalThis.__instantTranslateYouTube = true;

  const isYouTube = /(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname);
  // Тестовые страницы включают адаптер из основного мира страницы; у расширения
  // свой изолированный мир, и сайт этот флаг подменить не может.
  if (!isYouTube && !globalThis.__instantTranslateYouTubeTest) return;

  const { ITSettings, ITPopup } = globalThis;
  const SEGMENT = ".ytp-caption-segment";
  const CAPTION_WINDOW = ".ytp-caption-window-container .caption-window";
  const PLAYER = ".html5-video-player";
  // Слово: буквы/цифры, внутри допускаются апостроф и дефис (we're, well-known).
  const WORD = /[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}]|['’-](?=[\p{L}\p{N}]))*/gu;

  const wordsOn = () => ITSettings.current.enabled && ITSettings.current.youtubeWords;
  const hoverPauseOn = () => ITSettings.current.enabled && ITSettings.current.youtubeHoverPause;

  let pausedByUs = false;
  let hovering = false;
  let hoverVideo = null;

  // ---------- подсветка слова ----------

  let highlightEl = null;
  function highlight(rect) {
    if (!rect) {
      if (highlightEl) highlightEl.style.display = "none";
      return;
    }
    const container = document.fullscreenElement || document.documentElement;
    if (!highlightEl) highlightEl = document.createElement("instant-translate-highlight");
    if (highlightEl.parentNode !== container) container.appendChild(highlightEl);
    Object.assign(highlightEl.style, {
      position: "fixed",
      zIndex: "2147483646",
      pointerEvents: "none",
      display: "block",
      left: `${rect.left - 2}px`,
      top: `${rect.top - 1}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 2}px`,
      background: "rgba(255, 214, 10, 0.4)",
      borderRadius: "4px",
    });
  }

  ITSettings.onChange(() => {
    if (!wordsOn()) highlight(null);
  });

  // ---------- видео ----------

  function videoFor(node) {
    const player = (node instanceof Element && node.closest(PLAYER)) || document.querySelector(PLAYER);
    return player?.querySelector("video") || document.querySelector("video");
  }

  function pause(video) {
    if (video && !video.paused) {
      video.pause();
      pausedByUs = true;
    }
  }

  function maybeResume(video) {
    if (!pausedByUs || hovering || ITPopup.isOpen()) return;
    pausedByUs = false;
    const p = video?.play();
    if (p?.catch) p.catch(() => {});
  }

  // Видео запустили вручную — наша пауза больше не действует.
  document.addEventListener("play", (e) => {
    if (e.target instanceof HTMLVideoElement) pausedByUs = false;
  }, true);

  // ---------- поиск по координатам ----------

  function inside(rect, x, y, pad = 0) {
    return rect.width > 0 && x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
  }

  function captionWindowAt(x, y) {
    for (const win of document.querySelectorAll(CAPTION_WINDOW)) {
      if (inside(win.getBoundingClientRect(), x, y)) return win;
    }
    return null;
  }

  function wordAt(x, y) {
    for (const segment of document.querySelectorAll(SEGMENT)) {
      if (!inside(segment.getBoundingClientRect(), x, y)) continue;
      const walker = document.createTreeWalker(segment, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.data.matchAll(WORD)) {
          if (!/\p{L}/u.test(match[0])) continue;
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          for (const rect of range.getClientRects()) {
            if (inside(rect, x, y, 1)) return { text: match[0], rect, segment };
          }
        }
      }
    }
    return null;
  }

  function lineText(segment) {
    const win = segment.closest(CAPTION_WINDOW) || segment.parentElement;
    return [...win.querySelectorAll(SEGMENT)]
      .map((s) => s.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------- наведение: подсветка и пауза ----------

  function leaveCaptions() {
    if (!hovering) return;
    hovering = false;
    highlight(null);
    const video = hoverVideo;
    setTimeout(() => maybeResume(video), 0);
  }

  let lastMove = null;
  let moveScheduled = false;

  function onPointerMoved() {
    moveScheduled = false;
    const ev = lastMove;
    if (!ev) return;
    const win = ITPopup.contains(ev) ? null : captionWindowAt(ev.clientX, ev.clientY);
    if (win && !hovering) {
      hovering = true;
      hoverVideo = videoFor(win);
      if (hoverPauseOn()) pause(hoverVideo);
    } else if (!win) {
      leaveCaptions();
    }
    highlight(win && wordsOn() ? wordAt(ev.clientX, ev.clientY)?.rect : null);
  }

  window.addEventListener("mousemove", (e) => {
    lastMove = e;
    if (moveScheduled) return;
    moveScheduled = true;
    requestAnimationFrame(onPointerMoved);
  }, { capture: true, passive: true });

  // Курсор ушёл за пределы окна.
  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget) {
      lastMove = null;
      leaveCaptions();
    }
  }, true);

  // ---------- клик по слову ----------

  const interceptable = (e) => wordsOn() && e.button === 0 && !ITPopup.contains(e);

  // Плеер не должен получить эти события: иначе он ставит паузу/играет
  // или начинает перетаскивать окно субтитров.
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick"]) {
    window.addEventListener(type, (e) => {
      if (!interceptable(e) || !wordAt(e.clientX, e.clientY)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
  }

  window.addEventListener("click", (e) => {
    if (!interceptable(e)) return;
    const word = wordAt(e.clientX, e.clientY);
    if (!word) return;
    e.stopImmediatePropagation();
    e.preventDefault();

    const video = videoFor(word.segment);
    pause(video);
    highlight(null);

    const line = lineText(word.segment);
    ITPopup.show({
      rect: word.rect,
      text: word.text,
      prefer: "above",
      extraActions: line && line !== word.text
        ? [{ label: "Вся строка", title: `Строка: ${line}`, getText: () => line }]
        : [],
      onClose: (reason, event) => {
        if (reason === "replaced") return;
        // Клик по плееру сам переключит паузу — не мешаем ему.
        if (reason === "outside" && event?.target instanceof Element && event.target.closest(PLAYER)) {
          pausedByUs = false;
          return;
        }
        setTimeout(() => maybeResume(video), 0);
      },
    });
  }, true);
})();

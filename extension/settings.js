// Общие настройки и обмен сообщениями. Подключается первым во всех content-скриптах
// и в меню расширения (popup.html).
(() => {
  if (globalThis.ITSettings) return;

  const api = globalThis.browser ?? globalThis.chrome;
  const DEFAULTS = Object.freeze({
    enabled: true,
    primary: "ru",
    secondary: "en",
    youtubeWords: true,
    youtubeHoverPause: true,
  });
  const listeners = new Set();

  const ITSettings = {
    DEFAULTS,
    current: { ...DEFAULTS },
    load() {
      return Promise.resolve(api.storage.local.get(DEFAULTS)).then((s) => {
        ITSettings.current = { ...DEFAULTS, ...s };
        return ITSettings.current;
      });
    },
    save(patch) {
      return api.storage.local.set(patch);
    },
    onChange(cb) {
      listeners.add(cb);
    },
    sendMessage(msg) {
      return Promise.resolve(api.runtime.sendMessage(msg));
    },
  };

  ITSettings.ready = ITSettings.load().catch(() => ITSettings.current);

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) ITSettings.current[key] = newValue;
    for (const cb of listeners) cb(ITSettings.current, changes);
  });

  globalThis.ITSettings = ITSettings;
})();

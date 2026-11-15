// Заглушка API расширения для тестовых страниц: тот же код background.js и
// content-скриптов работает в обычной вкладке, без Safari.
(() => {
  const messageListeners = [];
  const changeListeners = [];
  const store = {};

  globalThis.chrome = {
    runtime: {
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      sendMessage: (msg) =>
        new Promise((resolve) => messageListeners.forEach((fn) => fn(msg, {}, resolve))),
    },
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...store }),
        set: async (patch) => {
          const changes = {};
          for (const [key, value] of Object.entries(patch)) changes[key] = { oldValue: store[key], newValue: value };
          Object.assign(store, patch);
          changeListeners.forEach((fn) => fn(changes, "local"));
        },
      },
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
  };

  // Запоминаем, что просили произнести, вместо реального звука.
  globalThis.spoken = [];
  if ("speechSynthesis" in window) {
    speechSynthesis.speak = (u) => globalThis.spoken.push({ text: u.text, lang: u.lang });
  }
})();

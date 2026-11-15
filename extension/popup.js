const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { enabled: true, primary: "ru", secondary: "en" };
const LANGS = [
  ["ru", "Русский"], ["en", "Английский"], ["kk", "Казахский"], ["uk", "Украинский"],
  ["uz", "Узбекский"], ["de", "Немецкий"], ["fr", "Французский"], ["es", "Испанский"],
  ["it", "Итальянский"], ["tr", "Турецкий"], ["zh-CN", "Китайский"], ["ja", "Японский"],
  ["ko", "Корейский"], ["ar", "Арабский"],
];

const $ = (id) => document.getElementById(id);

for (const id of ["primary", "secondary"]) {
  for (const [code, name] of LANGS) $(id).add(new Option(name, code));
}

function load() {
  return new Promise((resolve) => {
    const maybe = api.storage.local.get(DEFAULTS, resolve);
    if (maybe?.then) maybe.then(resolve);
  });
}

load().then((s) => {
  $("enabled").checked = s.enabled;
  $("primary").value = s.primary;
  $("secondary").value = s.secondary;
});

$("enabled").addEventListener("change", (e) => api.storage.local.set({ enabled: e.target.checked }));
$("primary").addEventListener("change", (e) => api.storage.local.set({ primary: e.target.value }));
$("secondary").addEventListener("change", (e) => api.storage.local.set({ secondary: e.target.value }));

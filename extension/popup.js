const LANGS = [
  ["ru", "Русский"], ["en", "Английский"], ["kk", "Казахский"], ["uk", "Украинский"],
  ["uz", "Узбекский"], ["de", "Немецкий"], ["fr", "Французский"], ["es", "Испанский"],
  ["it", "Итальянский"], ["tr", "Турецкий"], ["zh-CN", "Китайский"], ["ja", "Японский"],
  ["ko", "Корейский"], ["ar", "Арабский"],
];
const CHECKBOXES = ["enabled", "youtubeWords", "youtubeHoverPause"];
const SELECTS = ["primary", "secondary"];

const $ = (id) => document.getElementById(id);

for (const id of SELECTS) {
  for (const [code, name] of LANGS) $(id).add(new Option(name, code));
}

ITSettings.ready.then((s) => {
  for (const id of CHECKBOXES) $(id).checked = s[id];
  for (const id of SELECTS) $(id).value = s[id];
});

for (const id of CHECKBOXES) {
  $(id).addEventListener("change", (e) => ITSettings.save({ [id]: e.target.checked }));
}
for (const id of SELECTS) {
  $(id).addEventListener("change", (e) => ITSettings.save({ [id]: e.target.value }));
}

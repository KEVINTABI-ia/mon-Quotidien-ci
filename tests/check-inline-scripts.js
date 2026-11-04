const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)];
let checked = 0;

for (let index = 0; index < scripts.length; index++) {
  const attributes = scripts[index][1] || "";
  const source = scripts[index][2] || "";
  if (/\\bsrc\\s*=/.test(attributes) || !source.trim()) continue;
  new vm.Script(source, { filename: `index.html:inline-script-${index + 1}` });
  checked++;
}

for (const name of ["enregistrerCommande", "affecterCommandePartenaire", "migrerAnciennesCommandesPrivees"]) {
  const pattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "g");
  const count = [...html.matchAll(pattern)].length;
  if (count !== 1) {
    throw new Error(`Expected exactly one ${name} function; found ${count}.`);
  }
}

console.log(`Syntax OK: ${checked} inline scripts checked; critical handlers are unique.`);

import fs from "node:fs/promises";
const [a, b] = [process.argv[2], process.argv[3]];
const A = JSON.parse(await fs.readFile(`eval/out/${a}.json`, "utf8"));
const B = JSON.parse(await fs.readFile(`eval/out/${b}.json`, "utf8"));
let pior = false;
const linha = (n, x, y) => {
  const d = y - x, ruim = d < -0.3;
  if (ruim) pior = true;
  console.log(`${n.padEnd(10)} ${x.toFixed(2)} -> ${y.toFixed(2)} (${d > 0 ? "+" : ""}${d.toFixed(2)})${ruim ? "  REGRESSÃO" : ""}`);
};
linha("geral", A.media, B.media);
for (const k of Object.keys(A.porCat)) linha(k, A.porCat[k] ?? 0, B.porCat[k] ?? 0);
process.exit(pior ? 1 : 0);

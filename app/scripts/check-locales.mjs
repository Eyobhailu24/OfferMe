import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function catalog(file, variable) {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let result = {};
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === variable
    ) {
      let value = node.initializer;
      if (ts.isSatisfiesExpression(value)) value = value.expression;
      if (ts.isObjectLiteralExpression(value))
        for (const entry of value.properties)
          if (
            ts.isPropertyAssignment(entry) &&
            ts.isArrayLiteralExpression(entry.initializer)
          )
            result[entry.name.text] = entry.initializer.elements.map(
              (v) => v.text,
            );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}
const words = {
  ...catalog("locale.ts", "words"),
  ...catalog("extra-words.ts", "extraWords"),
};
let errors = 0;
for (const [key, values] of Object.entries(words))
  if (values.length !== 3 || values.some((v) => !v?.trim())) {
    console.error("Missing locale value for " + key);
    errors++;
  }
const walk = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(path, e.name)) : [join(path, e.name)],
  );
for (const file of ["app", "src"]
  .flatMap((dir) => walk(join(root, dir)))
  .filter((f) => /\.tsx?$/.test(f))) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "t" &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      !words[node.arguments[0].text]
    ) {
      console.error(file + ": missing translation " + node.arguments[0].text);
      errors++;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (errors) process.exitCode = 1;
else
  console.info(
    "English, Amharic and Afaan Oromo catalogs cover " +
      Object.keys(words).length +
      " keys and all literal UI references.",
  );

// React Native cannot render bare text directly inside layout components.
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
function scan(directory) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!path.endsWith(".tsx")) continue;
    const source = ts.createSourceFile(
      path, readFileSync(join(root, path), "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
    );
    function visit(node) {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText(source);
        if (tag !== "Text" && tag !== "Animated.Text") {
          for (const child of node.children) {
            const bareText = ts.isJsxText(child) && child.text.trim().length > 0;
            const literal = ts.isJsxExpression(child) && child.expression;
            const bareLiteral = literal && (
              (ts.isStringLiteral(literal) && literal.text.length > 0) ||
              ts.isNumericLiteral(literal)
            );
            if (bareText || bareLiteral) {
              const line = source.getLineAndCharacterOfPosition(child.getStart(source)).line + 1;
              console.error(`${path}:${line}: Wrap text inside <${tag}> in <Text>.`);
              failures++;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan("app");
scan("src");
if (failures) process.exitCode = 1;
else console.info("Native JSX check passed: no bare text in layout components.");

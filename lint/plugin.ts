import { definePlugin, defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const allowedComment =
  /^(?:(?:oxlint|eslint)-disable-(?:next-line|line)|@ts-expect-error)(?:\s|$)/u;
const tripleSlashReference = /^\/\s*<reference\s[^>]*\/?>\s*$/u;

export const noComments = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Allow only scoped lint and type directives and required syntax comments.",
    },
  },
  create(context) {
    return {
      Program(program) {
        for (const comment of program.comments) {
          const value = comment.value.trim();
          if (
            comment.type === "Shebang" ||
            allowedComment.test(value) ||
            (comment.type === "Line" && tripleSlashReference.test(value))
          ) {
            continue;
          }
          context.report({
            message:
              "Express intent in names and types. Only scoped lint and type directives and required syntax comments are allowed.",
            loc: context.sourceCode.getLoc(comment),
          });
        }
      },
    };
  },
});

const testRunners = ["it", "test"];
const assertions = ["expect", "expectTypeOf", "assertType", "assert"];

function rootName(node: ESTree.Node): string | null {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return rootName(node.object);
  if (node.type === "CallExpression") return rootName(node.callee);
  return null;
}

function isRunner(callee: ESTree.Node, method: string | null): boolean {
  if (callee.type === "Identifier") return method === null && testRunners.includes(callee.name);
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    testRunners.includes(callee.object.name) &&
    callee.property.type === "Identifier" &&
    (method === null ? callee.property.name !== "each" : callee.property.name === method)
  );
}

function isTest(call: ESTree.CallExpression): boolean {
  return (
    isRunner(call.callee, null) ||
    (call.callee.type === "CallExpression" && isRunner(call.callee.callee, "each"))
  );
}

export const noTestWithoutAssertion = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Require an assertion in every test callback." },
  },
  create(context) {
    const openTests: boolean[] = [];
    return {
      CallExpression(call) {
        if (isTest(call)) {
          openTests.push(false);
        } else if (assertions.includes(rootName(call.callee) ?? "")) {
          openTests.fill(true);
        }
      },
      "CallExpression:exit"(call: ESTree.CallExpression) {
        if (isTest(call) && openTests.pop() === false) {
          context.report({
            message:
              "This test asserts nothing. Compare what a caller gets with a value written out by hand, or delete the test.",
            node: call.callee,
          });
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: "local" },
  rules: { "no-comments": noComments, "no-test-without-assertion": noTestWithoutAssertion },
});

import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noComments, noTestWithoutAssertion } from "../../lint/plugin";

RuleTester.describe = describe;
RuleTester.it = it;

const commentMessage =
  "Express intent in names and types. Only scoped lint and type directives and required syntax comments are allowed.";
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("no-comments", noComments, {
  valid: [
    "// oxlint-disable-next-line eqeqeq -- fixture exercises coercion\nconst same = 1 == 1;",
    "const same = 1 == 1; // oxlint-disable-line eqeqeq -- fixture exercises coercion",
    "// eslint-disable-next-line eqeqeq -- fixture exercises coercion\nconst same = 1 == 1;",
    "const same = 1 == 1; // eslint-disable-line eqeqeq -- fixture exercises coercion",
    "// @ts-expect-error -- fixture exercises invalid input\nconst value: number = 'x';",
    '/// <reference types="vite/client" />',
    "#!/usr/bin/env node\nconst value = 1;",
  ],
  invalid: [
    {
      code: "// Skip empty lines.\nconst lines = [];",
      errors: [{ message: commentMessage, line: 1 }],
    },
    { code: "const lines = []; /* trailing */", errors: [{ message: commentMessage, line: 1 }] },
    {
      code: "/** Seconds between the recording start and the VOD start. */\nexport const offset = 1;",
      errors: [{ message: commentMessage, line: 1 }],
    },
    {
      code: "/** Builds the overlay. */\nexport default function render() {}",
      errors: [{ message: commentMessage, line: 1 }],
    },
    {
      code: "/** Not exported. */\nconst offset = 1;",
      errors: [{ message: commentMessage, line: 1 }],
    },
    {
      code: "/** Too far away. */\nconst gap = 0;\nexport const offset = 1;",
      errors: [{ message: commentMessage, line: 1 }],
    },
    {
      code: ["/*", "oxlint-disable", "eqeqeq -- fixture exercises coercion */"].join(" "),
      errors: [{ message: commentMessage, line: 1 }],
    },
    {
      code: ["/*", "eslint-disable", "eqeqeq -- fixture exercises coercion */"].join(" "),
      errors: [{ message: commentMessage, line: 1 }],
    },
    {
      code: "// oxlint-disable-next-line-explanation\nconst value = 1;",
      errors: [{ message: commentMessage, line: 1 }],
    },
  ],
});

const assertionMessage =
  "This test asserts nothing. Compare what a caller gets with a value written out by hand, or delete the test.";

tester.run("no-test-without-assertion", noTestWithoutAssertion, {
  valid: [
    'test("adds", () => { expect(1 + 1).toBe(2); });',
    'it.only("adds", () => { expect.soft(1 + 1).toBe(2); });',
    'test("rejects", async () => { await expect(load()).rejects.toThrow("gone"); });',
    'test.each([1, 2])("keeps %i", (n) => { expect(n).toBe(n); });',
  ],
  invalid: [
    {
      code: 'test("adds", () => { add(1, 1); });',
      errors: [{ message: assertionMessage, line: 1 }],
    },
    {
      code: 'test.each([1, 2])("keeps %i", (n) => { keep(n); });',
      errors: [{ message: assertionMessage, line: 1 }],
    },
    {
      code: 'it.skip("adds", () => {});',
      errors: [{ message: assertionMessage, line: 1 }],
    },
  ],
});

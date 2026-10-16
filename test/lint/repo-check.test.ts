import { describe, expect, test } from "vitest";
import { problemsIn } from "../../lint/repo-check";

describe("the repo check keeps machine paths and whole-file lint switches out of the repository", () => {
  test("flags a home directory path", () => {
    const homeManifest = ["", "Users", "someone", "plugin", "manifest.json"].join("/");
    expect(problemsIn("notes.md", `Load ${homeManifest}`)).toEqual([
      "notes.md:1 has a path into someone's home directory. Use a path relative to the repository, or read the home directory at run time.",
    ]);
  });

  test("flags a whole-file lint suppression in code", () => {
    const suppression = ["/*", "oxlint-disable", "*/"].join(" ");
    expect(problemsIn("src/api.ts", `const a = 1;\n${suppression}`)).toEqual([
      "src/api.ts:2 switches lint off for the whole file. Put the exception on the offending line with a reason, or change the rule in .oxlintrc.json.",
    ]);
  });

  test("allows a one-line suppression and a relative path", () => {
    expect(
      problemsIn(
        "src/api.ts",
        "// oxlint-disable-next-line eqeqeq\nconst path = './dist/manifest.json';",
      ),
    ).toEqual([]);
  });
});

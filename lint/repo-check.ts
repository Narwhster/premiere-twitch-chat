const homePath = /\/(?:Users|home)\/[\w.-]+\//u;
const wholeFileSuppression =
  /(?:\/\/|\/\*)\s*(?:(?:oxlint|eslint)-disable(?!-(?:next-)?line)|@ts-nocheck)/u;
const linted = /\.[cm]?[jt]sx?$/u;

export function problemsIn(file: string, text: string): string[] {
  return text
    .split("\n")
    .flatMap((line, index) => [
      ...(homePath.test(line)
        ? [
            `${file}:${index + 1} has a path into someone's home directory. Use a path relative to the repository, or read the home directory at run time.`,
          ]
        : []),
      ...(linted.test(file) && wholeFileSuppression.test(line)
        ? [
            `${file}:${index + 1} switches lint off for the whole file. Put the exception on the offending line with a reason, or change the rule in .oxlintrc.json.`,
          ]
        : []),
    ]);
}

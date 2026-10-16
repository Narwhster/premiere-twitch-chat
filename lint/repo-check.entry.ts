import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { problemsIn } from "./repo-check.ts";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => file !== "" && statSync(file, { throwIfNoEntry: false })?.isFile() === true);
const found = files.flatMap((file) => problemsIn(file, readFileSync(file, "utf8")));
if (found.length > 0) {
  console.error(found.join("\n"));
  process.exit(1);
}

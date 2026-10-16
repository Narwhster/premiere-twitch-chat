import { expect, test } from "vitest";
import { parseSettings } from "../../../webview-ui/src/settings/settings";

test("settings saved before Width, Lines and Quality existed keep their choices", () => {
  expect(parseSettings('{"animation":"typing","background":false,"theme":"light"}')).toEqual({
    animation: "typing",
    background: false,
    theme: "light",
    width: 340,
    lines: null,
    quality: 2,
  });
});

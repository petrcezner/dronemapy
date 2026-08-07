import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "extension/dist/", "node_modules/", "graphify-out/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["extension/src/**/*.ts", "extension/types/**/*.ts"],
  }
);

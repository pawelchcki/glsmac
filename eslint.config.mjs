import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["scripts/generated/**"] },
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
);

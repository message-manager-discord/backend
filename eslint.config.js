import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".nyc_output/**",
      "logs/**",
      "prisma/generated/**",
      "src/generated/prisma/**",
    ],
  },

  eslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],

    extends: [
      tseslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
    ],

    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["prisma.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },

    plugins: {
      "simple-import-sort": simpleImportSort,
    },

    rules: {
      // TypeScript correctness
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
        },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",

      // Promise safety
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
          },
        },
      ],
      "@typescript-eslint/await-thenable": "error",

      // Type safety
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",

      // Useful but potentially noisy
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",

      // Imports
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",
    },
  },

  prettier,
);

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  plugins: {
    "react-hooks": reactHooks,
    "react": reactPlugin,
  },
  rules: {
    // TypeScript rules - re-enable critical checks
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/prefer-as-const": "error",
    // require() is legitimately used in the CJS launcher (launcher.cjs)
    "@typescript-eslint/no-require-imports": "off",

    // React hooks rules
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/set-state-in-effect": "warn",
    // Disabled pre-existing noise from inherited configs
    "react-hooks/purity": "off",

    // React rules
    "react/no-unescaped-entities": "warn",
    "react/display-name": "warn",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "warn",
    "@next/next/no-html-link-for-pages": "warn",

    // General JavaScript rules - re-enable critical checks
    "prefer-const": "warn",
    "no-unused-vars": "off", // handled by @typescript-eslint/no-unused-vars
    "no-debugger": "error",
    "no-empty": "warn",
    "no-irregular-whitespace": "error",
    "no-case-declarations": "error",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "warn",
    "no-redeclare": "error",
    "no-undef": "off", // handled by TypeScript
    "no-unreachable": "error",
    "no-useless-escape": "warn",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "coverage/**", "prisma/generated/**", "scratch/**", "scripts/**"]
}];

export default eslintConfig;

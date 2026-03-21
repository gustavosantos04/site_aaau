const { FlatCompat } = require("@eslint/eslintrc");
const nextVitals = require("eslint-config-next/core-web-vitals");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  ...compat.config(nextVitals),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "legacy-vite-src/**",
      "index.html",
      "vite.config.js",
    ],
  },
];

const path = require("path");
const process = require("process");

// define preprocessor variables
const opts = {
  ENV: process.env.SKYNET_MYSKY_ENV || "production",
};

module.exports = {
  entry: {
    "permissions-display": path.resolve(__dirname, 'scripts/permissions-display.ts'),
    "permissions": path.resolve(__dirname, 'scripts/permissions.ts'),
    "portal-connect": path.resolve(__dirname, 'scripts/portal-connect.ts'),
    "seed-display": path.resolve(__dirname, 'scripts/seed-display.ts'),
    "seed-selection": path.resolve(__dirname, 'scripts/seed-selection.ts'),
    "ui": path.resolve(__dirname, 'scripts/ui.ts'),
  },
  mode: "production",

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          { loader: "ts-loader", options: { configFile: "tsconfig.scripts.json" } },
          { loader: "ifdef-loader", options: opts },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: false,
    fallback: {
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("stream-browserify"),
    },
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: `[name].js`,
  },
};

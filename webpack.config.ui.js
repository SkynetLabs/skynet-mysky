const path = require("path");

module.exports = {
  entry: "./scripts/ui.ts",
  mode: "production",

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: { configFile: "tsconfig.scripts.json" },
        include: [path.resolve(__dirname, "scripts/ui.ts")],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: false,
  },
  output: {
    filename: "ui.js",
    path: path.resolve(__dirname, "dist"),
  },
};

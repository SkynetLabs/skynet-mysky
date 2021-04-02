const path = require("path");

module.exports = {
  entry: "./scripts/router.ts",
  mode: "production",

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: { configFile: "tsconfig.scripts.json" },
        include: [path.resolve(__dirname, "scripts/router.ts")],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: false,
  },
  output: {
    filename: "router.js",
    path: path.resolve(__dirname, "dist"),
  },
};

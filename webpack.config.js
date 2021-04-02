const path = require("path");

module.exports = {
  entry: "./src/index.ts",
  mode: "production",

  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: false,
  },
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist"),
  },
};

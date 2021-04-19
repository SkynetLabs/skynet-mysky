const path = require("path");

// define preprocessor variables
const opts = {
  ENV: process.env.SKYNET_MYSKY_ENV || "production",
};

module.exports = {
  entry: "./src/index.ts",
  mode: "production",

  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          { loader: "ifdef-loader", options: opts },
          { loader: "ts-loader" },
        ],
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

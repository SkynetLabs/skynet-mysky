const path = require("path");
const process = require("process");

// define preprocessor variables
const opts = {
  ENV: process.env.SKYNET_MYSKY_ENV || "production",
};

module.exports = {
  entry: ["./src/index.ts"],
  mode: "production",

  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        // prettier-ignore
        use: [
          { loader: "ts-loader" },
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
    filename: "main.js",
    path: path.resolve(__dirname, "dist"),
  },
};

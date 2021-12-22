const path = require("path");

// define preprocessor variables
const opts = {
  ENV: process.env.SKYNET_MYSKY_ENV || "production",
};

module.exports = {
  entry: [
    // Provide polyfill for Promise.any for Opera.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any#browser_compatibility
    "core-js/stable/promise/any",
    "./src/index.ts",
  ],
  mode: "production",

  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        // prettier-ignore
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

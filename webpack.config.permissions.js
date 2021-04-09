const path = require("path");

const name = "permissions";

// define preprocessor variables
const opts = {
  ENV: process.env.SKYNET_MYSKY_ENV || "production",
};

module.exports = {
  entry: `./scripts/${name}.ts`,
  mode: "production",

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          { loader: "ifdef-loader", options: opts },
          { loader: "ts-loader", options: { configFile: "tsconfig.scripts.json" } },
        ],
        include: [path.resolve(__dirname, `scripts/${name}.ts`)],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: false,
  },
  output: {
    filename: `${name}.js`,
    path: path.resolve(__dirname, "dist"),
  },
};

#!/usr/bin/env node
"use strict";

require("../lib/cli").main(process.argv.slice(2)).catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});

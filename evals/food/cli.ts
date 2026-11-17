import { main } from "./run.js";

process.exitCode = await main({
  argv: process.argv.slice(2),
  env: process.env,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
});

import { currentPackage } from "./build.mjs";
process.stdout.write(JSON.stringify(currentPackage(process.argv[2])));

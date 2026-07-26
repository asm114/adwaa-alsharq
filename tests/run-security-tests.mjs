import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=path.dirname(fileURLToPath(import.meta.url));
const self=path.basename(fileURLToPath(import.meta.url));
const tests=readdirSync(directory)
  .filter(name => name.endsWith('.test.mjs') && name!==self)
  .sort();

for(const test of tests){
  const result=spawnSync(process.execPath,[path.join(directory,test)],{
    cwd:path.resolve(directory,'..'),
    encoding:'utf8',
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.status!==0){
    process.stderr.write(`FAILED: ${test}\n`);
    process.exit(result.status||1);
  }
}
console.log(`security-suite: ${tests.length} test files passed`);

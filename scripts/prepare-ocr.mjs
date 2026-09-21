import { createRequire } from 'node:module';
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const target = new URL('../public/ocr/', import.meta.url);
await mkdir(target, {recursive:true});
const engine = path.dirname(require.resolve('tesseract.js/package.json'));
const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
const language = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
await copyFile(path.join(engine, 'dist/worker.min.js'), new URL('worker.min.js', target));
for (const name of await readdir(core)) {
  if (name.endsWith('.wasm') || name.endsWith('.wasm.js')) await copyFile(path.join(core,name), new URL(name,target));
}
await copyFile(path.join(language,'4.0.0/eng.traineddata.gz'),new URL('eng.traineddata.gz',target));
console.log('Local OCR engine and English model ready.');

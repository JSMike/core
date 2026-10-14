/*
 * Copyright (c) 2016-2023 VMware, Inc. All Rights Reserved.
 * This software is released under MIT license.
 * The full license information can be found in LICENSE in the root directory of this project.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript-cem-test';

const packageDir = resolve('dist/lib');
const manifest = JSON.parse(readFileSync(join(packageDir, 'custom-elements.json'), 'utf8'));
const directory = mkdtempSync(join(tmpdir(), 'clarity-manifest-'));
try {
  mkdirSync(join(directory, 'node_modules/@cds'), { recursive: true });
  symlinkSync(packageDir, join(directory, 'node_modules/@cds/core'), 'dir');
  const file = join(directory, 'consumer.mts');
  const declarations = manifest.modules.flatMap(module =>
    (module.declarations ?? []).filter(declaration => declaration.tagName).map(declaration => ({ module, declaration }))
  );
  assert.ok(declarations.length > 0);
  writeFileSync(
    file,
    declarations
      .map(
        ({ module, declaration }, index) =>
          `import type { ${declaration.name} as Element${index} } from '@cds/core/${module.path}';`
      )
      .join('\n')
  );
  const program = ts.createProgram([file], {
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    types: [],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2020,
  });
  assert.ok(program.getSourceFile(file), 'The consumer source must be included in the compilation');
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: name => name,
      getCurrentDirectory: () => directory,
      getNewLine: () => '\n',
    })
  );

  const button = declarations.find(({ declaration }) => declaration.tagName === 'cds-button').declaration;
  for (const record of [
    button.members.find(member => member.name === 'loadingState'),
    button.attributes.find(attribute => attribute.name === 'loadingState'),
  ]) {
    assert.equal(record.type.text, "'default' | 'loading' | 'success' | 'error'");
    assert.ok(record.description.startsWith('Changes the button content based on the value passed.'));
    assert.ok(record.description.includes('- `default`: shows the content of the button'));
  }
  console.log(`Validated ${declarations.length} manifest class imports and loading-state literal values.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

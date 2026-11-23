import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_TOOLS, routeNaturalCommandToTool } from './toolsData';

test('routes natural commands to real tools', () => {
  const t1 = routeNaturalCommandToTool('remove background from my logo', INITIAL_TOOLS);
  assert.equal(t1?.id, 'background-remover');

  const t2 = routeNaturalCommandToTool('compress invoice pdf file', INITIAL_TOOLS);
  assert.equal(t2?.id, 'pdf-compressor');

  const t3 = routeNaturalCommandToTool('translate this text to Roman Urdu', INITIAL_TOOLS);
  assert.equal(t3?.id, 'text-translator');

  const t4 = routeNaturalCommandToTool('edit vertical video clip on timeline', INITIAL_TOOLS);
  assert.equal(t4?.id, 'video-studio');

  const t5 = routeNaturalCommandToTool('encrypt secret text with aes', INITIAL_TOOLS);
  assert.equal(t5?.id, 'crypto-vault');

  const t6 = routeNaturalCommandToTool('convert json to csv', INITIAL_TOOLS);
  assert.equal(t6?.id, 'data-formatter');

  const t7 = routeNaturalCommandToTool('connect tools in workflow dag visualizer', INITIAL_TOOLS);
  assert.equal(t7?.id, 'workflow-dag');

  const t8 = routeNaturalCommandToTool('random unmapped query xyz', INITIAL_TOOLS);
  assert.equal(t8, null);
});

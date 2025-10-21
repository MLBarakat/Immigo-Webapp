const { build } = require('esbuild');
const path = require('path');

async function testBuild() {
  try {
    const result = await build({
      entryPoints: [path.join(__dirname, 'handler.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(__dirname, 'test-output.js'),
      external: ['aws-sdk'],
    });

    console.log('Test build successful!');
    console.log(result);
    process.exit(0);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

testBuild();
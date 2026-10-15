// Copies three.js and the post-processing helpers the game uses into www/vendor,
// so the app works offline instead of loading them from a CDN.
import {copyFileSync,mkdirSync} from 'node:fs';
const files={
  'three.min.js':'node_modules/three/build/three.min.js',
  'CopyShader.js':'node_modules/three/examples/js/shaders/CopyShader.js',
  'LuminosityHighPassShader.js':'node_modules/three/examples/js/shaders/LuminosityHighPassShader.js',
  'GammaCorrectionShader.js':'node_modules/three/examples/js/shaders/GammaCorrectionShader.js',
  'EffectComposer.js':'node_modules/three/examples/js/postprocessing/EffectComposer.js',
  'RenderPass.js':'node_modules/three/examples/js/postprocessing/RenderPass.js',
  'ShaderPass.js':'node_modules/three/examples/js/postprocessing/ShaderPass.js',
  'UnrealBloomPass.js':'node_modules/three/examples/js/postprocessing/UnrealBloomPass.js'
};
mkdirSync('www/vendor',{recursive:true});
for(const [name,src] of Object.entries(files))copyFileSync(src,'www/vendor/'+name);
console.log('Copied',Object.keys(files).length,'files to www/vendor');

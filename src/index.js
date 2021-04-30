import { EffectPass, VignetteEffect, BloomEffect, BlendFunction, KernelSize } from 'postprocessing'
import * as THREE from 'three'
import WebGLApp from './lib/WebGLApp'
import assets from './lib/AssetManager'
import Text from './scene/Text'
import Background from './scene/Background'
import { addLights } from './scene/lights'

// true if the url has the `?debug` parameter, otherwise false
window.DEBUG = window.location.search.includes('debug')

// grab our canvas
const canvas = document.querySelector('#app')

// setup the WebGLRenderer
const webgl = new WebGLApp({
  canvas,
  // set the scene background color
  background: '#111',
  // enable gamma correction, read more about it here:
  // https://www.donmccurdy.com/2020/06/17/color-management-in-threejs/
  gamma: true,
  // enable postprocessing
  postprocessing: true,
  // show the fps counter from stats.js
  showFps: window.DEBUG,
  cameraPosition: new THREE.Vector3(0, 0, 10),
  // enable OrbitControls
  orbitControls: window.DEBUG,
  // Add the controls pane inputs
  controls: {
    text: { color: '#df20d9' },
    background: {
      color1: '#95ee11',
      color2: '#d32222',
      repetitions: { value: 15, min: 1, max: 30, step: 1 },
    },
  },
  hideControls: !window.DEBUG,
})

// attach it to the window to inspect in the console
if (window.DEBUG) {
  window.webgl = webgl
}

// hide canvas
webgl.canvas.style.visibility = 'hidden'

// load any queued assets
assets.load({ renderer: webgl.renderer }).then(() => {
  // add any "WebGL components" here...
  // append them to the scene so you can
  // use them from other components easily
  webgl.scene.text = new Text(webgl)
  webgl.scene.add(webgl.scene.text)
  webgl.scene.background = new Background(webgl)
  webgl.scene.add(webgl.scene.background)

  // lights and other scene related stuff
  addLights(webgl)

  // postprocessing
  // add an existing effect from the postprocessing library
  const vignette = new VignetteEffect({ darkness: 0.4 })
  const bloom = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    kernelSize: KernelSize.SMALL,
    luminanceThreshold: 0.7,
    luminanceSmoothing: 0.25,
    height: 480,
  })
  webgl.composer.addPass(new EffectPass(webgl.camera, bloom, vignette))

  // show canvas
  webgl.canvas.style.visibility = ''

  // start animation loop
  webgl.start()
})

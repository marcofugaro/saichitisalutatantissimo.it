import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import dataURIToBlob from 'datauritoblob'
import Stats from 'stats.js'
import { getGPUTier } from 'detect-gpu'
import { EffectComposer, RenderPass } from 'postprocessing'
// import cannonDebugger from 'cannon-es-debugger'
// import CCapture from 'ccapture.js'
import { initControls } from './Controls'

export default class WebGLApp {
  #width
  #height
  #capturer
  isRunning = false
  time = 0
  dt = 0
  #lastTime = performance.now()
  #updateListeners = []
  #pointerdownListeners = []
  #pointermoveListeners = []
  #pointerupListeners = []
  #startX
  #startY

  get background() {
    return this.renderer.getClearColor(new THREE.Color())
  }

  get backgroundAlpha() {
    return this.renderer.getClearAlpha()
  }

  set background(background) {
    this.renderer.setClearColor(background, this.backgroundAlpha)
  }

  set backgroundAlpha(backgroundAlpha) {
    this.renderer.setClearColor(this.background, backgroundAlpha)
  }

  get isRecording() {
    return Boolean(this.#capturer)
  }

  constructor({
    background = '#111',
    backgroundAlpha = 1,
    fov = 45,
    frustumSize = 3,
    near = 0.01,
    far = 100,
    ...options
  } = {}) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: !options.postprocessing,
      alpha: backgroundAlpha !== 1,
      // enabled for recording gifs or videos,
      // might disable it for performance reasons
      preserveDrawingBuffer: true,
      ...options,
    })
    if (options.sortObjects !== undefined) {
      this.renderer.sortObjects = options.sortObjects
    }
    if (options.gamma) {
      this.renderer.outputEncoding = THREE.sRGBEncoding
    }
    if (options.xr) {
      this.renderer.xr.enabled = true
    }

    this.canvas = this.renderer.domElement

    this.renderer.setClearColor(background, backgroundAlpha)

    // save the fixed dimensions
    this.#width = options.width
    this.#height = options.height

    // clamp pixel ratio for performance
    this.maxPixelRatio = options.maxPixelRatio || 1.5
    // clamp delta to avoid stepping anything too far forward
    this.maxDeltaTime = options.maxDeltaTime || 1 / 30

    // setup the camera
    const aspect = this.#width / this.#height
    if (!options.orthographic) {
      this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far)
    } else {
      this.camera = new THREE.OrthographicCamera(
        -(frustumSize * aspect) / 2,
        (frustumSize * aspect) / 2,
        frustumSize / 2,
        -frustumSize / 2,
        near,
        far
      )
      this.camera.frustumSize = frustumSize
    }
    this.camera.position.copy(options.cameraPosition || new THREE.Vector3(0, 0, 4))
    this.camera.lookAt(0, 0, 0)

    this.scene = new THREE.Scene()

    this.gl = this.renderer.getContext()

    // handle resize events
    window.addEventListener('resize', this.resize)
    window.addEventListener('orientationchange', this.resize)

    // force an initial resize event
    this.resize()

    // __________________________ADDONS__________________________

    // really basic pointer events handler, the second argument
    // contains the x and y relative to the top left corner
    // of the canvas.
    // In case of touches with multiple fingers, only the
    // first touch is registered.
    this.isDragging = false
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary) return
      this.isDragging = true
      this.#startX = event.offsetX
      this.#startY = event.offsetY
      // call onPointerDown method
      this.scene.traverse((child) => {
        if (typeof child.onPointerDown === 'function') {
          child.onPointerDown(event, { x: event.offsetX, y: event.offsetY })
        }
      })
      // call the pointerdown listeners
      this.#pointerdownListeners.forEach((fn) => fn(event, { x: event.offsetX, y: event.offsetY }))
    })
    this.canvas.addEventListener('pointermove', (event) => {
      if (!event.isPrimary) return
      // call onPointerMove method
      const position = {
        x: event.offsetX,
        y: event.offsetY,
        ...(this.#startX !== undefined && { dragX: event.offsetX - this.#startX }),
        ...(this.#startY !== undefined && { dragY: event.offsetY - this.#startY }),
      }
      this.scene.traverse((child) => {
        if (typeof child.onPointerMove === 'function') {
          child.onPointerMove(event, position)
        }
      })
      // call the pointermove listeners
      this.#pointermoveListeners.forEach((fn) => fn(event, position))
    })
    this.canvas.addEventListener('pointerup', (event) => {
      if (!event.isPrimary) return
      this.isDragging = false
      // call onPointerUp method
      const position = {
        x: event.offsetX,
        y: event.offsetY,
        ...(this.#startX !== undefined && { dragX: event.offsetX - this.#startX }),
        ...(this.#startY !== undefined && { dragY: event.offsetY - this.#startY }),
      }
      this.scene.traverse((child) => {
        if (typeof child.onPointerUp === 'function') {
          child.onPointerUp(event, position)
        }
      })
      // call the pointerup listeners
      this.#pointerupListeners.forEach((fn) => fn(event, position))

      this.#startX = undefined
      this.#startY = undefined
    })

    // expose a composer for postprocessing passes
    if (options.postprocessing) {
      const maxMultisampling = this.gl.getParameter(this.gl.MAX_SAMPLES)
      this.composer = new EffectComposer(this.renderer, {
        multisampling: Math.min(8, maxMultisampling),
        frameBufferType: options.gamma ? THREE.HalfFloatType : undefined,
        ...options,
      })
      this.composer.addPass(new RenderPass(this.scene, this.camera))
    }

    // set up OrbitControls
    if (options.orbitControls) {
      this.orbitControls = new OrbitControls(this.camera, this.canvas)

      this.orbitControls.enableDamping = true
      this.orbitControls.dampingFactor = 0.15
      this.orbitControls.enablePan = false

      if (options.orbitControls instanceof Object) {
        Object.keys(options.orbitControls).forEach((key) => {
          this.orbitControls[key] = options.orbitControls[key]
        })
      }
    }

    // Attach the Cannon physics engine
    if (options.world) {
      this.world = options.world
      if (options.showWorldWireframes) {
        this.cannonDebugger = cannonDebugger(this.scene, this.world.bodies, { autoUpdate: false })
      }
    }

    // show the fps meter
    if (options.showFps) {
      this.stats = new Stats({ showMinMax: false, context: this.gl })
      this.stats.showPanel(0)
      document.body.appendChild(this.stats.dom)
    }

    // initialize the controls-state
    if (options.controls) {
      this.controls = initControls(options.controls, options)
    }

    // detect the gpu info
    this.loadGPUTier = getGPUTier({ glContext: this.gl }).then((gpuTier) => {
      this.gpu = {
        name: gpuTier.gpu,
        tier: gpuTier.tier,
        isMobile: gpuTier.isMobile,
        fps: gpuTier.fps,
      }
    })
  }

  get width() {
    return this.#width || window.innerWidth
  }

  get height() {
    return this.#height || window.innerHeight
  }

  get pixelRatio() {
    return Math.min(this.maxPixelRatio, window.devicePixelRatio)
  }

  resize = ({ width = this.width, height = this.height, pixelRatio = this.pixelRatio } = {}) => {
    // update pixel ratio if necessary
    if (this.renderer.getPixelRatio() !== pixelRatio) {
      this.renderer.setPixelRatio(pixelRatio)
    }

    // setup new size & update camera aspect if necessary
    this.renderer.setSize(width, height)
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = width / height
    } else {
      const aspect = width / height
      this.camera.left = -(this.camera.frustumSize * aspect) / 2
      this.camera.right = (this.camera.frustumSize * aspect) / 2
      this.camera.top = this.camera.frustumSize / 2
      this.camera.bottom = -this.camera.frustumSize / 2
    }
    this.camera.updateProjectionMatrix()

    // resize also the composer, width and height
    // are automatically extracted from the renderer
    if (this.composer) {
      this.composer.setSize()
    }

    // recursively tell all child objects to resize
    this.scene.traverse((obj) => {
      if (typeof obj.resize === 'function') {
        obj.resize({
          width,
          height,
          pixelRatio,
        })
      }
    })

    // draw a frame to ensure the new size has been registered visually
    this.draw()
    return this
  }

  // convenience function to trigger a PNG download of the canvas
  saveScreenshot = ({ width = 1920, height = 1080, fileName = 'Screenshot.png' } = {}) => {
    // force a specific output size
    this.resize({ width, height, pixelRatio: 1 })
    this.draw()

    const dataURI = this.canvas.toDataURL('image/png')

    // reset to default size
    this.resize()
    this.draw()

    // save
    saveDataURI(fileName, dataURI)
  }

  // start recording of a gif or a video
  startRecording = ({
    width = 1920,
    height = 1080,
    fileName = 'Recording',
    format = 'gif',
    ...options
  } = {}) => {
    if (this.#capturer) {
      return
    }

    // force a specific output size
    this.resize({ width, height, pixelRatio: 1 })
    this.draw()

    this.#capturer = new CCapture({
      format,
      name: fileName,
      workersPath: '',
      motionBlurFrames: 2,
      ...options,
    })
    this.#capturer.start()
  }

  stopRecording = () => {
    if (!this.#capturer) {
      return
    }

    this.#capturer.stop()
    this.#capturer.save()
    this.#capturer = undefined

    // reset to default size
    this.resize()
    this.draw()
  }

  update = (dt, time, xrframe) => {
    if (this.orbitControls) {
      this.orbitControls.update()
    }

    // recursively tell all child objects to update
    this.scene.traverse((obj) => {
      if (typeof obj.update === 'function' && !obj.isTransformControls) {
        obj.update(dt, time, xrframe)
      }
    })

    if (this.world) {
      // update the cannon-es physics engine
      this.world.step(1 / 60, dt)

      // update the debug wireframe renderer
      if (this.cannonDebugger) {
        this.cannonDebugger.update()
      }

      // recursively tell all child bodies to update
      this.world.bodies.forEach((body) => {
        if (typeof body.update === 'function') {
          body.update(dt, time)
        }
      })
    }

    // call the update listeners
    this.#updateListeners.forEach((fn) => fn(dt, time, xrframe))

    return this
  }

  onUpdate(fn) {
    this.#updateListeners.push(fn)
  }

  onPointerDown(fn) {
    this.#pointerdownListeners.push(fn)
  }

  onPointerMove(fn) {
    this.#pointermoveListeners.push(fn)
  }

  onPointerUp(fn) {
    this.#pointerupListeners.push(fn)
  }

  offUpdate(fn) {
    const index = this.#updateListeners.indexOf(fn)

    // return silently if the function can't be found
    if (index === -1) {
      return
    }

    this.#updateListeners.splice(index, 1)
  }

  offPointerDown(fn) {
    const index = this.#pointerdownListeners.indexOf(fn)

    // return silently if the function can't be found
    if (index === -1) {
      return
    }

    this.#pointerdownListeners.splice(index, 1)
  }

  offPointerMove(fn) {
    const index = this.#pointermoveListeners.indexOf(fn)

    // return silently if the function can't be found
    if (index === -1) {
      return
    }

    this.#pointermoveListeners.splice(index, 1)
  }

  offPointerUp(fn) {
    const index = this.#pointerupListeners.indexOf(fn)

    // return silently if the function can't be found
    if (index === -1) {
      return
    }

    this.#pointerupListeners.splice(index, 1)
  }

  draw = () => {
    // postprocessing doesn't currently work in WebXR
    const isXR = this.renderer.xr.enabled && this.renderer.xr.isPresenting

    if (this.composer && !isXR) {
      this.composer.render(this.dt)
    } else {
      this.renderer.render(this.scene, this.camera)
    }
    return this
  }

  start = () => {
    if (this.isRunning) return
    this.isRunning = true

    // draw immediately
    this.draw()

    this.renderer.setAnimationLoop(this.animate)
    return this
  }

  stop = () => {
    if (!this.isRunning) return
    this.renderer.setAnimationLoop(null)
    this.isRunning = false
    return this
  }

  animate = (now, xrframe) => {
    if (!this.isRunning) return

    if (this.stats) this.stats.begin()

    this.dt = Math.min(this.maxDeltaTime, (now - this.#lastTime) / 1000)
    this.time += this.dt
    this.#lastTime = now
    this.update(this.dt, this.time, xrframe)
    this.draw()

    if (this.#capturer) this.#capturer.capture(this.canvas)

    if (this.stats) this.stats.end()
  }

  get cursor() {
    return this.canvas.style.cursor
  }

  set cursor(cursor) {
    if (cursor) {
      this.canvas.style.cursor = cursor
    } else {
      this.canvas.style.cursor = null
    }
  }
}

function saveDataURI(name, dataURI) {
  const blob = dataURIToBlob(dataURI)

  // force download
  const link = document.createElement('a')
  link.download = name
  link.href = window.URL.createObjectURL(blob)
  link.onclick = setTimeout(() => {
    window.URL.revokeObjectURL(blob)
    link.removeAttribute('href')
  }, 0)

  link.click()
}

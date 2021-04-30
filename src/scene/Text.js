import * as THREE from 'three'
import gsap from 'gsap'
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json'
import { wireValue } from '../lib/Controls'

export default class Text extends THREE.Group {
  constructor(webgl, options = {}) {
    super(options)
    this.webgl = webgl
    this.options = options

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(webgl.controls.text.color),
    })

    wireValue(material, () => webgl.controls.text.color)

    // can't set letter space in TextGeometry by default
    const kernings = [-0.1, -0.1, 0.1, -0.01, 0.08, -0.08, -0.08]
    const size = 1
    const letterSpacing = size * 0.1

    const group = new THREE.Group()
    let x = 0
    'STOCAZZO'.split('').forEach((letter, i) => {
      const geometry = new THREE.TextGeometry(letter, {
        font: new THREE.Font(helvetikerBold),

        size,
        height: size * 0.5, // depth actually
        curveSegments: 16,

        bevelEnabled: true,
        bevelThickness: size * 0.05,
        bevelSize: size * 0.08,
        bevelSegments: 8,
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.x = x
      x += size + kernings[i] * size + letterSpacing
      group.add(mesh)
    })

    // center the text
    const bbox = new THREE.Box3().setFromObject(group)
    group.position.x = -0.5 * Math.abs(bbox.max.x - bbox.min.x)
    group.position.y = -0.5 * Math.abs(bbox.max.y - bbox.min.y)
    group.position.z = -0.5 * Math.abs(bbox.max.z - bbox.min.z)

    this.add(group)

    // set scale based on width of the window
    if (window.innerWidth < 1440) {
      this.scale.setScalar(this.computeScale())
    }

    // animation
    const forwardTime = 0.5
    const backTime = 0.65
    const zAmplitude = size * 2
    const tl = gsap
      .timeline({ repeat: -1 })
      .addLabel('start')
      .to(this.position, { z: zAmplitude, duration: forwardTime, ease: 'power2.inOut' })
      .addLabel('middle')
      .to(this.position, { z: 0, duration: backTime, ease: 'power1.inOut' })
      .addLabel('end')
      .to(this.position, { z: zAmplitude, duration: forwardTime, ease: 'power2.inOut' })
      .addLabel('middle2')
      .to(this.position, { z: 0, duration: backTime, ease: 'power1.inOut' })
      .addLabel('end2')

    const rotYAmplitude = Math.PI * 0.05
    tl.to(this.rotation, { y: rotYAmplitude, duration: forwardTime, ease: 'power1.inOut' }, 'start')
      .to(this.rotation, { y: 0, duration: backTime, ease: 'power1.inOut' }, 'middle')
      .to(this.rotation, { y: -rotYAmplitude, duration: forwardTime, ease: 'power1.inOut' }, 'end')
      .to(this.rotation, { y: 0, duration: backTime, ease: 'power1.inOut' }, 'middle2')

    const rotZAmplitude = Math.PI * 0.02
    tl.to(this.rotation, { z: rotZAmplitude, duration: forwardTime, ease: 'power1.inOut' }, 'start')
      .to(this.rotation, { z: 0, duration: backTime, ease: 'power1.inOut' }, 'middle')
      .to(this.rotation, { z: -rotZAmplitude, duration: forwardTime, ease: 'power1.inOut' }, 'end')
      .to(this.rotation, { z: 0, duration: backTime, ease: 'power1.inOut' }, 'middle2')
  }

  computeScale() {
    const x = window.innerWidth // input

    // https://content.byui.edu/file/b8b83119-9acc-4a7b-bc84-efacf9043998/1/Math-2-11-2.html
    // x is window width
    // y is scale
    // 1 is desktop
    // 2 is mobile
    const x1 = 1440
    const x2 = 375
    const y1 = 1
    const y2 = 0.33
    const m = (y2 - y1) / (x2 - x1) // slope
    const b = y1 - m * x1
    const y = m * x + b

    return y // output
  }

  resize() {
    if (window.innerWidth < 1440) {
      this.scale.setScalar(this.computeScale())
    } else {
      this.scale.setScalar(1)
    }
  }
}

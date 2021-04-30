import * as THREE from 'three'
import glsl from 'glslify'
import { wireUniform } from '../lib/Controls'
import { visibleWidthAtZDepth, visibleHeightAtZDepth } from '../lib/three-utils'
import { customizeFragmentShader, addDefines, addUniforms } from '../lib/customizeShader'

const Z = -0.5 // the z position of the plane

export default class Background extends THREE.Group {
  constructor(webgl, options = {}) {
    super(options)
    this.webgl = webgl
    this.options = options

    this.initialWidth = visibleWidthAtZDepth(Z, webgl.camera)
    this.initialHeight = visibleHeightAtZDepth(Z, webgl.camera)
    const geometry = new THREE.PlaneGeometry(this.initialWidth, this.initialHeight)
    const material = new THREE.MeshBasicMaterial()
    addDefines(material, { USE_UV: '' })
    addUniforms(material, {
      color1: wireUniform(material, () => webgl.controls.background.color1),
      color2: wireUniform(material, () => webgl.controls.background.color2),
      repetitions: wireUniform(material, () => webgl.controls.background.repetitions),
      time: { value: webgl.time },
      speed: { value: 0.05 },
    })
    customizeFragmentShader(material, {
      head: glsl`
        uniform vec3 color1;
        uniform vec3 color2;
        uniform float repetitions;
        uniform float time;
        uniform float speed;

        #pragma glslify: aastep = require('glsl-aastep')
      `,
      gl_FragColor: glsl`
        vec2 uv = vUv;

        vec2 fromCenter = (uv - vec2(0.5));
        float angleAtan = atan(fromCenter.y, fromCenter.x); // atan2
        float angle = angleAtan / (PI * 2.0) + 0.5; // output goes from -PI to PI

        float value = aastep(0.5, mod((angle + time * speed) * repetitions, 1.0));

        vec3 color = mix(color1, color2, value);
        gl_FragColor = vec4(vec3(color), 1.0);
      `,
    })
    this.material = material

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.z = Z
    this.add(mesh)
  }

  resize() {
    this.scale.x = visibleWidthAtZDepth(Z, this.webgl.camera) / this.initialWidth
    this.scale.y = visibleHeightAtZDepth(Z, this.webgl.camera) / this.initialHeight
  }

  update(dt, time) {
    this.material.uniforms.time.value = time
  }
}

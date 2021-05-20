const createRenderer = require('../')
const createContext = require('pex-context')

const ctx = createContext()
const renderer = createRenderer(ctx)

const cameraEntity = renderer.entity([
  renderer.camera({
    aspect: ctx.gl.drawingBufferWidth / ctx.gl.drawingBufferHeight
  }),
  renderer.orbiter({
    position: [0, 0.5, 0.5],
    target: [0, 0, 0]
  })
])
renderer.add(cameraEntity)

const skyboxEntity = renderer.entity([
  renderer.skybox({
    sunPosition: [1, 1, 1]
  })
])
renderer.add(skyboxEntity)

const axesEntity = renderer.entity([renderer.axisHelper()])
renderer.add(axesEntity)

const reflectionProbeEntity = renderer.entity([renderer.reflectionProbe()])
renderer.add(reflectionProbeEntity)
;(async () => {
  const geometry = renderer.geometry(
    await renderer.loadDraco('assets/models/bunny.drc')
  )

  renderer.add(
    renderer.entity([
      geometry,
      renderer.material({ baseColor: [0.9, 0.1, 0.1, 1] })
    ])
  )
})()

ctx.frame(() => {
  renderer.draw()

  window.dispatchEvent(new CustomEvent('pex-screenshot'))
})
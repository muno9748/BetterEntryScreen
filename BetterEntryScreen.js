window.EntryScreenFixer = class EntryScreenFixer {
    static Marker = Symbol('EntryScreenFixer')
    
    constructor() {
        this.Entry = document.querySelector('iframe')?.contentWindow?.Entry
      
        if(!this.Entry) throw new Error('이 스크립트는 만들기 화면에서는 동작하지 않습니다.')

        this.canvas = this.Entry.stage.canvas.canvas
    }
  
    ratioX = 0
    ratioY = 0

    resX = 0
    resY = 0

    fix() {
        if(this.Entry.options.useWebGL) throw new Error('부스트모드는 지원되지 않습니다.')

        const resolution = [Math.ceil(screen.width), Math.ceil(screen.width * 9 / 16)]

        this.info(`Found Device Resolution ${screen.width}x${screen.height}`)

        this.setScreenResolution(...resolution)

        this.fixSVG()
    }

    fixSVG() {
        const scrFixer = this
        const { Entry } = this

        let entries = 0

        Entry.container.objects_.forEach(obj => {
            if(obj.esf_marker == EntryScreenFixer.Marker) return
            if(obj.objectType != 'sprite') return

            obj.esf_marker = EntryScreenFixer.Marker

            const svgImages = new Map()

            obj.pictures.forEach((pic, idx) => {
                if(pic.imageType == 'svg' && !pic.fileurl) {
                    const id = pic.filename
                    const image = new Image()

                    image.src = `https://playentry.org/uploads/${id.slice(0, 2)}/${id.slice(2, 4)}/image/${id}.svg`
                    
                    svgImages.set(idx, [image, null])

                    fetch(image.src).then(resp => resp.text()).then(resp => (new DOMParser().parseFromString(resp, 'image/svg+xml'))).then(doc => {
                        const svg = [...doc.childNodes].find(x => x.tagName == 'svg')
                        svgImages.set(idx, [svgImages.get(idx)[0], svg.width && svg.height ? [0, 0, svg.width.baseVal.value, svg.height.baseVal.value] : svg.getAttribute('viewBox').split(' ').map(x => +x)])
                    })

                    entries++
                }
            })

            Object.defineProperty(obj.entity.object, 'draw', {
                get() {
                    return ctx => {
                        if(ctx.canvas != scrFixer.canvas) {
                            ctx.drawImage(img, 0, 0)
                            
                            return
                        }
                        
                        const w = obj.entity.getWidth()
                        const h = obj.entity.getHeight()

                        if((() => {
                            if(obj.entity.picture.imageType == 'svg') {
                                const viewBox = svgImages.get(obj.getPictureIndex())?.[1]

                                if(!viewBox) return false

                                const [ _x, _y, vw, vh ] = viewBox

                                if(w != vw || h != vh) {
                                    const regX = vw / 2
                                    const regY = vh / 2
                                    const ssx = Entry.stage._app.stage.scaleX
                                    const ssy = Entry.stage._app.stage.scaleY
                                    const sx = obj.entity.scaleX * ssx
                                    const sy = obj.entity.scaleY * ssy
                                    const x = obj.entity.x
                                    const y = obj.entity.y
                                    const rot = obj.entity.rotation / 180 * Math.PI

                                    const tx = scrFixer.resX / 2 + x / 480 * scrFixer.resX
                                    const ty = scrFixer.resY / 2 - y / 270 * scrFixer.resY

                                    ctx.setTransform(
                                        sx, 0, 
                                        0, sy, 
                                        0, 0
                                    )

                                    ctx.translate(tx / sx, ty / sy)
                                    ctx.rotate(rot)
                                    ctx.translate(-regX, -regY)

                                    ctx.drawImage(obj.entity.object.image, 0, 0, vw, vh)

                                    return true
                                } else {
                                    return false
                                }
                            }
                        })()) return
                        
                        ctx.drawImage(obj.entity.object.image, 0, 0, w, h)
                    }
                }
            })

            let img = obj.entity.object.image

            Object.defineProperty(obj.entity.object, 'image', {
                get() {
                    if (obj.entity.picture.imageType == 'svg') {
                        const svg = svgImages.get(obj.pictures.indexOf(obj.entity.picture))

                        if(!svg) throw new ReferenceError('[EntryScreenFixer] Unindexed SVG Item: ' + obj.getPictureIndex())

                        return svg[0]
                    } else {
                        return img
                    }
                },
                set(value) {
                    img = value
                }
            })

            const objectProxy = new Proxy(obj.entity.object, {
                get(target, key, receiver) {
                    if(key == 'draw') {
                        return 
                    } else 
                    
                    return Reflect.get(target, key, receiver)
                }
            })
        })

        this.info(`Fixed ${entries} SVG Entries`)
    }

    setScreenResolution(w, h) {
        this.info(`Setting Rendering Resolution to ${w}x${h}`)

        const { Entry } = this
        const { stage } = Entry
    
        stage.canvas.canvas.width = w
        stage.canvas.canvas.height = h
        stage.canvas.x = w / 2
        stage.canvas.y = h / 2
        stage.canvas.scaleX = stage.canvas.scaleY = w / 240 / 2
        
        this.resX = w
        this.resY = h
    
        stage._app.stage.update()

        this.ratioX = 480 / w
        this.ratioY = 270 / h

        Entry.variableContainer.lists_.forEach(list => {
            list.view_.removeAllEventListeners()
            list.resizeHandle_.removeAllEventListeners()
            list.scrollButton_.removeAllEventListeners()

            list.view_.on('mouseover', () => list.view_.cursor = 'move')
            list.view_.on('mousedown', e => {
                if (Entry.type != 'workspace' || list.isResizing) return

                list.view_.offset = {
                    x: list.view_.x - (e.stageX * this.ratioX - 240),
                    y: list.view_.y - (e.stageY * this.ratioY - 135)
                }

                list.view_.cursor = 'move'
            })
            list.view_.on('pressup', () => {
                list.view_.cursor = 'initial'
                list.isResizing = false
            })
            list.view_.on('pressmove', e => {
                if (Entry.type != 'workspace' || list.isResizing) return

                list.setX(e.stageX * this.ratioX - 240 + list.view_.offset.x)
                list.setY(e.stageY * this.ratioY - 135 + list.view_.offset.y)
                list.updateView()
            })

            list.resizeHandle_.on('mouseover', () => list.resizeHandle_.cursor = 'nwse-resize')
            list.resizeHandle_.on('mousedown', e => {
                list.isResizing = true
            
                list.resizeHandle_.offset = {
                    x: e.stageX * this.ratioX - list.getWidth(),
                    y: e.stageY * this.ratioY - list.getHeight()
                }

                list.view_.cursor = 'nwse-resize'
            })
            list.resizeHandle_.on('pressmove', e => {
                list.setWidth(e.stageX * this.ratioX - list.resizeHandle_.offset.x)
                list.setHeight(e.stageY * this.ratioY - list.resizeHandle_.offset.y)
                list.updateView()
            })

            list.scrollButton_.on('mousedown', e => {
                list.isResizing = true
                list.scrollButton_.offsetY = e.stageY - list.scrollButton_.y / this.ratioY
            })
            list.scrollButton_.on('pressmove', e => {
                list.scrollButton_.y = Math.min(Math.max((e.stageY - list.scrollButton_.offsetY) * this.ratioY, 25), list.getHeight() - 30)
                list.updateView()
            })
        })

        Entry.variableContainer.variables_.forEach(v => {
            v.view_.removeAllEventListeners()

            v.view_.on('mousedown', e => {
                if (Entry.type != 'workspace') return

                v.view_.offset = {
                    x: v.view_.x - (e.stageX * this.ratioX - 240),
                    y: v.view_.y - (e.stageY * this.ratioY - 135)
                }
            })

            v.view_.on('pressmove', e => {
                if (Entry.type != 'workspace') return

                v.setX(e.stageX * this.ratioX - 240 + v.view_.offset.x)
                v.setY(e.stageY * this.ratioY - 135 + v.view_.offset.y)
                v.updateView()
            })

            if(!v.slideBar_) return

            v.slideBar_.removeAllEventListeners()
            v.valueSetter_.removeAllEventListeners()

            v.slideBar_.on('mousedown', e => {
                if (!Entry.engine.isState('run')) return

                const value = evt.stageX * this.ratioX - (v.slideBar_.getX() + 240 + 5) + 5

                v.setSlideCommandX(value)
            })

            v.valueSetter_.on('mousedown', e => {
                if (!Entry.engine.isState('run')) return

                v.isAdjusting = true
                v.valueSetter_.offsetX = e.stageX * this.ratioX - v.valueSetter_.x
            })
    
            v.valueSetter_.on('pressmove', e => {
                if (!Entry.engine.isState('run')) return

                const value = (e.stageX * this.ratioX) - v.valueSetter_.offsetX + 5

                v.setSlideCommandX(value)
            })

            v.valueSetter_.on('pressup', () => v.isAdjusting = false)
        })
    }

    info(message) {
        console.log('%c EntryScreenFixer %c INFO %c ' + message, 'background: black; color: white; border-radius: 5px 0px 0px 5px;', 'background: #08c490; color: white; border-radius: 0px 5px 5px 0px;', '')
    }
}

new EntryScreenFixer().fix()

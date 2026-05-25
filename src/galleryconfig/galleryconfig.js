let scrollY = 0;
let targetScrollY = 0;
let scrollVelocity = 0;
let materials = [];
let totalImagesToLoad = 0;
let loadedImagesCount = 0;
let meshes = [];
let preserveOriginalRatios = !0;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
const renderer = new THREE.WebGLRenderer({
    antialias: !0,
    alpha: !0
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.z = 1;
const BAND_HEIGHT = 120;
const IMAGE_HEIGHT = 100;
const IMAGE_GAP = 20;
const CLONE_COUNT = 3;
const MAX_IMAGE_WIDTH = 300;
const IMAGES_PER_BAND = [8, 12, 9, 13, 14, 10, 9, 13];
const ImageBand1 = ["https://images.unsplash.com/photo-1649730837819-e68ff76c1816?h=400", "https://images.unsplash.com/photo-1649730845726-90c8921bde03?h=400", "https://images.unsplash.com/photo-1648090330632-4c9531c3ea60?h=400", "https://images.unsplash.com/photo-1648090328990-773c71909629?h=400", "https://images.unsplash.com/photo-1648090330282-286c3b1a6a7f?h=400", "https://images.unsplash.com/photo-1648090319891-22ce6cc39bba?h=400", "https://images.unsplash.com/photo-1648090324472-041e0203e6ce?h=400", "https://images.unsplash.com/photo-1688907487698-b2392019f522?h=400"];
const ImageBand2 = ["https://images.unsplash.com/photo-1649730837968-c51a42f9396e?w=300", "https://images.unsplash.com/photo-1649730842615-2ff02352e535?w=300", "https://images.unsplash.com/photo-1649730845183-37de96f3acbf?w=300", "https://images.unsplash.com/photo-1649730837657-95502fac2858?w=300", "https://images.unsplash.com/photo-1649730842550-a2b4481f6505?w=300", "https://images.unsplash.com/photo-1633657321317-f1e83e9b2b57?w=300", "https://images.unsplash.com/photo-1648090319885-a90824ccd765?w=300", "https://images.unsplash.com/photo-1648090319997-ca10568f8b88?w=300", "https://images.unsplash.com/photo-1648090324464-ca18cce37a44?w=300", "https://images.unsplash.com/photo-1648090324464-87b5e78ae9f8?w=300", "https://images.unsplash.com/photo-1648090325560-6c3e4df8fc21?w=300", "https://images.unsplash.com/photo-1648090329516-ee37a5ff060b?w=300"];
const ImageBand3 = ["https://images.unsplash.com/photo-1648090268311-4f1831fc5600?w=300", "https://images.unsplash.com/photo-1648090317695-f0a97182ddfd?w=300", "https://images.unsplash.com/photo-1648090317724-5cc66d54cb59?w=300", "https://images.unsplash.com/photo-1632054553195-bfd7034fee25?w=300", "https://images.unsplash.com/photo-1632054259416-61e1913909f8?w=300", "https://images.unsplash.com/photo-1632054259418-def36ea6c2a5?w=300", "https://images.unsplash.com/photo-1632054553790-c4f1f534c184?w=300", "https://images.unsplash.com/photo-1648090317489-e2a4434b0be2?w=300", "https://images.unsplash.com/photo-1632054553871-c2817a775d18?w=300"];
const ImageBand4 = ["https://images.unsplash.com/photo-1665264998342-e1c485aa9e6c?w=300", "https://images.unsplash.com/photo-1688907487591-962299895ad2?w=300", "https://images.unsplash.com/photo-1648090322521-57f40a418fc9?w=300", "https://images.unsplash.com/photo-1648090317719-a57c907a7284?w=300", "https://images.unsplash.com/photo-1648090319998-2763a51e00c9?w=300", "https://images.unsplash.com/photo-1630163666316-39db7fd0f2d8?w=300", "https://images.unsplash.com/photo-1648090325360-d68298515046?w=300", "https://images.unsplash.com/photo-1648090322506-c79522085735?w=300", "https://images.unsplash.com/photo-1630636147267-42808cca8243?w=300", "https://images.unsplash.com/photo-1688907487492-67541759c0ec?w=300", "https://images.unsplash.com/photo-1648090255048-90079d233070?w=300", "https://images.unsplash.com/photo-1648090265052-ac09d6212872?w=300", "https://images.unsplash.com/photo-1630163666253-d499c23e1be2?w=300"];
const ImageBand5 = ["https://images.unsplash.com/photo-1648090328043-e75292e328ec?w=300", "https://images.unsplash.com/photo-1648090322515-02be75f7d731?w=300", "https://images.unsplash.com/photo-1648090317691-5e54b4f49b13?w=300", "https://images.unsplash.com/photo-1631932389691-e537af7cb995?w=300", "https://images.unsplash.com/photo-1631932389075-4ac0d4bf7394?w=300", "https://images.unsplash.com/photo-1688907487001-28bb3592ea31?w=300", "https://images.unsplash.com/photo-1688907487499-5109d7d14bfa?w=300", "https://images.unsplash.com/photo-1648090327601-36dc97fed197?w=300", "https://images.unsplash.com/photo-1648090326716-14e01e43da03?w=300", "https://images.unsplash.com/photo-1648090326914-fcf7ad3f5aa1?w=300", "https://images.unsplash.com/photo-1631932392715-dfed5d0e9332?w=300", "https://images.unsplash.com/photo-1630163664826-16147bbdbb65?w=300", "https://images.unsplash.com/photo-1630163670776-0f64ec1acf1d?w=300", "https://images.unsplash.com/photo-1545041587-ccd03e26b580?w=300"];
const ImageBand6 = ["https://images.unsplash.com/photo-1633657324109-d031bd981583?w=300", "https://images.unsplash.com/photo-1633657322204-cfbe7f9f803a?w=300", "https://images.unsplash.com/photo-1635125293454-695c272749a7?w=300", "https://images.unsplash.com/photo-1630163671229-07fdcf23ba71?w=300", "https://images.unsplash.com/photo-1597522888503-a8ebde1da97d?w=300", "https://images.unsplash.com/photo-1688907487658-56175bfee35a?w=300", "https://images.unsplash.com/photo-1651107466227-1a7100432973?w=300", "https://images.unsplash.com/photo-1649730845235-050a47af7c33?w=300", "https://images.unsplash.com/photo-1648090320060-d4c61f30fb18?w=300", "https://images.unsplash.com/photo-1648090319890-62e6ce986438?w=300"];
const ImageBand7 = ["https://images.unsplash.com/photo-1635989198295-76680f9ce67a?w=300", "https://images.unsplash.com/photo-1635301443938-d95a891d46b7?w=300", "https://images.unsplash.com/photo-1648090272846-316807cd80c2?w=300", "https://images.unsplash.com/photo-1635989193974-102e31f3db9b?w=300", "https://images.unsplash.com/photo-1635989194850-9349356f9d3d?w=300", "https://images.unsplash.com/photo-1688907487543-43bcab100449?w=300", "https://images.unsplash.com/photo-1635989197685-19d50a475348?w=300", "https://images.unsplash.com/photo-1633657322446-ed5784d121e4?w=300", "https://images.unsplash.com/photo-1553918926-1fbf8e38d53b?w=300"];
const ImageBand8 = ["https://images.unsplash.com/photo-1688907486206-2f6244413e61?w=300", "https://images.unsplash.com/photo-1648090329178-7f3e54ceea9c?w=300", "https://images.unsplash.com/photo-1648090328368-93633744e952?w=300", "https://images.unsplash.com/photo-1648090317720-d61e2ec5adb4?w=300", "https://images.unsplash.com/photo-1648090317938-efbe4e792ba9?w=300", "https://images.unsplash.com/photo-1635989197697-5596cc9a9a6c?w=300", "https://images.unsplash.com/photo-1632681179698-35ac572f6510?w=300", "https://images.unsplash.com/photo-1633657321411-b8fbeb8c6adb?w=300", "https://images.unsplash.com/photo-1535378181097-9cf5e853b572?w=300", "https://images.unsplash.com/photo-1665264343390-4ebd4a7731d0?w=300", "https://images.unsplash.com/photo-1648090319893-1d3a26d80627?w=300", "https://images.unsplash.com/photo-1648090319889-73787d9b3f14?w=300", "https://images.unsplash.com/photo-1630163664483-9ee845d40a63?w=300"];
const bandConfigs = [{
    offsetY: -110,
    speed: 1.0,
    rotation: 7 * Math.PI / 180,
    rotationType: "fromLeft",
    name: "Haut 1",
    curveAmount: 40.0,
    curveDirection: 1
}, {
    offsetY: -330,
    speed: 1.3,
    rotation: 7 * Math.PI / 180,
    rotationType: "fromCenter",
    name: "Haut 2",
    curveAmount: 35.0,
    curveDirection: 1
}, {
    offsetY: -440,
    speed: 1.6,
    rotation: 7 * Math.PI / 180,
    rotationType: "fromLeft",
    name: "Centre Haut",
    curveAmount: 40.0,
    curveDirection: 1
}, {
    offsetY: -220,
    speed: 0.7,
    rotation: 7 * Math.PI / 180,
    name: "Centrale",
    curveAmount: 40.0,
    curveDirection: 1
}, {
    offsetY: 0,
    speed: 0.4,
    rotation: 7 * Math.PI / 180,
    name: "Centre Bas",
    curveAmount: 40.0,
    curveDirection: 1
}, {
    offsetY: 110,
    speed: 1.2,
    rotation: 7 * Math.PI / 180,
    name: "Bas 1",
    curveAmount: 40.0,
    curveDirection: 1
}, {
    offsetY: 220,
    speed: 0.8,
    rotation: 7 * Math.PI / 180,
    name: "Bas 2",
    curveAmount: 40.0,
    curveDirection: 1
}, {
    offsetY: 330,
    speed: 1.4,
    rotation: 7 * Math.PI / 180,
    name: "Très Bas",
    curveAmount: 40.0,
    curveDirection: 1
}];

function getImageUrlsForBand(bandIndex) {
    switch (bandIndex) {
        case 0:
            return ImageBand1;
        case 1:
            return ImageBand2;
        case 2:
            return ImageBand3;
        case 3:
            return ImageBand4;
        case 4:
            return ImageBand5;
        case 5:
            return ImageBand6;
        case 6:
            return ImageBand7;
        case 7:
            return ImageBand8;
        default:
            return []
    }
}

function calculateImageDimensions(height, ratio) {
    let width = Math.round(height * ratio);
    if (width > MAX_IMAGE_WIDTH) {
        width = MAX_IMAGE_WIDTH;
        height = Math.round(width / ratio)
    }
    return {
        width: width,
        height: height,
        ratio: ratio
    }
}

function formatRatio(ratio) {
    const commonRatios = [{
        value: 1.5,
        text: '3:2',
        tolerance: 0.05
    }, {
        value: 1.333,
        text: '4:3',
        tolerance: 0.02
    }, {
        value: 1.777,
        text: '16:9',
        tolerance: 0.02
    }, {
        value: 1.85,
        text: '1.85:1',
        tolerance: 0.02
    }, {
        value: 2.0,
        text: '2:1',
        tolerance: 0.05
    }, {
        value: 1.0,
        text: '1:1',
        tolerance: 0.01
    }, {
        value: 0.75,
        text: '3:4',
        tolerance: 0.02
    }, {
        value: 0.667,
        text: '2:3',
        tolerance: 0.02
    }];
    for (const common of commonRatios) {
        if (Math.abs(ratio - common.value) < common.tolerance) {
            return common.text
        }
    }
    return ratio.toFixed(2) + ':1'
}

function createHorizontalTextureForBand(images, bandName) {
    let sequenceWidth = 0;
    const imagesPerBand = images.length;
    for (let i = 0; i < imagesPerBand; i++) {
        const imageInfo = images[i];
        if (imageInfo && imageInfo.loaded) {
            sequenceWidth += imageInfo.width + IMAGE_GAP
        }
    }
    sequenceWidth -= IMAGE_GAP;
    const totalWidth = sequenceWidth * CLONE_COUNT;
    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = BAND_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, totalWidth, BAND_HEIGHT);
    let currentX = 0;
    for (let clone = 0; clone < CLONE_COUNT; clone++) {
        for (let i = 0; i < imagesPerBand; i++) {
            const imageInfo = images[i];
            if (imageInfo && imageInfo.loaded && imageInfo.img) {
                const imgWidth = imageInfo.width;
                const imgHeight = imageInfo.height;
                const centeredY = (BAND_HEIGHT - imgHeight) / 2;
                ctx.save();
                ctx.globalAlpha = 0.9;
                ctx.drawImage(imageInfo.img, currentX, centeredY, imgWidth, imgHeight);
                if (imageInfo.displayRatio) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(imageInfo.displayRatio, currentX + imgWidth / 2, centeredY + imgHeight + 12)
                }
                ctx.restore();
                currentX += imgWidth + IMAGE_GAP
            }
        }
    }
    return {
        canvas: canvas,
        totalWidth: totalWidth,
        sequenceWidth: sequenceWidth,
        imagesCount: imagesPerBand
    }
}

function loadImagesForBand(bandIndex, imagesCount, callback) {
    const images = [];
    let loaded = 0;
    const imageUrls = getImageUrlsForBand(bandIndex);
    for (let i = 0; i < imagesCount; i++) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const imageObj = {
            loaded: !1,
            img: null,
            width: 0,
            height: 0,
            ratio: 0,
            bandIndex: bandIndex,
            imageIndex: i
        };
        images.push(imageObj);
        img.onload = function() {
            const naturalWidth = img.naturalWidth;
            const naturalHeight = img.naturalHeight;
            const originalRatio = naturalWidth / naturalHeight;
            let targetWidth, targetHeight;
            if (preserveOriginalRatios) {
                targetHeight = IMAGE_HEIGHT;
                targetWidth = Math.round(targetHeight * originalRatio);
                if (targetWidth > MAX_IMAGE_WIDTH) {
                    targetWidth = MAX_IMAGE_WIDTH;
                    targetHeight = Math.round(targetWidth / originalRatio)
                }
                imageObj.ratio = originalRatio;
                imageObj.displayRatio = formatRatio(originalRatio)
            } else {
                const fixedRatio = 1.5;
                targetHeight = IMAGE_HEIGHT;
                targetWidth = Math.round(targetHeight * fixedRatio);
                imageObj.ratio = fixedRatio;
                imageObj.displayRatio = '3:2 (fixe)'
            }
            imageObj.loaded = !0;
            imageObj.img = img;
            imageObj.width = targetWidth;
            imageObj.height = targetHeight;
            imageObj.naturalWidth = naturalWidth;
            imageObj.naturalHeight = naturalHeight;
            imageObj.originalRatio = originalRatio;
            loaded++;
            loadedImagesCount++;
            updateLoading();
            if (loaded === imagesCount) {
                callback(images)
            }
        };
        img.onerror = function() {
            createFallbackImageForBand(imageObj, i, bandIndex);
            loaded++;
            loadedImagesCount++;
            updateLoading();
            if (loaded === imagesCount) {
                callback(images)
            }
        };
        if (imageUrls && imageUrls[i]) {
            const url = new URL(imageUrls[i]);
            url.searchParams.set('auto', 'format');
            url.searchParams.set('fit', 'crop');
            img.src = url.toString()
        } else {
            const randomId = Math.floor(Math.random() * 1000);
            img.src = `https://picsum.photos/id/${randomId}/400/300`
        }
    }
    return images
}

function createFallbackImageForBand(imageObj, imgIndex, bandIndex) {
    const fallbackRatios = [1.5, 1.333, 1.777, 1.0, 0.75];
    const ratio = fallbackRatios[Math.floor(Math.random() * fallbackRatios.length)];
    const dimensions = calculateImageDimensions(IMAGE_HEIGHT, ratio);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    const bandColors = ['hsl(210, 70%, 60%)', 'hsl(180, 70%, 60%)', 'hsl(150, 70%, 60%)', 'hsl(120, 70%, 60%)', 'hsl(90, 70%, 60%)', 'hsl(60, 70%, 60%)', 'hsl(30, 70%, 60%)', 'hsl(0, 70%, 60%)'];
    const color = bandColors[bandIndex] || 'hsl(0, 0%, 70%)';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ratioText = formatRatio(ratio);
    ctx.fillText(`B${bandIndex + 1}`, dimensions.width / 2, dimensions.height / 2 - 15);
    ctx.fillText(`Img ${imgIndex + 1}`, dimensions.width / 2, dimensions.height / 2);
    ctx.fillText(ratioText, dimensions.width / 2, dimensions.height / 2 + 15);
    imageObj.loaded = !0;
    imageObj.img = canvas;
    imageObj.width = dimensions.width;
    imageObj.height = dimensions.height;
    imageObj.ratio = ratio;
    imageObj.displayRatio = ratioText;
    imageObj.isFallback = !0
}

function updateLoading() {
    const progress = (loadedImagesCount / totalImagesToLoad) * 100;
    const progressFill = document.getElementById('progressFill');
    const loadingText = document.getElementById('loadingText');
    if (progressFill) {
        progressFill.style.width = `${progress}%`
    }
    if (loadingText) {
        loadingText.innerHTML = `Loading... ${loadedImagesCount}/${totalImagesToLoad}`
    }
    if (loadedImagesCount >= totalImagesToLoad && progressFill) {
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none'
        }, 500)
    }
}

function cleanupOldMeshes() {
    meshes.forEach(mesh => {
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            if (mesh.material.uniforms && mesh.material.uniforms.uTexture) {
                mesh.material.uniforms.uTexture.value.dispose()
            }
            mesh.material.dispose()
        }
    });
    meshes = [];
    materials = [];
    loadedImagesCount = 0
}
async function recreateAllBands() {
    cleanupOldMeshes();
    loadedImagesCount = 0;
    document.getElementById('loading').style.display = 'block';
    updateLoading();
    const bandPromises = [];
    for (let bandIndex = 0; bandIndex < bandConfigs.length; bandIndex++) {
        const config = bandConfigs[bandIndex];
        const imagesCount = IMAGES_PER_BAND[bandIndex];
        const promise = new Promise((resolve) => {
            loadImagesForBand(bandIndex, imagesCount, (images) => {
                const textureData = createHorizontalTextureForBand(images, config.name);
                const texture = new THREE.Texture(textureData.canvas);
                texture.needsUpdate = !0;
                resolve({
                    bandIndex: bandIndex,
                    config: config,
                    texture: texture,
                    textureData: textureData
                })
            })
        });
        bandPromises.push(promise)
    }
    const bandResults = await Promise.all(bandPromises);
    bandResults.forEach(result => {
        const {
            bandIndex,
            config,
            texture,
            textureData
        } = result;
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uResolution: {
                    value: new THREE.Vector2()
                },
                uTexture: {
                    value: texture
                },
                uTextureWidth: {
                    value: textureData.totalWidth
                },
                uSequenceWidth: {
                    value: textureData.sequenceWidth
                },
                uBandHeight: {
                    value: BAND_HEIGHT
                },
                uScroll: {
                    value: 0
                },
                uSpeed: {
                    value: config.speed
                },
                uOffsetY: {
                    value: config.offsetY
                },
                uRotation: {
                    value: config.rotation
                },
                uRotationType: {
                    value: config.rotationType === "fromLeft" ? 1.0 : 0.0
                },
                uHasRotation: {
                    value: config.rotation !== 0 ? 1.0 : 0.0
                },
                uBandIndex: {
                    value: bandIndex
                },
                uCurveAmount: {
                    value: config.curveAmount
                },
                uCurveDirection: {
                    value: config.curveDirection
                },
                uTime: {
                    value: 0
                }
            },
            vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
            fragmentShader: `
                        precision highp float;
                        
                        uniform vec2 uResolution;
                        uniform sampler2D uTexture;
                        uniform float uTextureWidth;
                        uniform float uSequenceWidth;
                        uniform float uBandHeight;
                        uniform float uScroll;
                        uniform float uSpeed;
                        uniform float uOffsetY;
                        uniform float uRotation;
                        uniform float uRotationType;
                        uniform float uHasRotation;
                        uniform float uBandIndex;
                        uniform float uCurveAmount;
                        uniform float uCurveDirection;
                        uniform float uTime;
                        
                        varying vec2 vUv;
                        
                        mat2 rotate2d(float angle) {
                            return mat2(cos(angle), -sin(angle),
                                      sin(angle), cos(angle));
                        }
                        
                        void main() {
                            vec2 pixelCoord = vUv * uResolution;
                            vec2 originalPixelCoord = pixelCoord;
                            
                            // COURBURE HORIZONTALE
                            float normalizedX = pixelCoord.x / uResolution.x;
                            float curveFactor = 4.0 * (normalizedX - 0.5) * (normalizedX - 0.5);
                            float curveOffset = (0.5 - curveFactor) * uCurveAmount * uCurveDirection;
                            
                            // Position verticale de la bande
                            float bandTopBase = (uResolution.y - uBandHeight) * 0.5 + uOffsetY;
                            float bandTop = bandTopBase + curveOffset;
                            float bandBottom = bandTop + uBandHeight;
                            
                            float bandCenterY = bandTopBase + (uBandHeight * 0.5);
                            
                            // ROTATION HORIZONTALE
                            if (uHasRotation > 0.5) {
                                vec2 rotationCenter;
                                
                                if (uRotationType > 0.5) {
                                    // Rotation depuis la gauche
                                    rotationCenter = vec2(0.0, bandCenterY);
                                } else {
                                    // Rotation depuis le centre
                                    rotationCenter = vec2(uResolution.x * 0.5, bandCenterY);
                                }
                                
                                pixelCoord -= rotationCenter;
                                pixelCoord = rotate2d(uRotation) * pixelCoord;
                                pixelCoord += rotationCenter;
                                
                                originalPixelCoord -= rotationCenter;
                                originalPixelCoord = rotate2d(uRotation) * originalPixelCoord;
                                originalPixelCoord += rotationCenter;
                                
                                vec2 rotatedBandTop = vec2(0.0, bandTop);
                                vec2 rotatedBandBottom = vec2(0.0, bandBottom);
                                
                                rotatedBandTop -= rotationCenter;
                                rotatedBandTop = rotate2d(uRotation) * rotatedBandTop;
                                rotatedBandTop += rotationCenter;
                                
                                rotatedBandBottom -= rotationCenter;
                                rotatedBandBottom = rotate2d(uRotation) * rotatedBandBottom;
                                rotatedBandBottom += rotationCenter;
                                
                                bandTop = min(rotatedBandTop.y, rotatedBandBottom.y);
                                bandBottom = max(rotatedBandTop.y, rotatedBandBottom.y);
                            }
                            
                            // Vérifier si on est dans la bande
                            float margin = 3.0;
                            if (pixelCoord.y < bandTop - margin || pixelCoord.y > bandBottom + margin) {
                                discard;
                                return;
                            }
                            
                            // DÉFILEMENT HORIZONTAL
                            float scrollPos = uScroll * uSpeed;
                            
                            // Défilement infini horizontal
                            float wrappedX = mod(originalPixelCoord.x + scrollPos, uSequenceWidth);
                            
                            // Utiliser le clone du milieu
                            float cloneIndex = 1.0;
                            float textureX = (wrappedX + (cloneIndex * uSequenceWidth)) / uTextureWidth;
                            
                            // Coordonnées de texture
                            float texY = (pixelCoord.y - bandTop) / (bandBottom - bandTop);
                            
                            // Vérifier les limites de texture
                            if (textureX < 0.0 || textureX > 1.0 || texY < 0.0 || texY > 1.0) {
                                discard;
                                return;
                            }
                            
                            // Lire la texture
                            vec4 color = texture2D(uTexture, vec2(textureX, texY));
                            
                            // Masque alpha strict
                            if (color.a < 0.5) {
                                discard;
                                return;
                            }
                            
                            // Antialiasing des bords
                            float edge = min(pixelCoord.y - bandTop, bandBottom - pixelCoord.y);
                            if (edge < margin) {
                                color.a *= smoothstep(0.0, margin, edge);
                            }
                            
                            if (color.a < 0.01) {
                                discard;
                                return;
                            }
                            
                            // Légère teinte par bande
                            float hueShift = uBandIndex * 0.1;
                            color.r *= (1.0 + sin(hueShift) * 0.02);
                            color.g *= (1.0 + sin(hueShift + 2.094) * 0.02);
                            color.b *= (1.0 + sin(hueShift + 4.188) * 0.02);
                            
                            gl_FragColor = color;
                        }
                    `,
            transparent: !0,
            depthTest: !1,
            depthWrite: !1,
            alphaTest: 0.5
        });
        materials.push(material);
        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = bandIndex * -0.1;
        scene.add(mesh);
        meshes.push(mesh)
    })
}
let isDragging = !1;
let lastMouseY = 0;
const inertia = 0.92;
document.addEventListener('wheel', function(e) {
    e.preventDefault();
    const delta = e.deltaY;
    targetScrollY += delta;
    scrollVelocity = delta * 0.15
}, {
    passive: !1
});
document.addEventListener('keydown', function(e) {
    switch (e.key) {
        case 'ArrowRight':
            e.preventDefault();
            targetScrollY -= 50;
            scrollVelocity = -8;
            break;
        case 'ArrowLeft':
            e.preventDefault();
            targetScrollY += 50;
            scrollVelocity = 8;
            break;
        case ' ':
            e.preventDefault();
            scrollVelocity = -scrollVelocity * 1.5;
            break;
        case 'r':
        case 'R':
            e.preventDefault();
            recreateAllBands();
            break
    }
});
document.addEventListener('mousedown', function(e) {
    isDragging = !0;
    lastMouseY = e.clientY;
    scrollVelocity = 0;
    document.body.style.cursor = 'grabbing'
});
document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    const deltaY = e.clientY - lastMouseY;
    targetScrollY += deltaY * 2.0;
    lastMouseY = e.clientY;
    scrollVelocity = deltaY * 0.25
});
document.addEventListener('mouseup', function() {
    isDragging = !1;
    document.body.style.cursor = 'default'
});
let lastTouchY = 0;
document.addEventListener('touchstart', function(e) {
    e.preventDefault();
    lastTouchY = e.touches[0].clientY
}, {
    passive: !1
});
document.addEventListener('touchmove', function(e) {
    e.preventDefault();
    const touchY = e.touches[0].clientY;
    const deltaY = touchY - lastTouchY;
    targetScrollY += deltaY * 2.5;
    lastTouchY = touchY;
    scrollVelocity = deltaY * 0.3
}, {
    passive: !1
});

function applyInertia() {
    if (!isDragging) {
        targetScrollY += scrollVelocity;
        scrollVelocity *= inertia;
        if (Math.abs(scrollVelocity) < 0.5) {
            scrollVelocity = 0
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    applyInertia();
    const smoothing = isDragging ? 0.3 : 0.1;
    scrollY += (targetScrollY - scrollY) * smoothing;
    materials.forEach((material, index) => {
        material.uniforms.uScroll.value = scrollY;
        material.uniforms.uTime.value += 0.016;
        material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
    });
    renderer.render(scene, camera)
}
document.addEventListener('dblclick', function() {
    targetScrollY = 0;
    scrollVelocity = 0
});
renderer.domElement.addEventListener('contextmenu', function(e) {
    e.preventDefault()
});
window.addEventListener('resize', function() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    materials.forEach(material => {
        material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
    })
});
console.log("&Toc on codepen - https://codepen.io/ol-ivier");
function init() {
    totalImagesToLoad = IMAGES_PER_BAND.reduce((sum, count) => sum + count, 0);
    recreateAllBands();
    animate()
}
init()
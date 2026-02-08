// The Living Ocean - FULL PAGE REALISTIC UNDERWATER EXPERIENCE
// Rematch: Bioluminescence & Bloom (r128 safe version)

let scene, camera, renderer, composer;
let clock, jellyfishGroup, bubbles, lightRays, causticsMesh;
let planktonMesh, planktonData, bloomPass;
let anglerFish, anglerLure, lureLight;
let anchorMesh;
let mouseX = 0, mouseY = 0;
let scrollDepth = 0;
let raycaster = new THREE.Raycaster();
let mouseVector = new THREE.Vector2();
let mouseWorldPos = new THREE.Vector3();

const dummy = new THREE.Object3D();

// Ocean depth zones
const ZONES = {
    SURFACE: { start: 0, end: 0.2, color: 0x002233, fog: 0.0006 },
    TWILIGHT: { start: 0.2, end: 0.5, color: 0x000508, fog: 0.001 },
    MIDNIGHT: { start: 0.5, end: 0.75, color: 0x00050a, fog: 0.002 },
    ABYSS: { start: 0.75, end: 1, color: 0x000000, fog: 0.004 }
};

const oceanState = {
    uTime: { value: 0 },
    uTurbulence: { value: 0.4 },
    uBioLuma: { value: 0.3 },
    uDepth: { value: 0 }
};

function initThreeJS() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x002233);
    scene.fog = new THREE.FogExp2(ZONES.SURFACE.color, ZONES.SURFACE.fog);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
    camera.position.z = 500;

    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: false,
        antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x002233, 1);

    clock = new THREE.Clock();

    // --- POST PROCESSING (BLOOM + PROCEDURAL GOD RAYS) ---
    try {
        if (typeof THREE.EffectComposer !== 'undefined' &&
            typeof THREE.RenderPass !== 'undefined' &&
            typeof THREE.ShaderPass !== 'undefined') {

            composer = new THREE.EffectComposer(renderer);
            composer.setSize(window.innerWidth, window.innerHeight);

            const renderPass = new THREE.RenderPass(scene, camera);
            composer.addPass(renderPass);

            /* 
            // Procedural God Ray Pass REMOVED as per user request
            const godRayShader = { ... }; 
            const godRayPass = new THREE.ShaderPass(godRayShader);
            composer.addPass(godRayPass);
            */

            if (typeof THREE.UnrealBloomPass !== 'undefined') {
                bloomPass = new THREE.UnrealBloomPass(
                    new THREE.Vector2(window.innerWidth, window.innerHeight),
                    1.2,  // Slightly more base strength
                    0.6,  // RADIANT SPREAD (Allow spread again)
                    0.0
                );
                composer.addPass(bloomPass);
            }

            const copyPass = new THREE.ShaderPass(THREE.CopyShader);
            copyPass.renderToScreen = true;
            composer.addPass(copyPass);
        }
    } catch (e) {
        console.error("🌸 Post-processing failed:", e);
        composer = null;
    }

    createLighting();
    createOceanBackground();
    createRealisticBubbles();
    // createVolumetricGodRays(); // DEPRECATED for Procedural Pass
    createWaterSurface();
    createMarineSnow();
    createHighFidelityCaustics();
    createJellyfish();
    createBioluminescentPlankton();
    createAnglerFish();
    createSunkenAnchor();

    document.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('scroll', onScroll, false);

    onScroll();
    animate();
}

// --- LIGHTING ---
let sunLight, globalAmbient;
function createLighting() {
    globalAmbient = new THREE.AmbientLight(0x002233, 0.1); // Start DIM
    scene.add(globalAmbient);
    sunLight = new THREE.DirectionalLight(0xffffff, 0.5); // Start DIM
    sunLight.position.set(0, 1000, -200);
    scene.add(sunLight);
}

// --- OCEAN BACKGROUND ---
function createOceanBackground() {
    const bgGeometry = new THREE.PlaneGeometry(10000, 10000);
    const bgMaterial = new THREE.ShaderMaterial({
        uniforms: { uDepth: oceanState.uDepth, uTime: oceanState.uTime },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            uniform float uDepth; uniform float uTime; varying vec2 vUv;
            void main() {
                vec3 surfaceColor = vec3(0.15, 0.3, 0.5); // Calm Azure
                vec3 midColor = vec3(0.0, 0.05, 0.1); // Darker Mid-depth
                vec3 abyssColor = vec3(0.0, 0.0, 0.0);
                
                // Linear descent: Darken consistent with scroll
                float t = uDepth; 
                
                vec3 color;
                if (t < 0.5) {
                    color = mix(surfaceColor, midColor, t * 2.0);
                } else {
                    color = mix(midColor, abyssColor, (t - 0.5) * 2.0);
                }
                gl_FragColor = vec4(color, 1.0);
            }
        `
    });
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.position.z = -2000;
    scene.add(bgMesh);
}

// --- PLANKTON ---
function createBioluminescentPlankton() {
    const count = 1000;
    const geometry = new THREE.SphereGeometry(2, 8, 8);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,        // White for clear glass
        roughness: 0.1,
        metalness: 0.0,
        transmission: 0.9,      // Transparent body
        thickness: 1.0,
        ior: 1.33,
        transparent: true,
        opacity: 1.0,           // Transmission handles it
        emissive: 0x00ffff,
        emissiveIntensity: 0.5,
        toneMapped: false,
        fog: false
    });

    planktonMesh = new THREE.InstancedMesh(geometry, material, count);
    planktonData = [];

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 3000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 1500;
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        planktonMesh.setMatrixAt(i, dummy.matrix);
        planktonData.push({ x, y, z, speed: 0.5 + Math.random(), phase: Math.random() * 10 });
    }
    scene.add(planktonMesh);
}

// --- CINEMATIC WATER SURFACE ---
function createWaterSurface() {
    const geometry = new THREE.PlaneGeometry(12000, 12000, 192, 192);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: oceanState.uTime,
            uDepth: oceanState.uDepth,
            uSurfaceColor: { value: new THREE.Color(0x002233) },
            uSkyColor: { value: new THREE.Color(0xaabbcc) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying float vWave;
            uniform float uTime;
            void main() {
                vUv = uv;
                vec3 pos = position;
                float w1 = sin(pos.x * 0.005 + uTime * 0.5) * 35.0;
                float w2 = cos(pos.y * 0.007 + uTime * 0.9) * 20.0;
                float w3 = sin(pos.x * 0.01 + pos.y * 0.005 + uTime * 1.2) * 10.0; // Added detail ripple
                vWave = w1 + w2 + w3;
                pos.z += vWave;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uDepth;
            uniform vec3 uSurfaceColor;
            uniform vec3 uSkyColor;
            varying vec2 vUv;
            varying float vWave;
            
            float noise(vec2 p) {
                return sin(p.x * 12.0 + uTime) * sin(p.y * 8.0 - uTime * 0.5) + sin(p.x * 24.0 - uTime * 1.5) * 0.5;
            }
            
            void main() {
                // ORGANIC UV DISTORTION (Stronger for "breaking light" feel)
                vec2 distortedUv = vUv + vec2(noise(vUv * 15.0 + uTime * 0.2) * 0.02);
                float centerDist = length(distortedUv - 0.5);
                
                // Breaking Light (Sharper sun gradients)
                float sun = pow(clamp(1.0 - centerDist * 2.2, 0.0, 1.0), 3.0);
                float sunCore = pow(clamp(1.0 - centerDist * 4.5, 0.0, 1.0), 8.0); // Intense core
                
                // Ripples highlight
                float ripple = smoothstep(0.4, 0.6, noise(vUv * 40.0 + uTime)) * 0.1;
                
                vec3 deepBase = vec3(0.0, 0.02, 0.04);
                vec3 finalColor = mix(deepBase, uSurfaceColor, sun * 0.7 + ripple);
                finalColor = mix(finalColor, uSkyColor, sunCore);
                
                float alpha = (1.0 - uDepth * 2.2) * (0.3 + sun * 0.8 + ripple); // Brighter alpha
                gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
            }
        `,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 1200;
    scene.add(mesh);
}

// --- BUBBLES ---
function createRealisticBubbles() {
    bubbles = new THREE.Group(); scene.add(bubbles);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,        // Pure white base
        roughness: 0.05,        // Smooth glass
        metalness: 0.1,
        transmission: 0.95,     // High transparency
        thickness: 1.0,
        ior: 1.33,              // Water refraction
        transparent: true,
        opacity: 0.9,
        fog: false,             // Shine through abyss
        emissive: 0x000000,     // NO GLOW
        clearcoat: 1.0
    });
    for (let i = 0; i < 80; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(Math.random() * 8 + 2, 16, 16), material);
        b.position.set((Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 800);
        b.userData = { speed: 0.3 + Math.random() * 0.4, wobble: Math.random() * 2, phase: Math.random() * Math.PI };
        bubbles.add(b);
    }
}

// createVolumetricGodRays() REMOVED in favor of procedural Post-Processing pass

// --- ATMOSPHERIC MARINE SNOW ---
function createMarineSnow() {
    const count = 1800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const snowData = [];

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 3000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 1500;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        snowData.push({
            speed: 0.1 + Math.random() * 0.15,
            drift: (Math.random() - 0.5) * 0.08
        });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0x88ccff,
        size: 1.8,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    points.userData.snowData = snowData;
    scene.add(points);
    scene.marineSnow = points;
}

// --- CAUSTICS ---
function createHighFidelityCaustics() {
    const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: oceanState.uTime, uDepth: oceanState.uDepth },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            uniform float uTime; uniform float uDepth; varying vec2 vUv;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float voronoi(vec2 x) {
                vec2 n = floor(x); vec2 f = fract(x); float m = 1.0;
                for(int j=-1; j<=1; j++) for(int i=-1; i<=1; i++) {
                    vec2 g = vec2(float(i),float(j));
                    float o = hash(n + g); o = 0.5 + 0.5*sin(uTime + 6.28*o);
                    m = min(m, length(g + o - f));
                }
                return m;
            }
            void main() {
                float v = pow(1.0 - voronoi(vUv * 15.0), 12.0);
                gl_FragColor = vec4(vec3(v), v * 0.2 * (1.0 - uDepth));
            }
        `,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    causticsMesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat);
    causticsMesh.rotation.x = -Math.PI / 2; causticsMesh.position.y = -400;
    scene.add(causticsMesh);
}

// --- ANGLER FISH (LURKER OF THE ABYSS) ---
function createAnglerFish() {
    anglerFish = new THREE.Group();

    const fishMaterial = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1.0, metalness: 0.0, transparent: true });
    const stealthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });

    // Body - Main mass
    const body = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 32), fishMaterial);
    body.scale.set(1.6, 1, 1.1);
    anglerFish.add(body);

    // Jaw - Lower part
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(35, 32, 32, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), fishMaterial);
    jaw.position.set(15, -10, 0);
    jaw.rotation.x = Math.PI;
    anglerFish.add(jaw);

    // Eyes - Glowing
    const eyeGeom = new THREE.SphereGeometry(4, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3300, fog: false, transparent: true });
    const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
    eyeL.position.set(35, 12, 18);
    const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
    eyeR.position.set(35, 12, -18);
    anglerFish.add(eyeL, eyeR);

    // Fins - Dorsal (Top) - Stealth
    const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 2), stealthMaterial);
    dorsalFin.position.set(-20, 35, 0);
    dorsalFin.rotation.z = -0.5;
    anglerFish.add(dorsalFin);

    // Fins - Pectoral (Sides) - Stealth
    const pecFinL = new THREE.Mesh(new THREE.BoxGeometry(20, 15, 1), stealthMaterial);
    pecFinL.position.set(0, -5, 45);
    pecFinL.rotation.y = 0.5;
    const pecFinR = new THREE.Mesh(new THREE.BoxGeometry(20, 15, 1), stealthMaterial);
    pecFinR.position.set(0, -5, -45);
    pecFinR.rotation.y = -0.5;
    anglerFish.add(pecFinL, pecFinR);

    // Tail Fin - Stealth
    const tail = new THREE.Mesh(new THREE.BoxGeometry(30, 60, 2), stealthMaterial);
    tail.position.set(-70, 0, 0);
    tail.rotation.y = 0.2;
    anglerFish.add(tail);

    // Fangs - Massive, lethal white fangs
    const fangMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true });
    for (let i = 0; i < 4; i++) {
        const ut = new THREE.Mesh(new THREE.ConeGeometry(3.5, 35, 4), fangMat);
        ut.position.set(45, 8, (i - 1.5) * 14);
        ut.rotation.z = -Math.PI / 1.15;
        anglerFish.add(ut);

        const lt = new THREE.Mesh(new THREE.ConeGeometry(2, 25, 4), fangMat);
        lt.position.set(40, -25, (i - 1.5) * 12);
        lt.rotation.z = Math.PI / 1.1;
        anglerFish.add(lt);
    }

    // The Rod (Angler)
    const rodCurve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(20, 30, 0),
        new THREE.Vector3(40, 70, 0),
        new THREE.Vector3(90, 60, 0),
        new THREE.Vector3(85, 20, 0)
    );
    const rodGeom = new THREE.TubeGeometry(rodCurve, 20, 1.5, 8, false);
    const rod = new THREE.Mesh(rodGeom, fishMaterial);
    anglerFish.add(rod);

    // The Lure - MASSIVE HDR BLOOD GLOW
    anglerLure = new THREE.Mesh(
        new THREE.SphereGeometry(7, 16, 16),
        new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 500.0, // SHARPER BURN (Boosted for user)
            toneMapped: false,
            fog: false
        })
    );
    anglerLure.position.set(85, 20, 0);
    anglerFish.add(anglerLure);

    // Lure Light - Massive reach for Anchor Reflections
    lureLight = new THREE.PointLight(0xff0000, 30, 2000);
    lureLight.position.set(85, 20, 0);
    anglerFish.add(lureLight);

    anglerFish.position.set(-1000, -100, 0);
    anglerFish.userData = { speed: 1.0, phase: 0 };
    scene.add(anglerFish);
}

// --- SUNKEN ANCHOR (HIGH-FIDELITY RECONSTRUCTION) ---
function createSunkenAnchor() {
    anchorMesh = new THREE.Group();

    // High-Fidelity "Forged Iron" material
    const anchorMat = new THREE.MeshStandardMaterial({
        color: 0x222222, // Lighter silhouette for better contrast in deep water
        roughness: 1.0,  // Pure Matte
        metalness: 0.0,  // Completely non-metallic
        emissive: 0x000000,
        transparent: true,
        fog: false,
        opacity: 0
    });

    // 1. Tapered Shank (Forge-hewn column)
    const shankGeom = new THREE.CylinderGeometry(6, 11, 325, 16);
    const shank = new THREE.Mesh(shankGeom, anchorMat);
    anchorMesh.add(shank);

    // 2. Triangular Crown (Sharp forged base)
    const crownShape = new THREE.Shape();
    crownShape.moveTo(0, 0);
    crownShape.lineTo(-30, -45);
    crownShape.lineTo(30, -45);
    crownShape.lineTo(0, 0);

    const crownExtrude = new THREE.ExtrudeGeometry(crownShape, { depth: 24, bevelEnabled: true, bevelSize: 3 });
    const crown = new THREE.Mesh(crownExtrude, anchorMat);
    crown.position.set(0, -135, -12);
    crown.rotation.x = Math.PI;
    anchorMesh.add(crown);

    // 3. Forged Stock (Square-profile bar with center block)
    const stockGroup = new THREE.Group();
    stockGroup.position.y = 110;
    stockGroup.rotation.z = Math.PI / 2;

    const stockCenter = new THREE.Mesh(new THREE.BoxGeometry(25, 20, 20), anchorMat);
    const stockArmL = new THREE.Mesh(new THREE.BoxGeometry(90, 12, 12), anchorMat);
    stockArmL.position.x = -55;
    const stockArmR = new THREE.Mesh(new THREE.BoxGeometry(90, 12, 12), anchorMat);
    stockArmR.position.x = 55;

    const stockEndL = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), anchorMat);
    stockEndL.position.x = -100;
    const stockEndR = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 8), anchorMat);
    stockEndR.position.x = 100;

    stockGroup.add(stockCenter, stockArmL, stockArmR, stockEndL, stockEndR);
    anchorMesh.add(stockGroup);

    // 4. Head Hardware (Eye & Shackle)
    const shankEye = new THREE.Mesh(new THREE.TorusGeometry(12, 5, 12, 24), anchorMat);
    shankEye.position.y = 162.5;
    anchorMesh.add(shankEye);

    const shackle = new THREE.Mesh(new THREE.TorusGeometry(15, 5, 12, 24, Math.PI), anchorMat);
    shackle.position.y = 175;
    shackle.rotation.z = Math.PI / 2;
    anchorMesh.add(shackle);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 7, 12, 32), anchorMat);
    ring.position.y = 195;
    anchorMesh.add(ring);

    // 5. Aggressive Curved Arms
    const armGroup = new THREE.Group();
    armGroup.position.y = -55;
    const armGeom = new THREE.TorusGeometry(100, 11, 12, 32, Math.PI * 0.82);
    const arms = new THREE.Mesh(armGeom, anchorMat);
    arms.rotation.z = Math.PI * 1.09;
    armGroup.add(arms);

    // 6. Triangular Flukes
    const flukeShape = new THREE.Shape();
    flukeShape.moveTo(0, 0);
    flukeShape.lineTo(-30, -50);
    flukeShape.lineTo(30, -50);
    flukeShape.lineTo(0, 0);
    const flukeExtrude = new THREE.ExtrudeGeometry(flukeShape, { depth: 8, bevelEnabled: true, bevelSize: 2 });

    const flukeL = new THREE.Mesh(flukeExtrude, anchorMat);
    flukeL.position.set(-96, -26, 0);
    flukeL.rotation.set(0, -Math.PI / 2, Math.PI / 5 + 0.2);
    const flukeR = new THREE.Mesh(flukeExtrude, anchorMat);
    flukeR.position.set(96, -26, 0);
    flukeR.rotation.set(0, Math.PI / 2, -Math.PI / 5 - 0.2);
    armGroup.add(flukeL, flukeR);
    anchorMesh.add(armGroup);

    // 7. Spiral Chain Wrap
    const chainGroup = new THREE.Group();
    const linkGeom = new THREE.TorusGeometry(14, 4, 10, 20);
    const linkCount = 20;
    for (let i = 0; i < linkCount; i++) {
        const link = new THREE.Mesh(linkGeom, anchorMat);
        const t = i / (linkCount - 1);
        const angle = t * Math.PI * 3.5;
        const radius = 18;
        const h = -120 + t * 300;
        link.position.set(Math.cos(angle) * radius, h, Math.sin(angle) * radius);
        link.rotation.set(angle, Math.PI / 4, 0);
        chainGroup.add(link);
    }
    anchorMesh.add(chainGroup);

    anchorMesh.scale.set(1.4, 1.4, 1.4);
    anchorMesh.position.set(400, -150, -300); // MOVED TO RIGHT (x=400)
    anchorMesh.rotation.set(0.35, -0.7, 0.1);
    scene.add(anchorMesh);
}

// --- JELLYFISH ---
function createJellyfish() {
    jellyfishGroup = new THREE.Group(); scene.add(jellyfishGroup);
    const colors = [0xff88cc, 0x88ffcc, 0x88aaff];
    for (let i = 0; i < 6; i++) { // Reduced count from 12 to 6 per user request
        const group = new THREE.Group();
        const color = colors[i % 3];
        const bell = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.55),
            new THREE.MeshStandardMaterial({
                color: 0x000000, // Black base for maximum glow contrast
                emissive: color,
                emissiveIntensity: 2.5,
                roughness: 0.2,
                metalness: 0.5,
                transparent: true,
                opacity: 0.8,      // Semi-solid for "biological" density
                side: THREE.DoubleSide,
                toneMapped: false
            })
        );
        bell.scale.set(1, 0.6, 1); group.add(bell);

        // --- THE BIOLOGICAL "BALL" TENTACLES (STRETCH VERSION) ---
        for (let t = 0; t < 6; t++) { // Reduced count for clarity
            const tentacleGroup = new THREE.Group();
            const angle = (t / 6) * Math.PI * 2;
            const r = 22;
            tentacleGroup.position.set(Math.cos(angle) * r, -8, Math.sin(angle) * r);

            for (let s = 0; s < 10; s++) { // SHORTER length
                const beadSize = 1.5 * (1.0 - s / 15.0); // Reduced bead size
                const bead = new THREE.Mesh(
                    new THREE.SphereGeometry(beadSize, 10, 10),
                    new THREE.MeshStandardMaterial({
                        color: 0x000000,
                        emissive: color,
                        emissiveIntensity: 6.0,
                        transparent: true,
                        opacity: 0.9,
                        side: THREE.DoubleSide,
                        toneMapped: false,
                        fog: false
                    })
                );
                bead.position.y = -s * 6;
                bead.userData = { phase: Math.random() * Math.PI, offset: s };
                tentacleGroup.add(bead);
            }
            group.add(tentacleGroup);
        }

        group.position.set((Math.random() - 0.5) * 1200, (Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 600);
        group.userData = { phase: Math.random() * 10, speed: 0.3 + Math.random() * 0.3, originalColor: new THREE.Color(color) };
        jellyfishGroup.add(group);
    }
}

// --- ANIMATION LOOP (FULL CINEMATIC SYNC) ---
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    oceanState.uTime.value = time;

    // Update Procedural Sun Position and Unis for God Rays
    if (composer && composer.passes.length > 1) {
        const godRayPass = composer.passes[1]; // Index 1 is GodRayPass
        if (godRayPass.uniforms) {
            if (godRayPass.uniforms.uSunPosition) {
                const sunPos = sunLight.position.clone().project(camera);
                godRayPass.uniforms.uSunPosition.value.set(sunPos.x, sunPos.y, sunPos.z);
            }
            // CRITICAL FIX: ShaderPass clones uniforms, so we must update the clone instance
            if (godRayPass.uniforms.uDepth) godRayPass.uniforms.uDepth.value = scrollDepth;
            if (godRayPass.uniforms.uTime) godRayPass.uniforms.uTime.value = time;
        }
    }

    // Mouse Projection
    mouseVector.x = (mouseX / (window.innerWidth / 2));
    mouseVector.y = -(mouseY / (window.innerHeight / 2));
    raycaster.setFromCamera(mouseVector, camera);
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    raycaster.ray.intersectPlane(planeZ, mouseWorldPos);

    // Animate Bubbles
    if (bubbles) bubbles.children.forEach(b => {
        b.position.y += b.userData.speed;
        b.position.x += Math.sin(time + b.userData.phase) * 0.5;
        if (b.position.y > 1000) b.position.y = -1000;
    });

    // Animate Jellyfish
    if (jellyfishGroup) jellyfishGroup.children.forEach(j => {
        const distSq = raycaster.ray.distanceSqToPoint(j.position);
        const interactionRadiusSq = 140 * 140;
        let iAlpha = 0;
        if (distSq < interactionRadiusSq) {
            const dist = Math.sqrt(distSq);
            iAlpha = Math.pow(1.0 - dist / 140, 2.0);
        }
        // Fix Jitter: Don't modulate frequency with iAlpha directly to avoid phase jumps.
        // Instead, just boost amplitude/scale.
        const cycle = (time * j.userData.speed + j.userData.phase) % 1.0;
        const pulse = Math.sin(cycle * Math.PI);
        j.scale.set(1 - pulse * 0.1, 1 + pulse * 0.1, 1 - pulse * 0.1);
        j.position.y += (cycle < 0.3 ? pulse : 0.1);
        if (j.position.y > 1000) j.position.y = -1000;

        // Bioluminescent Sync
        const originalColor = j.userData.originalColor;
        const arpeggioHue = (time * 0.8) % 1.0;
        const glowFactor = scrollDepth;
        const lifeGlowScale = 1.0 + glowFactor * 5.0; // Max 6.0 (RADIANT)

        if (j.children[0] && j.children[0].material) {
            // --- DYNAMIC "PUSH & PULL" BEAD PHYSICS ---
            for (let t = 1; t < j.children.length; t++) {
                const tentacleGroup = j.children[t];
                tentacleGroup.children.forEach((bead, s) => {
                    const wave = Math.sin(time * 3.0 + j.userData.phase + s * 0.4);
                    bead.position.x = wave * (s * 1.5); // Tighter sway
                    bead.position.z = Math.cos(time * 2.5 + j.userData.phase + s * 0.3) * (s * 1.5);

                    // PULSE-DRIVEN STRETCH (The Pull)
                    const stretch = 1.0 + pulse * 0.5;
                    bead.position.y = -s * (5.0 * stretch) + Math.sin(time * 4.0 + s) * 1.5;
                });
            }

            // --- UNIFIED BIOLOGICAL SYNC (Color + Pulse Strength) ---
            const isPurple = arpeggioHue > 0.6 && arpeggioHue < 0.85;
            const glowBoost = isPurple ? 1.8 : 1.0;

            // 1. Sync Bell Color
            if (iAlpha > 0.1) {
                j.children[0].material.color.setHSL(arpeggioHue, 1.0, 0.5); // TINT GLASS ON HOVER
                j.children[0].material.emissive.setHSL(arpeggioHue, 1.0, 0.5);
            } else {
                j.children[0].material.color.setHex(0xffffff); // RESET TO CLEAR WHITE
                j.children[0].material.emissive.copy(originalColor);
            }

            // 2. Sync Bell Intensity (Breathing with the Pulse)
            const pulseIntensity = 0.5 + pulse * 0.5; // 0.0 to 1.0 based on movement

            // ANTI-GLOW DYNAMICS: 
            // Surface (depth 0): dim ~0.5 intensity (No shine, just color)
            // Abyss (depth 1): bright ~800.0 base intensity (DYNAMIC ULTRA RADIANCE)
            const surfaceBase = 0.5;
            const abyssalBoost = glowFactor * 800.0;

            const finalIntensity = (surfaceBase + abyssalBoost + iAlpha * 50.0) * lifeGlowScale * (0.8 + pulseIntensity * 0.4);
            j.children[0].material.emissiveIntensity = finalIntensity;

            // 3. Propagate to Beaded Tentacles
            for (let t = 1; t < j.children.length; t++) {
                const tentacleGroup = j.children[t];
                tentacleGroup.children.forEach((bead) => {
                    if (bead.material) {
                        // Copy Color from Bell
                        bead.material.color.copy(j.children[0].material.color);
                        bead.material.emissive.copy(j.children[0].material.emissive);
                        // Sync Intensity (Tentacles glow slightly less than bell)
                        bead.material.emissiveIntensity = finalIntensity * 0.8;
                    }
                });
            }
        }
    });

    // Animate Plankton
    if (planktonMesh) {
        // Dinoflagellate Bioluminescence: Glow BRIGHTER in the abyss, not darker
        const bioBrightness = 0.5 + Math.pow(scrollDepth, 2.0) * 2.0;
        planktonMesh.material.emissiveIntensity = bioBrightness;
        // planktonMesh.material.color.setHex(0x000000); // REMOVED to keep glass clear
        planktonMesh.material.emissive.setHex(0x00ffff); // Cyan emission
        for (let i = 0; i < 1000; i++) {
            const d = planktonData[i];
            const dist = Math.sqrt((mouseWorldPos.x - d.x) ** 2 + (mouseWorldPos.y - d.y) ** 2);
            if (dist < 200) { d.x -= (mouseWorldPos.x - d.x) / dist * 5; d.y -= (mouseWorldPos.y - d.y) / dist * 5; }
            d.y += d.speed;
            if (d.y > 1000) d.y = -1000;
            dummy.position.set(d.x, d.y, d.z); dummy.updateMatrix();
            planktonMesh.setMatrixAt(i, dummy.matrix);
        }
        planktonMesh.instanceMatrix.needsUpdate = true;
    }

    // Animate Marine Snow -> REMOVED per user request
    if (scene.marineSnow) {
        scene.marineSnow.visible = false;
    }

    // Animate Angler Fish
    if (anglerFish) {
        anglerFish.position.x += 1.2;
        if (anglerFish.position.x > 1200) anglerFish.position.x = -1200;
        const targetX = -100 + Math.sin(time * 0.5) * 20;
        anglerFish.position.y = targetX;

        const tail = anglerFish.children[4];
        if (tail) tail.rotation.y = Math.sin(time * 4.0) * 0.3;

        // --- RESTORED INTENSE RED LIGHT PHYSICS ---
        // --- RESTORED INTENSE RED LIGHT PHYSICS ---
        // const lureOsc = 0.5 + Math.sin(time * 8.0) * 0.2; // REMOVED PULSE per user request
        const anglerAlpha = Math.max(0, Math.min(1, (scrollDepth - 0.8) / 0.15));
        if (lureLight) {
            lureLight.intensity = 3000.0 * anglerAlpha; // Boosted Intensity
            lureLight.distance = 1500; // Balanced reach
            lureLight.decay = 20.0; // Ultra-extreme falloff for localized glow
            lureLight.color.setHex(0xff0000); // FORCE RED LOCK
        }
        if (anglerLure && anglerLure.material) {
            anglerLure.material.color.setHex(0xff0000); // FORCE RED LOCK
            anglerLure.material.emissive.setHex(0xff0000);
        }

        anglerFish.traverse(child => { if (child.isMesh && child.material) child.material.opacity = anglerAlpha; });
        anglerFish.visible = anglerAlpha > 0;
    }

    // Anchor Transition (INSIDE ANIMATE)
    if (anchorMesh) {
        // Start revealing at 60% scroll instead of 80%
        const anchorAlpha = Math.max(0, Math.min(1, (scrollDepth - 0.6) / 0.2));
        anchorMesh.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.opacity = anchorAlpha;
            }
        });
        anchorMesh.visible = anchorAlpha > 0;
    }

    camera.lookAt(scene.position);
    if (composer) composer.render(); else renderer.render(scene, camera);
}

function onMouseMove(e) { mouseX = e.clientX - window.innerWidth / 2; mouseY = e.clientY - window.innerHeight / 2; }
function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); if (composer) composer.setSize(window.innerWidth, window.innerHeight); }
function onScroll() {
    // --- ROBUST SCROLL DEPTH CALCUIATION ---
    // --- ROBUST SCROLL DEPTH CALCUIATION (DEBUGGED) ---
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const docHeight = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight,
        document.body.clientHeight, document.documentElement.clientHeight
    ) - window.innerHeight;

    scrollDepth = (docHeight > 0) ? Math.max(0, Math.min(1, scrollTop / docHeight)) : 0;

    // DEBUG LOG (Remove later if annoying)
    // console.log("Scroll Depth:", scrollDepth.toFixed(3), "Top:", scrollTop, "H:", docHeight);
    const debugEl = document.getElementById('debug-scroll');
    if (debugEl) {
        debugEl.innerHTML = `Depth: ${scrollDepth.toFixed(3)}<br>Top: ${scrollTop.toFixed(0)}<br>H: ${docHeight.toFixed(0)}`;
    }

    oceanState.uDepth.value = scrollDepth;

    // --- ABSOLUTE ABYSSAL DARKNESS ---
    // At scrollDepth 1.0 (bottom), it should be pitch black.
    // Linear transition as requested by user.
    const darknessProgress = scrollDepth;

    // Interpolate from Navy blue (0x002233) to PURE BLACK (0x000000)
    const surfaceColor = new THREE.Color(0x002233);
    const abyssColor = new THREE.Color(0x000000);
    const currentBg = surfaceColor.clone().lerp(abyssColor, darknessProgress);

    if (scene) {
        scene.background = currentBg;
        if (scene.fog) {
            scene.fog.color.copy(currentBg);
            // gradual fog density from surface to abyss
            scene.fog.density = 0.0006 + scrollDepth * 0.004;
        }
    }
    if (renderer) renderer.setClearColor(currentBg, 1.0);

    // DYNAMIC VIEWPORT DARKENING (The "Banner Dimmer")
    // Light dims but doesn't go completely pitch black until very deep
    // KILL LIGHTS COMPLETELY AT BOTTOM for Anchor reflection isolation
    const surfaceDim = Math.max(0.0, 1.0 - scrollDepth * 1.1); // Hits 0.0 at ~90% depth
    if (sunLight) sunLight.intensity = 0.5 * surfaceDim;
    if (globalAmbient) globalAmbient.intensity = 0.1 * surfaceDim;

    if (bloomPass) {
        // EXPONENTIAL RADIANCE RAMP (Delayed for moody mid-section)
        const dynamicBloom = Math.pow(scrollDepth, 3.0);
        bloomPass.strength = 0.1 + dynamicBloom * 2.4;
        bloomPass.radius = 0.1 + dynamicBloom * 0.7;
    }
}

window.initThreeJS = initThreeJS;
document.addEventListener('DOMContentLoaded', initThreeJS);

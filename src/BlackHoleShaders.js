export const bhVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const bhFragmentShader = `
// fragment.glsl
uniform float uTime;

// Camera / screen parameters
uniform float uAspect;          // viewportWidth / viewportHeight
uniform float uCameraDistance;  // distance from camera to black hole center (in plane space)
uniform float uMaxDistance;     // maximum ray distance for background sampling

// Black hole & lensing parameters
uniform float uBlackHoleRadius; // physical radius in scene units (same space as plane)
uniform float uLensStrength;    // how strongly rays bend near the BH

// Accretion disk parameters
uniform float uDiskInnerRadius;
uniform float uDiskOuterRadius;
uniform float uDiskThickness;   // half-thickness around the disk plane (Y ~ 0)
uniform vec3  uDiskColorInner;  // near inner radius
uniform vec3  uDiskColorOuter;  // near outer radius
uniform float uDopplerStrength; // beaming factor for blue/red shift

// Visual tweak parameters
uniform vec3  uBackgroundColor; // base sky color
uniform float uGlowStrength;    // intensity of photon ring glow

varying vec2 vUv;

// --- NOISE FUNCTIONS (2D simplex) ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
      0.211324865405187,  // (3.0 - sqrt(3.0)) / 6.0
      0.366025403784439,  // 0.5 * (sqrt(3.0) - 1.0)
     -0.577350269189626,  // -1.0 + 2.0 * C.x
      0.024390243902439   // 1.0 / 41.0
  );

  // First corner
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  // Other corners
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  // Permutations
  i = mod289(i);
  vec3 p = permute(
              permute(i.y + vec3(0.0, i1.y, 1.0))
              + i.x + vec3(0.0, i1.x, 1.0)
           );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );

  m = m * m;
  m = m * m;

  // Gradients
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  // Normalise gradients implicitly by scaling m
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  // Compute final noise value at P
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

mat3 rotateX(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
        1.0, 0.0, 0.0,
        0.0,    c,   -s,
        0.0,    s,    c
    );
}

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

// Procedural starry background, sampled by final (bent) ray direction
vec3 sampleBackground(vec3 dir) {
    dir = normalize(dir);

    // Vertical gradient (galactic plane + sky color)
    float v = abs(dir.y);
    float horizon = smoothstep(0.0, 0.6, v);
    vec3 base = mix(vec3(0.015, 0.01, 0.02), uBackgroundColor, horizon);

    // Star mask: noisy bright specks
    float n1 = snoise(dir.xz * 25.0);
    float n2 = snoise(dir.zy * 40.0 + uTime * 0.02);
    float starField = n1 * n2;
    float stars = smoothstep(0.65, 0.95, starField);
    vec3 starColor = vec3(1.0) * stars * 0.9;

    // Slight Milky Way band
    float band = snoise(dir.xy * 5.0);
    float bandMask = smoothstep(0.2, 0.65, band);
    vec3 bandColor = vec3(0.25, 0.22, 0.4) * bandMask * 0.6;

    return base + bandColor + starColor;
}

void main() {
    // Normalized screen-space coordinates centered at (0,0)
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= uAspect;

    float distFromCenter = length(uv);

    // Approximate event horizon radius in screen-space:
    // For small angles, radius_screen ≈ R / cameraDistance.
    float bhScreenRadius = uBlackHoleRadius / uCameraDistance;

    // If ray goes straight through the BH disk (no lensing) => pure shadow + rim glow.
    if (distFromCenter < bhScreenRadius) {
        // Thin photon ring glow
        float inner = bhScreenRadius * 0.7;
        float outer = bhScreenRadius * 1.3;
        float ring = 1.0 - smoothstep(inner, outer, distFromCenter);
        ring = pow(saturate(ring), 3.0); // sharper rim

        vec3 rimColor = vec3(1.0, 0.9, 0.7) * uGlowStrength * ring;

        // Vignette to fade towards plane edges
        float vignette = 1.0 - smoothstep(0.9, 1.1, distFromCenter);

        gl_FragColor = vec4(rimColor, vignette);
        return;
    }

    // --- CAMERA SETUP IN BH LOCAL SPACE ---
    // Camera looking along +Z, BH at origin, disk in XZ plane.
    vec3 camPos = vec3(0.0, 0.0, -uCameraDistance);
    vec3 rayDir = normalize(vec3(uv, 1.0));

    // Tilt the whole system slightly so the disk is not perfectly flat
    float tilt = 0.25;
    mat3 tiltMat = rotateX(tilt);
    camPos = tiltMat * camPos;
    rayDir = tiltMat * rayDir;

    vec3 pos = camPos;

    // Accumulated disk light
    vec3 diskAccum = vec3(0.0);
    float opacityAccum = 0.0;

    const int MAX_STEPS = 80;
    for (int i = 0; i < MAX_STEPS; i++) {
        float r = length(pos);

        if (r > uMaxDistance) {
            break;
        }

        // Gravitational bending: bend towards center roughly ~ 1 / r^2
        float invR = 1.0 / max(r, 0.001);
        float bend = uLensStrength * invR * invR;
        vec3 toCenter = -normalize(pos);
        rayDir = normalize(rayDir + toCenter * bend);

        // Step size grows with distance (cheaper & smoother)
        float stepSize = 0.05 + 0.03 * r;
        pos += rayDir * stepSize;

        // Accretion disk: centered on origin in XZ, finite thickness in Y
        if (abs(pos.y) < uDiskThickness) {
            float d = length(pos.xz);

            if (d > uDiskInnerRadius && d < uDiskOuterRadius) {
                // Radial gradient for color (inner = hotter)
                float tRadial = saturate((d - uDiskInnerRadius) / (uDiskOuterRadius - uDiskInnerRadius));
                vec3 baseColor = mix(uDiskColorInner, uDiskColorOuter, tRadial);

                // Turbulence using noise along angle & radius
                float angle = atan(pos.z, pos.x);
                float orbitalSpeed = 1.5 / sqrt(d); // faster closer in
                float n = snoise(vec2(angle * 4.0 + uTime * orbitalSpeed, d * 0.7));
                float turbulence = 0.5 + 0.5 * n;

                // Simple relativistic beaming / Doppler shift:
                // Tangential velocity direction (disk rotates counter-clockwise in XZ).
                vec3 velDir = normalize(vec3(-pos.z, 0.0, pos.x));
                float cosTheta = dot(velDir, -rayDir); // >0 => moving towards camera
                float beaming = 1.0 + uDopplerStrength * cosTheta;
                beaming = clamp(beaming, 0.3, 3.0);

                // Color shift towards blue on approaching side, red on receding
                float shift = 0.5 + 0.5 * cosTheta;
                vec3 blueish = vec3(0.6, 0.7, 1.0);
                vec3 reddish = vec3(1.0, 0.6, 0.4);
                vec3 shiftColor = mix(reddish, blueish, shift);

                vec3 diskColor = baseColor * turbulence;
                diskColor = mix(diskColor, shiftColor, 0.35);

                // Gravitational darkening near the BH
                float g = smoothstep(uBlackHoleRadius * 1.1, uDiskInnerRadius, r);
                diskColor *= g;

                // Integrate along ray
                float intensity = 0.06 * (1.2 - tRadial) * (0.7 + 0.6 * turbulence) * beaming;

                diskAccum += diskColor * intensity;
                opacityAccum += intensity;
            }
        }
    }

    // Final bent direction from last position for background lookup
    vec3 finalDir = normalize(pos - camPos);
    vec3 bgColor = sampleBackground(finalDir);

    // Map accumulated opacity to [0,1].
    float diskAlpha = saturate(opacityAccum);

    // Combine background + disk emission (additive; BH sits in front of her own background)
    vec3 color = bgColor * (1.0 - diskAlpha) + diskAccum;

    // Soft radial vignette to hide plane edges
    float radialMask = 1.0 - smoothstep(0.9, 1.1, distFromCenter);

    float alpha = saturate(diskAlpha + radialMask * 0.3);
    alpha *= radialMask;

    gl_FragColor = vec4(color, alpha);
}
`;

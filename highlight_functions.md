# 4D Slice Integral Highlight Function
**Function Modifiers, Shape Decomposition, and Shader Implementation**

---

## Table of Contents
- [1. The Core Function](#1-the-core-function)
- [2. Function Modifiers](#2-function-modifiers)
- [3. Decomposing a Complex 2D Shape into Multiple Ellipses](#3-decomposing-a-complex-2d-shape-into-multiple-ellipses)
- [4. Better Alternatives to Ellipse Decomposition](#4-better-alternatives-to-ellipse-decomposition)
- [5. Practical Shader Code](#5-practical-shader-code)
- [6. Method Comparison](#6-method-comparison)
- [7. Key Takeaway](#7-key-takeaway)

---

## 1. The Core Function

The highlight function is a 4-dimensional integral. A 3D ellipsoid is extended along a fourth axis `w`, interpreted as depth, intensity falloff, or lamp "reach". At each slice `w = const`, the cross-section is a 3D ellipse. As `w` increases, that ellipse shrinks exponentially. Integrating over all slices gives the total highlight weight at any surface point.

```
I(x, y, z) = ∫₀^∞  exp( −[ x²/a(w)² + y²/b(w)² + z²/c(w)² ] ) dw
```

Where the semi-axes decay with `w`:

```
a(w) = a₀ · e^(−αw)
b(w) = b₀ · e^(−βw)
c(w) = c₀ · e^(−γw)
```

For the isotropic case (`α = β = γ = k`), define the normalised elliptic radius:

```
r² = x²/a₀² + y²/b₀² + z²/c₀²
```

The integral evaluates to a closed form via substitution `u = r · e^(kw)`:

```
I(r) = (1/2k) · E₁(r²)
```

Where `E₁` is the **Exponential Integral**:

```
E₁(x) = ∫_x^∞  e^(−t) / t  dt
```

---

## 2. Function Modifiers

### 2.1 `k` — Decay Rate (Spotlight Tightness)

Controls how fast the ellipse slices shrink as `w` increases. The single most important parameter for the feel of the light.

```
a(w) = a₀ · e^(−kw)
```

- **Small k (0.1–0.5):** slow decay → wide, soft, diffuse highlight. The integral accumulates over many slices before the ellipse shrinks to nothing.
- **Large k (2–5+):** fast decay → tight, hard, focused highlight. The ellipse shrinks quickly so only the very centre accumulates significant weight.
- `k` appears in the denominator of `I(r) = E₁(r²) / 2k`, meaning larger `k` linearly reduces absolute intensity everywhere. On a log scale this is a uniform vertical shift of the whole profile — the **shape** of the curve does not change, only its height.

> **Shader analogy:** `k` is equivalent to the "falloff exponent" in a traditional spotlight, but physically derived rather than artist-invented.

### 2.2 `a₀`, `b₀`, `c₀` — Ellipse Semi-Axes (Shape of the Hotspot)

Define the shape of the ellipse at `w = 0` (the widest slice, closest to the lamp surface). They control aspect ratio, not falloff speed.

- `a₀ > b₀`: highlight is wider on the x-axis — an elongated horizontal lamp shape.
- `a₀ = b₀`: perfectly circular hotspot.
- Large `a₀` with small `b₀`: a thin slit highlight, e.g. a fluorescent tube or LED strip.

The normalised radius `r² = x²/a₀² + y²/b₀²` embeds the axes into the distance metric, so iso-intensity contours are always ellipses aligned with the UV coordinate axes.

### 2.3 Anisotropic Decay: `α`, `β`, `γ`

When `α ≠ β ≠ γ`, each axis shrinks at a different rate. This produces a twisted 4D shape — the cross-section ellipses are not just scaled copies of each other, they also change **aspect ratio** as `w` increases.

```
r²(w) = x²/(a₀e^(−αw))² + y²/(b₀e^(−βw))²
```

The integral no longer has the clean `E₁` form and must be evaluated numerically, but gives a highlight that transitions from, say, a wide horizontal stripe near center to a tight dot at the edges — useful for elongated luminaires.

### 2.4 The Hot Center: Logarithmic Singularity

As `r → 0`:

```
E₁(r²) ≈ −ln(r²) − γ_em
```

Where `γ_em ≈ 0.5772` is the Euler-Mascheroni constant. The highlight intensity diverges **logarithmically** at the centre, rather than staying finite like a Gaussian. In practice:

- The very centre of the hotspot is genuinely hotter than the surround — it does not blow out to a uniform white disc.
- It has a real intensity peak that looks like a lamp filament or LED die.
- In a shader: `intensity = min(E1(r2) / (2.0*k), max_brightness)` — clamp or tonemap before output.

---

## 3. Decomposing a Complex 2D Shape into Multiple Ellipses

### 3.1 Why Ellipse Decomposition

A real lamp face — a logo, a star, a crescent — cannot be described by a single ellipse. The goal is to approximate the shape as a **sum of weighted E₁ responses**, one per component ellipse:

```
I_total(x, y) = Σᵢ  wᵢ · E₁(rᵢ²) / (2kᵢ)
```

Each term contributes a hotspot at a different centre with its own shape and falloff. The result is a highlight that feels custom-made for the brand silhouette.

---

### 3.2 Method A: Gaussian Mixture Model / EM Decomposition *(Recommended)*

**Best for:** organic shapes, logos, any filled 2D region defined by pixels or a rasterised mask.

Treat the lamp silhouette as a 2D point distribution (sample it uniformly), then fit a **Gaussian Mixture Model (GMM)** with N components using the EM algorithm. Each Gaussian component directly gives you:

- Mean `μᵢ` → ellipse origin `(x₀, y₀)`
- Covariance matrix `Σᵢ` → eigenvectors = ellipse orientation, eigenvalues = semi-axes `a₀`, `b₀`
- Mixing weight `πᵢ` → per-ellipse brightness weight `wᵢ`

```python
from sklearn.mixture import GaussianMixture
import numpy as np

# shape_samples: (M, 2) array of points sampled uniformly inside the shape
gmm = GaussianMixture(n_components=N, covariance_type='full')
gmm.fit(shape_samples)

# Extract ellipse parameters from each component
for i in range(N):
    mu    = gmm.means_[i]          # centre
    cov   = gmm.covariances_[i]    # 2x2 covariance
    w     = gmm.weights_[i]        # mixing weight

    vals, vecs = np.linalg.eigh(cov)
    a0    = np.sqrt(vals[1])       # major semi-axis
    b0    = np.sqrt(vals[0])       # minor semi-axis
    angle = np.arctan2(vecs[1,1], vecs[0,1])  # rotation in radians
```

> N = 3–8 is usually enough for a recognisable logo highlight. More than 12 components rarely improves visual quality and increases shader cost linearly.

---

### 3.3 Method B: Medial Axis / Skeleton Decomposition

**Best for:** thin shapes, letterforms, line-art logos, any shape where the "spine" matters more than the filled area.

Compute the **medial axis transform** (skeletonisation) of the shape. Each skeleton point has a radius (distance to nearest boundary) that directly defines the ellipse minor semi-axis. Orientation is tangent to the skeleton.

- Naturally handles branching (e.g. a letter E with three arms).
- Each skeleton segment becomes one ellipse, oriented along the segment.
- The radius function gives a smoothly varying `b₀` along the skeleton.

```python
from scipy.ndimage import distance_transform_edt
from skimage.morphology import skeletonize

skel   = skeletonize(mask)           # boolean mask of the shape
radii  = distance_transform_edt(mask)[skel]  # radius at each skeleton point
coords = np.argwhere(skel)           # (y, x) coordinates of skeleton points
```

---

### 3.4 Method C: Fourier Ellipse Fitting

**Best for:** shapes defined by a closed outline/contour (SVG path, vector logo).

Express the contour as a parametric curve `(x(t), y(t))`, decompose into **Fourier descriptors**. Truncate to N harmonics — each harmonic pair `(aₙ, bₙ, cₙ, dₙ)` defines an ellipse. The first harmonic (n=1) is the best-fit single ellipse; higher harmonics add corrective sub-ellipses.

```
x(t) = Σ  aₙ cos(nt) + bₙ sin(nt)
y(t) = Σ  cₙ cos(nt) + dₙ sin(nt)
```

Most compact representation for smooth closed curves. Produces the fewest ellipses needed for a given shape fidelity.

```python
def fourier_ellipses(contour_xy, n_harmonics):
    x, y = contour_xy[:,0], contour_xy[:,1]
    N = len(x)
    ellipses = []
    for n in range(1, n_harmonics + 1):
        t = 2 * np.pi * np.arange(N) / N
        an = (2/N) * np.sum(x * np.cos(n*t))
        bn = (2/N) * np.sum(x * np.sin(n*t))
        cn = (2/N) * np.sum(y * np.cos(n*t))
        dn = (2/N) * np.sum(y * np.sin(n*t))
        # Convert (an,bn,cn,dn) to ellipse centre, axes, angle
        ellipses.append((an, bn, cn, dn))
    return ellipses
```

---

### 3.5 Method D: Axis-Aligned Ellipse Hierarchy *(Manual / Real-Time)*

**Best for:** real-time applications, simple shapes, when manual art-direction control is needed.

Define ellipses as a nested hierarchy with increasing tightness:

- **Level 0:** one large ellipse covering the whole shape at low weight (ambient fill, low `k`)
- **Level 1:** 2–4 mid-ellipses aligned to main sub-features (medium `k`)
- **Level 2:** 1–3 tight ellipses at the brightest intended hotspot(s) (high `k`)

Each level uses a higher `k` and smaller axes. The superposition gives a natural "glow + hotspot" layering that artists can tune directly without any offline computation.

---

## 4. Better Alternatives to Ellipse Decomposition

### 4.1 Direct SDF Integration *(Best approach if you can afford it)*

Instead of decomposing into ellipses, compute the **signed distance function** of the exact lamp shape `d(x,y)`, then substitute it directly into the intensity formula:

```
I(x, y) = E₁( d(x,y)² ) / (2k)
```

This generalises the ellipse formula (where `d` was the elliptic radius `r`) to **any arbitrary 2D shape**. The SDF can be:

- Pre-baked into a texture (8–16-bit float, one offline render)
- Computed analytically in the shader for simple primitives (circle, box, rounded rect, star)
- Computed on the GPU for vector shapes using the standard SDF library pattern

The result is an `E₁`-profile highlight that exactly follows the lamp silhouette, with the correct logarithmic centre and polynomial tail, all in a single texture lookup plus a few arithmetic ops.

> This is what most professional game engines do internally for area lights: the SDF of the area shape is used to compute the closest point on the light, which drives the specular term. The E₁ envelope is the physically correct intensity weight for that distance.

---

### 4.2 Linearly Transformed Cosines (LTC)

A PBR-standard technique where the BRDF is approximated by a **transformed cosine lobe**. The shape of the area light enters via a 3×3 matrix `M` that warps the cosine to match any convex polygon. Combined with the E₁ intensity profile as a falloff envelope, this gives physically correct area-light highlights for arbitrary polygonal lamp shapes without any decomposition step.

- Industry standard in real-time PBR renderers (UE5, Unity HDRP)
- Requires a pre-integrated LTC lookup table (two RGBA16F textures, ~64×64)
- Shape is passed as a polygon, not an SDF — better for rectilinear lamp housings

---

### 4.3 Spherical Harmonics / Spherical Gaussian Projection

For very complex shapes (e.g. a detailed filigree lamp front), project the lamp radiance into **spherical harmonics** (or spherical Gaussians). Each SH band or SG lobe is effectively one elliptic highlight component, but the decomposition is done in frequency space rather than geometric space. The E₁ integral over `w` depth maps cleanly onto the SG sharpness parameter `λ`:

```
SG(v; axis, λ, amplitude) = amplitude · e^(λ(v·axis − 1))
```

Mapping: `λ ↔ k`, `axis ↔ ellipse orientation`, `amplitude ↔ w` (mixing weight).

---

## 5. Practical Shader Code

### 5.1 E₁ Approximation

```glsl
float e1_approx(float x) {
    if (x < 1e-4) return -log(x) - 0.5772156649; // asymptotic near 0
    // Padé-style approximation, error < 1% for x > 0.1
    return exp(-x) / x * (x + 1.0) / (x + 2.0 - 1.0/(x + 4.0));
}
```

### 5.2 Single Ellipse

```glsl
float highlight(vec2 p, vec2 center, float a, float b, float k) {
    vec2  d  = p - center;
    float r2 = d.x*d.x/(a*a) + d.y*d.y/(b*b);
    r2 = max(r2, 1e-5); // prevent log singularity blowout
    return e1_approx(r2) / (2.0 * k);
}
```

### 5.3 Multi-Ellipse Sum (GMM Output)

```glsl
// Pack GMM output as:
//   ellipses[i].xy  = centre
//   ellipses[i].zw  = semi-axes (a, b)
//   ellipse_wk[i].x = weight
//   ellipse_wk[i].y = k (decay)

uniform vec4  ellipses[8];
uniform vec2  ellipse_wk[8];
uniform int   n_ellipses;

float brandHighlight(vec2 p) {
    float total = 0.0;
    for (int i = 0; i < n_ellipses; i++) {
        vec2  c  = ellipses[i].xy;
        vec2  ax = ellipses[i].zw;
        float w  = ellipse_wk[i].x;
        float k  = ellipse_wk[i].y;
        vec2  d  = p - c;
        float r2 = d.x*d.x/(ax.x*ax.x) + d.y*d.y/(ax.y*ax.y);
        r2 = max(r2, 1e-5);
        total += w * e1_approx(r2) / (2.0 * k);
    }
    return total;
}
```

### 5.4 SDF-Based (Single Shape, Best Quality)

```glsl
// sdfTex: pre-baked signed distance field, values normalised to world units
// Negative inside the shape, positive outside — clamp to 0 inside for a filled highlight

uniform sampler2D sdfTex;
uniform float     k;
uniform float     shape_scale; // world-space units per UV unit

float sdfHighlight(vec2 uv) {
    float d  = texture(sdfTex, uv).r * shape_scale;
    float d2 = max(d * d, 1e-5); // inside shape: d<0, d²>0 still valid
    return e1_approx(d2) / (2.0 * k);
}
```

### 5.5 Rotated Ellipse (for GMM with angle output)

```glsl
float highlightRotated(vec2 p, vec2 center, float a, float b, float angle, float k) {
    vec2  d   = p - center;
    float cos_a = cos(angle), sin_a = sin(angle);
    // Rotate d into ellipse-local frame
    vec2  dl = vec2( d.x*cos_a + d.y*sin_a,
                    -d.x*sin_a + d.y*cos_a);
    float r2 = dl.x*dl.x/(a*a) + dl.y*dl.y/(b*b);
    r2 = max(r2, 1e-5);
    return e1_approx(r2) / (2.0 * k);
}
```

---

## 6. Method Comparison

| Method | Best For | Pros | Cons |
|---|---|---|---|
| GMM / EM | Filled organic shapes, logos | Automatic, principled, N is tunable | Needs offline fitting step |
| Medial Axis | Thin shapes, letterforms | Captures topology, handles branching | More complex to implement |
| Fourier Ellipses | Smooth closed contours (SVG) | Very compact, analytically clean | Poor fit for non-smooth shapes |
| Ellipse Hierarchy | Real-time, manual art control | Fast, zero offline cost, fully controllable | Requires hand-tuning |
| SDF Integration | Any shape, best quality | Exact shape, single texture lookup | Needs SDF pre-bake or GPU compute |
| LTC (PBR) | PBR pipelines, polygonal lamps | Physically correct, GPU-standard | Complex setup, matrix per BRDF |
| Spherical Gaussians | Very complex / filigree shapes | Compact frequency-space representation | Indirect mapping, harder to author |

---

## 7. Key Takeaway

`E₁(r²)/2k` is the physically correct intensity a surface point accumulates from a volumetric 4D lamp integral.

- **`k`** controls tightness. It shifts the log-scale radial profile uniformly up/down without changing its shape.
- **`a₀/b₀`** controls the aspect ratio of the hotspot ellipse.
- **`α/β/γ`** (anisotropic) allows the ellipse to change shape as well as scale with depth.

For a single branded lamp shape:
- **SDF approach** is the cleanest: bake the logo SDF once, evaluate `E₁(sdf²)/2k` per fragment. One texture, one formula, exact shape fidelity.

For runtime multi-shape flexibility or when no SDF pipeline exists:
- **GMM multi-ellipse sum** gives the best quality-to-shader-cost ratio. Run the Python fitting offline, pass the parameters as uniforms, sum in the fragment shader.

For full PBR integration with a polygon-defined lamp housing:
- **LTC** is the industry standard and slots directly into an existing PBR pipeline.

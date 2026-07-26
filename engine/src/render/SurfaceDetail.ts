import * as THREE from 'three';

/**
 * SurfaceDetail — 表面细节增强：宏观变化 + 去平铺。
 *
 * WHY THIS EXISTS. 一张无缝贴图铺满 16 m 地块后仍然读作「一块绿地毯」，换一张
 * 图也一样 —— 问题不在图案，在**空间频谱**。`ground-forest.png` 只有厘米级高频
 * (128 px 的绿噪声)，缺 1–10 m 的中低频；平铺几千次后所有高频被 mipmap 平均掉，
 * 远处就等于一个纯色多边形。人眼判断「自然」靠的正是那段缺失的中低频 —— 明暗
 * 斑块、湿区、踩秃的路径。
 *
 * 两处注入，都在 fragment 的 albedo 上（`map_fragment` chunk）：
 *
 *   · MACRO（宏观变化）—— 用世界坐标的低频 fbm 调制明度 + 色温，周期 ~13 m /
 *     ~5 m 两个倍频。暗处偏冷、亮处偏暖（阳光暖、天光冷的普遍规律），比单纯压
 *     明度自然得多。对**所有**贴图表面生效，强度小到不会破坏砖墙这类结构贴图。
 *
 *   · DETILE（去平铺）—— 同一张贴图采两次，第二次把 UV 旋转 ~37° 并偏移，按一
 *     层低频噪声掩码混合。旋转（而非缩放）保持纹素密度不变，只打散相位与朝向，
 *     37° 后两层图案不可能再对齐，规则网格感消失。
 *     用旋转而非 Heitz-Neyret 的六边形随机平铺，是因为后者要 `textureGrad` 才不
 *     在 tile 边界爆导数（→ 一圈模糊接缝），而 GLSL ES 1.0 下那要靠扩展；这里两
 *     次采样的 UV 都是**连续函数**，导数处处正常，零伪影、少一次采样。
 *     代价是混合过渡带对比度略降（两个随机相位平均），所以掩码用 smoothstep
 *     收窄过渡带，大部分像素仍是纯 A 或纯 B。
 *
 * DETILE 只对「大而扁」的表面开（判据见 MeshFactory.wantsDetile）—— 地面/平台
 * 的贴图无方向性，旋转混合是白赚；而砖墙那样的结构贴图旋转后会明显错乱，且它
 * 的规则重复本来就是对的。
 *
 * 浮动原点：varying 传的是 render-space 坐标（小、插值精度好），fragment 里加回
 * `sdOrigin` 得到绝对世界坐标，否则每次 rebase（FloatingOrigin，每 1024 m）整片
 * 宏观图案会跳一下。uniform 是**进程内共享的同一个对象**，RenderEngine 在 rebase
 * 后更新一次即可，所有注入过的材质同时看到。
 *
 * 层级：纯 render/，靠 onBeforeCompile 挂在标准 MeshStandardMaterial 上 —— 不新
 * 增材质类型、不动协议、不碰一字节内容数据。
 */

/** render-space → 绝对世界坐标的补偿量。所有注入材质共享这一个 uniform 对象。 */
const SD_ORIGIN: { value: THREE.Vector3 } = { value: new THREE.Vector3() };

/** 宏观变化默认强度（明度调制的半幅）。0.18 ≈ ±18%，明显但不脏。 */
export const MACRO_DEFAULT = 0.18;

/**
 * 更新浮动原点补偿。RenderEngine 在 FloatingOrigin.maybeRebase 返回 true 后调用；
 * 不调也只是宏观图案随 rebase 平移，不会渲染错误。
 */
export function setSurfaceDetailOrigin(origin: THREE.Vector3): void {
    SD_ORIGIN.value.copy(origin);
}

export interface SurfaceDetailOptions {
    /** 宏观变化强度 [0,1]；0 = 关闭该层。默认 MACRO_DEFAULT。 */
    macro?: number;
    /** 是否做去平铺（双相位旋转混合）。默认 false —— 只有大而扁的地面值得。 */
    detile?: boolean;
}

/** 噪声 + varying 声明，vertex/fragment 共用的前置块。 */
const SD_COMMON = /* glsl */`
varying vec3 vSdPos;
`;

/** fragment 专属：uniform + iq 经典 value noise（8 hash/倍频，无 sin）。 */
const SD_FRAG_PARS = /* glsl */`
uniform vec3 sdOrigin;
uniform float sdMacro;

float sdHash( vec3 p ) {
	p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) );
	p *= 17.0;
	return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

float sdValueNoise( vec3 x ) {
	vec3 i = floor( x );
	vec3 f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix(
		mix( mix( sdHash( i + vec3( 0.0, 0.0, 0.0 ) ), sdHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
			 mix( sdHash( i + vec3( 0.0, 1.0, 0.0 ) ), sdHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
		mix( mix( sdHash( i + vec3( 0.0, 0.0, 1.0 ) ), sdHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
			 mix( sdHash( i + vec3( 0.0, 1.0, 1.0 ) ), sdHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
}

/** 绝对世界坐标（render-space + 浮动原点）。 */
vec3 sdWorld() {
	return vSdPos + sdOrigin;
}

/**
 * 三倍频 fbm。倍频比例 2.7（非整数，避免各倍频的格点对齐成规则花纹）。
 * 尺度是**实测调出来的**：第一版主频周期 13 m，在一块 16 m 地面上只够一个起伏，
 * 经 value noise 的平滑插值后读作「整体色偏」而不是斑块 —— 截图里几乎看不出来。
 * 调用方乘 0.15 → 主频约 6.7 m，一块地上 2–3 个斑块，次频 2.5 m / 0.9 m 补细节。
 */
float sdFbm( vec3 p ) {
	return sdValueNoise( p ) * 0.55
		+ sdValueNoise( p * 2.7 + 11.3 ) * 0.30
		+ sdValueNoise( p * 7.3 + 41.7 ) * 0.15;
}
`;

/**
 * albedo 注入：替换 `map_fragment`。DETILE 分支采两次、按低频掩码混合；
 * 其余保持 three 原 chunk 的语义（含 DECODE_VIDEO_TEXTURE 的 inline sRGB 解码）。
 * MACRO 落在 `#endif` 之后，因此贴图与纯色两条路都吃得到。
 */
const SD_MAP_FRAGMENT = /* glsl */`
#ifdef USE_MAP

	#ifdef SD_DETILE

		// 第二相位：旋转 ~37°（保尺度、换朝向与相位）+ 一个不对齐的偏移。
		vec2 sdUvB = mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv + vec2( 0.37, 0.61 );
		float sdK = smoothstep( 0.35, 0.65, sdValueNoise( sdWorld() * 0.11 ) );
		vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture2D( map, sdUvB ), sdK );

	#else

		vec4 sampledDiffuseColor = texture2D( map, vMapUv );

	#endif

	#ifdef DECODE_VIDEO_TEXTURE

		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );

	#endif

	diffuseColor *= sampledDiffuseColor;

#endif

{
	float sdM = sdFbm( sdWorld() * 0.15 );
	// 对比拉伸 —— 不是调味，是**必须**：多倍频叠加后 fbm 向 0.5 集中（中心极限），
	// 实测有效摆幅只剩名义值的 ~1/3，强度 0.18 到画面上只有 6%，肉眼为零。
	// 拉满 [0,1] 后 sdMacro 才名副其实。（噪声可视化实测，别凭直觉改回去。）
	sdM = clamp( ( sdM - 0.5 ) * 2.5 + 0.5, 0.0, 1.0 );
	// 明度：暗侧给足、亮侧收一半 —— 变化读起来是「阴影/湿区」而不是「曝光不稳」。
	diffuseColor.rgb *= mix( 1.0 - sdMacro, 1.0 + sdMacro * 0.6, sdM );
	// 色温：暗处偏冷（天光）、亮处偏暖（阳光）。幅度固定且极小，与强度无关。
	diffuseColor.rgb *= mix( vec3( 1.04, 1.0, 0.93 ), vec3( 0.94, 1.0, 1.03 ), sdM );
}
`;

/**
 * 给一个标准材质挂上表面细节增强。幂等（重复调用只保留一次注入）。
 *
 * 必须同时设 `customProgramCacheKey` —— Three 按 program cache 复用编译结果，
 * 注入不同的材质若共享 cache key 会拿到别人的 program。
 */
export function applySurfaceDetail(
    mat: THREE.MeshStandardMaterial,
    opts: SurfaceDetailOptions = {}
): void {
    const macro = opts.macro ?? MACRO_DEFAULT;
    const detile = !!opts.detile;
    if (macro <= 0 && !detile) return; // 两层都不要 —— 别白挂一个 program 变体

    const flag = mat as THREE.MeshStandardMaterial & { __sdApplied?: string };
    const key = `sd:${macro.toFixed(3)}:${detile ? 1 : 0}`;
    if (flag.__sdApplied === key) return;
    flag.__sdApplied = key;

    if (detile) {
        mat.defines = { ...(mat.defines ?? {}), SD_DETILE: '' };
    }

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.sdOrigin = SD_ORIGIN;
        shader.uniforms.sdMacro = { value: macro };

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${SD_COMMON}`)
            // project_vertex 之后 `transformed` 已定型（含 skinning/morph 的结果）。
            .replace(
                '#include <project_vertex>',
                `#include <project_vertex>\n\tvSdPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${SD_COMMON}${SD_FRAG_PARS}`)
            .replace('#include <map_fragment>', SD_MAP_FRAGMENT);
    };

    // Three 只在 cache key 变化时重编译；注入是每材质定制的，key 必须跟着变。
    mat.customProgramCacheKey = () => key;
    mat.needsUpdate = true;
}

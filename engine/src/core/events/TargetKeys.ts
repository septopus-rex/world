/**
 * TargetKeys — stable content-address keys for targeted event routing.
 *
 * EntityIds are runtime-ephemeral (block eviction/reload mints new ones); a
 * subscription that must survive reloads binds to the content address instead.
 * Both keys ride the WorldEvent envelope (`targetKey`).
 */

/** A specific adjunct instance: block coords + type-id + index within type. */
export function adjKey(bx: number, by: number, typeId: number, index: number): string {
    return `adj:${bx}_${by}:${typeId.toString(16)}:${index}`;
}

/** A block. */
export function blkKey(bx: number, by: number): string {
    return `blk:${bx}_${by}`;
}

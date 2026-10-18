import type { SceneObject } from '@refloor/scene';

export function MapFurniture({ object }: { object: SceneObject }) {
  const { width: w, depth: d } = object.dimensions,
    asset = object.assetId.split('/').at(-1);
  const shape = () => {
    if (object.kind === 'bed')
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.07} />
          <path
            d={`M ${-w / 2} ${-d / 2 + 0.16} H ${w / 2} M ${-w / 2 + 0.07} ${-d * 0.12} H ${w / 2 - 0.07}`}
          />
          {[-1, 1].map((side) => (
            <rect
              key={side}
              x={side * w * 0.23 - w * 0.18}
              y={-d / 2 + 0.23}
              width={w * 0.36}
              height={d * 0.21}
              rx={0.08}
            />
          ))}
        </>
      );
    if (object.kind === 'sofa')
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.12} />
          <path
            d={`M ${-w / 2 + 0.17} ${d / 2} V ${-d / 2 + 0.2} H ${w / 2 - 0.17} V ${d / 2} M ${-w / 6} ${-d / 2 + 0.2} V ${d / 2 - 0.07} M ${w / 6} ${-d / 2 + 0.2} V ${d / 2 - 0.07}`}
          />
        </>
      );
    if (object.kind === 'chair')
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.09} />
          <path d={`M ${-w / 2 + 0.07} ${-d / 2 + 0.15} H ${w / 2 - 0.07}`} />
        </>
      );
    if (asset === 'kitchen-counter' || asset === 'vanity')
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.02} />
          <rect x={-w * 0.34} y={-d * 0.32} width={w * 0.27} height={d * 0.64} rx={0.07} />
          <circle cx={-w * 0.205} cy={0} r={0.045} />
          <path d={`M ${-w * 0.205} ${-d * 0.35} v ${-0.13} h .14`} />
          {asset === 'kitchen-counter' &&
            [-1, 1].flatMap((x) =>
              [-1, 1].map((z) => (
                <circle
                  key={`${x}:${z}`}
                  cx={w * 0.27 + x * w * 0.065}
                  cy={z * d * 0.22}
                  r={Math.min(w * 0.047, d * 0.13)}
                />
              )),
            )}
        </>
      );
    if (asset === 'toilet')
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d * 0.24} rx={0.04} />
          <ellipse cx={0} cy={d * 0.11} rx={w * 0.4} ry={d * 0.36} />
          <ellipse cx={0} cy={d * 0.11} rx={w * 0.25} ry={d * 0.23} />
        </>
      );
    if (asset === 'shower')
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.025} />
          <path
            d={`M ${-w / 2 + 0.08} ${-d / 2 + 0.08} L ${w / 2 - 0.08} ${d / 2 - 0.08} M ${w / 2 - 0.08} ${-d / 2 + 0.08} L ${-w / 2 + 0.08} ${d / 2 - 0.08}`}
            opacity={0.5}
          />
          <circle cx={0} cy={0} r={0.065} />
        </>
      );
    if (object.kind === 'decor' && asset === 'plant')
      return (
        <>
          <circle r={Math.min(w, d) * 0.45} />
          {Array.from({ length: 5 }, (_, i) => (
            <ellipse
              key={i}
              cx={0}
              cy={-d * 0.17}
              rx={w * 0.13}
              ry={d * 0.23}
              transform={`rotate(${i * 72})`}
            />
          ))}
        </>
      );
    return (
      <>
        <rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          rx={object.kind === 'table' ? 0.1 : 0.025}
        />
        {(object.kind === 'storage' || asset === 'fridge') && (
          <path
            d={`M 0 ${-d / 2 + 0.04} V ${d / 2 - 0.04} M ${-w / 2 + 0.04} ${d / 2 - 0.09} H ${w / 2 - 0.04}`}
          />
        )}
      </>
    );
  };
  return (
    <g
      className={`plan-furniture plan-${object.kind}`}
      transform={`translate(${object.position.x} ${object.position.z}) rotate(${(-object.rotation * 180) / Math.PI})`}
    >
      {shape()}
    </g>
  );
}

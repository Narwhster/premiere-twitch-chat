export function pickVariant(master: string, masterUrl: string): string | null {
  const lines = master.split(/\r?\n/);
  const variants = lines.flatMap((line, index) => {
    const height = /RESOLUTION=\d+x(\d+)/.exec(line)?.[1];
    const next = lines[index + 1];
    return height === undefined || next === undefined
      ? []
      : [{ height: Number(height), url: new URL(next, masterUrl).href }];
  });
  variants.sort((a, b) => a.height - b.height);
  return (variants.find((v) => v.height >= 360) ?? variants.at(-1))?.url ?? null;
}

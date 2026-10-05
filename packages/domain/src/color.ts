export function colorInk(hex: string): '#000000' | '#FFFFFF' {
  const rgb = hex
    .slice(1)
    .match(/../g)
    ?.map((value) => parseInt(value, 16) / 255) ?? [1, 1, 1];
  const luminance = rgb
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

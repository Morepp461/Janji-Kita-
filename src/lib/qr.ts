const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
let value = 1;
for (let i = 0; i < 255; i += 1) {
  GF_EXP[i] = value;
  GF_LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];

function multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function reedSolomon(data: number[], degree: number): number[] {
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = Array(generator.length + 1).fill(0) as number[];
    generator.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= multiply(coefficient, GF_EXP[i]);
    });
    generator = next;
  }
  const remainder = [...data, ...Array(degree).fill(0)] as number[];
  for (let i = 0; i < data.length; i += 1) {
    const factor = remainder[i];
    if (factor !== 0)
      generator.forEach((coefficient, j) => (remainder[i + j] ^= multiply(coefficient, factor)));
  }
  return remainder.slice(data.length);
}

function encodeData(text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 17) throw new Error("Konten QR terlalu panjang.");
  const bits: number[] = [];
  const append = (number: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((number >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, 8);
  bytes.forEach((byte) => append(byte, 8));
  for (let i = 0; i < 4 && bits.length < 152; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  for (let pad = 0; data.length < 19; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);
  return [...data, ...reedSolomon(data, 7)];
}

export function createQrSvg(value: string, quietZone = 4): string {
  const codewords = encodeData(value);
  const size = 21;
  const matrix: Array<Array<boolean | null>> = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );

  const finder = (top: number, left: number) => {
    for (let row = -1; row <= 7; row += 1) {
      for (let col = -1; col <= 7; col += 1) {
        const y = top + row;
        const x = left + col;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        matrix[y][x] =
          row >= 0 &&
          row <= 6 &&
          col >= 0 &&
          col <= 6 &&
          (row === 0 ||
            row === 6 ||
            col === 0 ||
            col === 6 ||
            (row >= 2 && row <= 4 && col >= 2 && col <= 4));
      }
    }
  };
  finder(0, 0);
  finder(0, 14);
  finder(14, 0);

  for (let i = 8; i < 13; i += 1) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  const formatData = 0b01000;
  let remainder = formatData;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  const format = ((formatData << 10) | remainder) ^ 0x5412;
  const bit = (index: number) => ((format >>> index) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) matrix[i][8] = bit(i);
  matrix[7][8] = bit(6);
  matrix[8][8] = bit(7);
  matrix[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) matrix[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i += 1) matrix[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) matrix[size - 15 + i][8] = bit(i);
  matrix[13][8] = true;

  const dataBits = codewords.flatMap((word) =>
    Array.from({ length: 8 }, (_, i) => (word >>> (7 - i)) & 1),
  );
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        if (matrix[row][col] !== null) continue;
        const raw = dataBits[bitIndex++] ?? 0;
        matrix[row][col] = (raw === 1) !== ((row + col) % 2 === 0);
      }
    }
    upward = !upward;
  }

  const scale = size + quietZone * 2;
  const modules = matrix
    .flatMap((row, y) =>
      row.flatMap((dark, x) =>
        dark ? [`<rect x="${x + quietZone}" y="${y + quietZone}" width="1" height="1"/>`] : [],
      ),
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scale} ${scale}" role="img" aria-label="Kode QR tiket"><rect width="${scale}" height="${scale}" fill="#fff"/><g fill="#211b18">${modules}</g></svg>`;
}

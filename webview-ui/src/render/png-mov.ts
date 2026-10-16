export type MovSample = { offset: number; size: number };
export type MovTiming = { timescale: number; frameDuration: number };

const mdatHeaderSize = 16;
const fixedOne = 0x1_0000;

function greatestDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestDivisor(b, a % b);
}

export function movTiming(secondTicks: number, frameTicks: number): MovTiming {
  const divisor = greatestDivisor(secondTicks, frameTicks);
  return { timescale: secondTicks / divisor, frameDuration: frameTicks / divisor };
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(new TextEncoder().encode(type), 4);
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function fields(length: number, write: (view: DataView) => void): Uint8Array {
  const out = new Uint8Array(length);
  write(new DataView(out.buffer));
  return out;
}

function fourcc(view: DataView, at: number, text: string) {
  new Uint8Array(view.buffer, view.byteOffset).set(new TextEncoder().encode(text), at);
}

function identityMatrix(view: DataView, at: number) {
  view.setUint32(at, fixedOne);
  view.setUint32(at + 16, fixedOne);
  view.setUint32(at + 32, 0x4000_0000);
}

const fileType = box(
  "ftyp",
  fields(12, (view) => {
    fourcc(view, 0, "qt  ");
    view.setUint32(4, 0x200);
    fourcc(view, 8, "qt  ");
  }),
);

export const movHeaderSize = fileType.length + mdatHeaderSize;

export function movHeader(end: number): Uint8Array {
  const header = new Uint8Array(movHeaderSize);
  header.set(fileType);
  const view = new DataView(header.buffer, fileType.length);
  view.setUint32(0, 1);
  fourcc(view, 4, "mdat");
  view.setBigUint64(8, BigInt(end - fileType.length));
  return header;
}

function sampleDescription(width: number, height: number): Uint8Array {
  return box(
    "stsd",
    fields(8, (view) => view.setUint32(4, 1)),
    box(
      "png ",
      fields(78, (view) => {
        view.setUint16(6, 1);
        view.setUint16(24, width);
        view.setUint16(26, height);
        view.setUint32(28, 72 * fixedOne);
        view.setUint32(32, 72 * fixedOne);
        view.setUint16(40, 1);
        view.setUint16(74, 32);
        view.setInt16(76, -1);
      }),
      box(
        "colr",
        fields(10, (view) => {
          fourcc(view, 0, "nclc");
          view.setUint16(4, 1);
          view.setUint16(6, 1);
          view.setUint16(8, 1);
        }),
      ),
    ),
  );
}

function sampleTable(
  width: number,
  height: number,
  { frameDuration }: MovTiming,
  samples: MovSample[],
): Uint8Array {
  return box(
    "stbl",
    sampleDescription(width, height),
    box(
      "stts",
      fields(16, (view) => {
        view.setUint32(4, 1);
        view.setUint32(8, samples.length);
        view.setUint32(12, frameDuration);
      }),
    ),
    box(
      "stsc",
      fields(20, (view) => {
        view.setUint32(4, 1);
        view.setUint32(8, 1);
        view.setUint32(12, 1);
        view.setUint32(16, 1);
      }),
    ),
    box(
      "stsz",
      fields(12 + 4 * samples.length, (view) => {
        view.setUint32(8, samples.length);
        samples.forEach(({ size }, index) => view.setUint32(12 + 4 * index, size));
      }),
    ),
    box(
      "co64",
      fields(8 + 8 * samples.length, (view) => {
        view.setUint32(4, samples.length);
        samples.forEach(({ offset }, index) => view.setBigUint64(8 + 8 * index, BigInt(offset)));
      }),
    ),
  );
}

function handler(type: string, subtype: string): Uint8Array {
  return box(
    "hdlr",
    fields(25, (view) => {
      fourcc(view, 4, type);
      fourcc(view, 8, subtype);
    }),
  );
}

export function movieBox(
  width: number,
  height: number,
  timing: MovTiming,
  samples: MovSample[],
): Uint8Array {
  const duration = samples.length * timing.frameDuration;
  const dataReference = box(
    "dref",
    fields(8, (view) => view.setUint32(4, 1)),
    box(
      "alis",
      fields(4, (view) => view.setUint32(0, 1)),
    ),
  );
  const media = box(
    "mdia",
    box(
      "mdhd",
      fields(24, (view) => {
        view.setUint32(12, timing.timescale);
        view.setUint32(16, duration);
      }),
    ),
    handler("mhlr", "vide"),
    box(
      "minf",
      box(
        "vmhd",
        fields(12, (view) => {
          view.setUint32(0, 1);
          view.setUint16(4, 0x40);
        }),
      ),
      handler("dhlr", "alis"),
      box("dinf", dataReference),
      sampleTable(width, height, timing, samples),
    ),
  );
  return box(
    "moov",
    box(
      "mvhd",
      fields(100, (view) => {
        view.setUint32(12, timing.timescale);
        view.setUint32(16, duration);
        view.setUint32(20, fixedOne);
        view.setUint16(24, 0x100);
        identityMatrix(view, 36);
        view.setUint32(96, 2);
      }),
    ),
    box(
      "trak",
      box(
        "tkhd",
        fields(84, (view) => {
          view.setUint32(0, 3);
          view.setUint32(12, 1);
          view.setUint32(20, duration);
          identityMatrix(view, 40);
          view.setUint32(76, width * fixedOne);
          view.setUint32(80, height * fixedOne);
        }),
      ),
      media,
    ),
  );
}

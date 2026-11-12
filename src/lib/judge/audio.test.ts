import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES, detectAudioFormat } from "./audio";

function bytes(...parts: Array<string | number[]>): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      for (const char of part) out.push(char.charCodeAt(0));
    } else {
      out.push(...part);
    }
  }
  return new Uint8Array(out);
}

// 크롬 MediaRecorder가 만드는 것과 같은 모양의 EBML 헤더
const EBML = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01];
const DOCTYPE = [0x42, 0x82];

describe("detectAudioFormat", () => {
  it.each([
    ["webm(크롬)", bytes(EBML, DOCTYPE, [0x84], "webm", [0x42, 0x87, 0x81, 0x04]), "webm", "audio/webm"],
    ["mp4(아이폰 사파리)", bytes([0, 0, 0, 0x1c], "ftypiso5", [0, 0, 2, 0]), "mp4", "audio/m4a"],
    ["m4a", bytes([0, 0, 0, 0x20], "ftypM4A ", [0, 0, 0, 0]), "mp4", "audio/m4a"],
    ["ogg", bytes("OggS", [0, 2, 0, 0, 0, 0, 0, 0]), "ogg", "audio/ogg"],
    ["wav", bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt "), "wav", "audio/wav"],
    ["flac", bytes("fLaC", [0, 0, 0, 0x22]), "flac", "audio/flac"],
    ["mp3(ID3 태그)", bytes("ID3", [4, 0, 0, 0, 0, 0, 0]), "mp3", "audio/mp3"],
    ["mp3(프레임 동기)", bytes([0xff, 0xfb, 0x90, 0x64]), "mp3", "audio/mp3"],
    ["aac(ADTS, MPEG-4)", bytes([0xff, 0xf1, 0x50, 0x80]), "aac", "audio/aac"],
    ["aac(ADTS, MPEG-2)", bytes([0xff, 0xf9, 0x50, 0x80]), "aac", "audio/aac"],
  ])("%s → %s, %s", (_name, input, container, mimeType) => {
    expect(detectAudioFormat(input)).toEqual({ container, mimeType });
  });

  it.each([
    ["빈 파일", bytes()],
    ["텍스트", bytes("hello audio file")],
    ["PNG 이미지", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["DocType이 matroska인 파일", bytes(EBML, DOCTYPE, [0x88], "matroska")],
    ["잘린 EBML 헤더", bytes([0x1a, 0x45])],
    ["MPEG Layer II 프레임", bytes([0xff, 0xfd, 0x90, 0x64])],
    ["RIFF지만 WAVE가 아님", bytes("RIFF", [0, 0, 0, 0], "AVI LIST")],
  ])("지원하지 않는 형식이면 null: %s", (_name, input) => {
    expect(detectAudioFormat(input)).toBeNull();
  });
});

describe("MAX_AUDIO_BYTES", () => {
  it("2MB는 2,097,152바이트다", () => {
    expect(MAX_AUDIO_BYTES).toBe(2_097_152);
  });
});

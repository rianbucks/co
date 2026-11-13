/**
 * 업로드 파일 검사(명세 4장 서버 검사): 크기와 형식만 본다. 길이는 검사하지 않는다.
 * 형식은 클라이언트가 보낸 MIME이 아니라 파일 앞부분 바이트로 판별한다.
 */

/** 2MB(2 × 1024 × 1024바이트). 넘으면 413 too_large. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

export type AudioContainer = "webm" | "mp4" | "ogg" | "wav" | "mp3" | "aac" | "flac";

/** Gemini 지원 목록(Audio understanding 문서, Interactions API 레퍼런스)에 있는 MIME만 쓴다. */
export type GeminiAudioMime =
  | "audio/webm"
  | "audio/m4a"
  | "audio/ogg"
  | "audio/wav"
  | "audio/mp3"
  | "audio/aac"
  | "audio/flac";

const GEMINI_MIME: Record<AudioContainer, GeminiAudioMime> = {
  webm: "audio/webm",
  // 아이폰 사파리 녹음(MP4 컨테이너). Gemini 목록에 audio/mp4는 없고 audio/m4a가 있다.
  mp4: "audio/m4a",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mp3",
  aac: "audio/aac",
  flac: "audio/flac",
};

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function containsAscii(bytes: Uint8Array, text: string, limit: number): boolean {
  const end = Math.min(bytes.length, limit) - text.length;
  for (let offset = 0; offset <= end; offset += 1) {
    if (hasAscii(bytes, offset, text)) return true;
  }
  return false;
}

function detectContainer(bytes: Uint8Array): AudioContainer | null {
  // WebM: EBML 헤더(1A 45 DF A3)에 DocType "webm". DocType이 matroska인 파일은 받지 않는다.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return containsAscii(bytes, "webm", 64) ? "webm" : null;
  }
  if (hasAscii(bytes, 4, "ftyp")) return "mp4";
  if (hasAscii(bytes, 0, "OggS")) return "ogg";
  if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WAVE")) return "wav";
  if (hasAscii(bytes, 0, "fLaC")) return "flac";
  if (hasAscii(bytes, 0, "ID3")) return "mp3";

  if (bytes.length >= 2 && bytes[0] === 0xff) {
    // ADTS AAC: 동기 비트 12개 + layer 00
    if ((bytes[1] & 0xf6) === 0xf0) return "aac";
    // MPEG 오디오 Layer III 프레임: 동기 비트 11개 + layer 01
    if ((bytes[1] & 0xe0) === 0xe0 && ((bytes[1] >> 1) & 0x03) === 0x01) return "mp3";
  }
  return null;
}

/** 지원하는 형식이면 Gemini에 보낼 MIME을 돌려주고, 아니면 null(400 invalid_audio). */
export function detectAudioFormat(
  bytes: Uint8Array,
): { container: AudioContainer; mimeType: GeminiAudioMime } | null {
  const container = detectContainer(bytes);
  return container ? { container, mimeType: GEMINI_MIME[container] } : null;
}

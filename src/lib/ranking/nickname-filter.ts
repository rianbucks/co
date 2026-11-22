/**
 * 닉네임 금칙어 검사(명세 7장). 목록은 ./banned-words.ts 한 곳에 있다.
 * 화면(S1, S7, 정밀 랭킹)과 서버(일반 랭킹, 정밀 감정 랭킹 등록)가 ./nickname.ts를 거쳐 같이 쓴다.
 *
 * 닉네임을 두 가지 꼴로 바꿔 목록과 맞춰 본다.
 * 1. 숫자를 뺀 꼴: 사이에 숫자를 끼운 변형(시1발, ㅅ1ㅂ, fu2ck)을 잡는다. 영문은 소문자로 맞춘다.
 * 2. 1에서 자모를 글자로 모은 꼴: 자모로 풀어 쓴 변형(ㅅㅣㅂㅏㄹ, 시바ㄹ → 시발)을 잡는다.
 * 완성형 금칙어는 글자 단위로 맞춰 보므로 '신병철'(병신), '조지훈'(좆) 같은 이름은 걸리지 않는다.
 * 두 글자 이상인 금칙어는 일부 글자만 초성으로 쓴 꼴(ㅅ발, 시ㅂ, 병ㅅ)도 함께 찾는다.
 * 화면에서도 가져다 쓰므로 서버 전용 모듈을 가져오지 않는다.
 */
import { ALLOWED_CONTEXTS, BANNED_JAMO, BANNED_LATIN, BANNED_WORDS } from "./banned-words";

const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JUNGSEONG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
/** 받침. 0번은 받침 없음 */
const JONGSEONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
/** 자모 두 개로 친 겹받침 */
const DOUBLE_FINALS: Record<string, string> = {
  ㄱㅅ: "ㄳ", ㄴㅈ: "ㄵ", ㄴㅎ: "ㄶ", ㄹㄱ: "ㄺ", ㄹㅁ: "ㄻ", ㄹㅂ: "ㄼ", ㄹㅅ: "ㄽ", ㄹㅌ: "ㄾ", ㄹㅍ: "ㄿ", ㄹㅎ: "ㅀ", ㅂㅅ: "ㅄ",
};

const SYLLABLE_FIRST = 0xac00; // 가
const SYLLABLE_LAST = 0xd7a3; // 힣

function syllableIndex(char: string): number | null {
  const code = char.codePointAt(0) ?? 0;
  return code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST ? code - SYLLABLE_FIRST : null;
}

/** 완성형 글자를 자모로 푼다. 다른 글자는 그대로 둔다. */
function toJamo(text: string): string[] {
  const out: string[] = [];
  for (const char of text) {
    const index = syllableIndex(char);
    if (index === null) {
      out.push(char);
      continue;
    }
    out.push(CHOSEONG[Math.floor(index / 588)], JUNGSEONG[Math.floor((index % 588) / 28)]);
    if (index % 28) out.push(JONGSEONG[index % 28]);
  }
  return out;
}

/**
 * 자모를 완성형 글자로 모은다(초성 + 중성 + 받침). 받침은 다음 자모가 모음이 아닐 때만 붙인다.
 * 완성형 글자만 있는 문자열은 그대로 돌아온다(받침 다음 글자는 늘 초성으로 시작하기 때문이다).
 */
function composeJamo(tokens: readonly string[]): string {
  const isVowel = (token: string | undefined) => token !== undefined && JUNGSEONG.includes(token);
  let out = "";
  let i = 0;
  while (i < tokens.length) {
    const initial = CHOSEONG.indexOf(tokens[i]);
    const vowel = initial >= 0 ? JUNGSEONG.indexOf(tokens[i + 1] ?? "") : -1;
    if (initial < 0 || vowel < 0) {
      out += tokens[i];
      i += 1;
      continue;
    }
    i += 2;
    let final = 0;
    if (JONGSEONG.indexOf(tokens[i] ?? "") > 0 && !isVowel(tokens[i + 1])) {
      final = JONGSEONG.indexOf(tokens[i]);
      i += 1;
      const double = DOUBLE_FINALS[JONGSEONG[final] + (tokens[i] ?? "")];
      if (double && !isVowel(tokens[i + 1])) {
        final = JONGSEONG.indexOf(double);
        i += 1;
      }
    }
    out += String.fromCharCode(SYLLABLE_FIRST + (initial * 21 + vowel) * 28 + final);
  }
  return out;
}

/** 금칙어의 일부 글자만 초성으로 바꾼 꼴(시발 → ㅅ발, 시ㅂ). 모두 바꾼 꼴은 BANNED_JAMO에 따로 적는다. */
function partialInitials(word: string): string[] {
  const chars = [...word];
  if (chars.length < 2 || chars.some((char) => syllableIndex(char) === null)) return [];
  const initials = chars.map((char) => CHOSEONG[Math.floor(syllableIndex(char)! / 588)]);
  const out: string[] = [];
  for (let mask = 1; mask < (1 << chars.length) - 1; mask += 1) {
    out.push(chars.map((char, index) => (mask & (1 << index) ? initials[index] : char)).join(""));
  }
  return out;
}

const PATTERNS: readonly string[] = [
  ...BANNED_WORDS,
  ...BANNED_WORDS.flatMap(partialInitials),
  ...BANNED_JAMO,
  ...BANNED_LATIN,
];

/** form의 start부터 length 글자가 받는 말(ALLOWED_CONTEXTS, 예: 황보지) 안에 있으면 true */
function insideAllowedContext(form: string, start: number, length: number): boolean {
  return ALLOWED_CONTEXTS.some((context) => {
    for (let at = form.indexOf(context); at !== -1; at = form.indexOf(context, at + 1)) {
      if (at <= start && start + length <= at + context.length) return true;
    }
    return false;
  });
}

/** 받는 말 안에 있는 자리를 빼고 pattern이 한 번이라도 나오면 true */
function containsPattern(form: string, pattern: string): boolean {
  for (let at = form.indexOf(pattern); at !== -1; at = form.indexOf(pattern, at + 1)) {
    if (!insideAllowedContext(form, at, pattern.length)) return true;
  }
  return false;
}

/** 닉네임에 든 금칙어(목록의 꼴)를 돌려준다. 없으면 null. 걸린 말은 화면이나 응답에 그대로 보여 주지 않는다. */
export function findBannedWord(nickname: string): string | null {
  const stripped = nickname.normalize("NFC").toLowerCase().replace(/[0-9]/g, "");
  const forms = [stripped, composeJamo(toJamo(stripped))];
  return PATTERNS.find((pattern) => forms.some((form) => containsPattern(form, pattern))) ?? null;
}

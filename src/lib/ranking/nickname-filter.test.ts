import { describe, expect, it } from "vitest";
import { ALLOWED_CONTEXTS, BANNED_JAMO, BANNED_LATIN, BANNED_WORDS } from "./banned-words";
import { checkNickname } from "./nickname";
import { findBannedWord } from "./nickname-filter";

/** 흔한 성(두 글자 성 포함) */
const SURNAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍",
  "유", "고", "문", "양", "손", "배", "백", "허", "남", "심", "노", "하", "곽", "성", "차", "주", "우", "구", "민", "류",
  "나", "진", "지", "엄", "채", "원", "천", "방", "공", "현", "함", "변", "염", "여", "추", "도", "소", "석", "선", "설",
  "마", "길", "연", "위", "표", "명", "기", "반", "왕", "금", "옥", "육", "인", "맹", "제", "모", "탁", "국", "어", "은",
  "편", "용", "예", "경", "봉", "사", "부", "남궁", "황보", "제갈", "선우", "독고", "사공",
];

/** 흔한 이름(두 글자). 금칙어와 글자가 겹치는 이름(병철, 지훈, 남규, 어진, 애자, 보람, 자영)도 넣었다. */
const GIVEN_NAMES = [
  "민준", "서준", "도윤", "예준", "시우", "하준", "주원", "지호", "지후", "준우", "준서", "건우", "현우", "도현", "지훈",
  "우진", "선우", "서진", "유준", "연우", "은우", "민재", "현준", "시윤", "이준", "정우", "윤우", "승우", "지우", "유찬",
  "서연", "서윤", "서현", "민서", "하은", "하윤", "윤서", "지유", "지민", "채원", "수아", "지아", "지윤", "은서", "다은",
  "예은", "수빈", "소율", "예린", "병철", "병수", "병훈", "병진", "신혜", "신영", "지성", "지원", "지수", "보람", "보라",
  "보영", "보은", "자영", "자현", "애자", "순자", "영자", "미자", "남규", "남희", "어진", "어영", "동원", "동훈", "상철",
  "상민", "성민", "성훈", "재석", "재현", "종국", "종민", "진호", "태호", "혜진", "혜원", "희정", "경민", "경수", "미경",
  "정훈", "형준", "석진", "세훈", "새롬", "새미", "시아", "바름", "발그", "창민", "창호", "걸희", "강민", "니나", "미니",
  "섹연", "지란", "보미", "자윤", "동희", "야곱", "엿슬", "후성", "질희", "개똥",
];

describe("findBannedWord: 목록의 말", () => {
  it.each([...BANNED_WORDS, ...BANNED_JAMO, ...BANNED_LATIN])("'%s'를 잡는다(앞뒤에 다른 글자가 붙어도)", (word) => {
    expect(findBannedWord(word)).not.toBeNull();
    expect(findBannedWord(`나는${word}다`)).not.toBeNull();
  });

  it("목록 한 파일에 세 갈래(완성형, 자모, 영문)로 모여 있고 겹치는 말이 없다", () => {
    const all = [...BANNED_WORDS, ...BANNED_JAMO, ...BANNED_LATIN];
    expect(new Set(all).size).toBe(all.length);
    expect(BANNED_WORDS.every((word) => /^[가-힣]+$/.test(word))).toBe(true);
    expect(BANNED_JAMO.every((word) => /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(word))).toBe(true);
    expect(BANNED_LATIN.every((word) => /^[a-z]+$/.test(word))).toBe(true);
  });
});

describe("findBannedWord: 변형", () => {
  it.each([
    ["사이에 숫자를 끼운 말", ["시1발", "씨8발", "병1신", "개새1끼", "섹2스", "ㅅ1ㅂ", "ㅂ1ㅅ", "f1u2c3k", "se3x"]],
    ["자모로 풀어 쓴 말", ["ㅅㅣㅂㅏㄹ", "ㅆㅣㅂㅏㄹ", "ㅂㅕㅇㅅㅣㄴ", "시바ㄹ", "ㅈㅣㄹㅏㄹ", "ㅈㅗㅈ", "조ㅈ"]],
    ["초성으로 줄여 쓴 말", ["ㅅㅂ", "ㅆㅂ", "ㅄ", "ㅂㅅ", "ㅈㄹ", "ㄱㅅㄲ", "ㅁㅊ", "ㅗㅗ"]],
    ["일부 글자만 초성으로 쓴 말", ["ㅅ발", "시ㅂ", "ㅂ신", "병ㅅ", "개ㅅ끼", "새ㄲ", "ㅈ랄"]],
    ["대문자와 영문 자판으로 친 한글 욕설", ["FUCK", "Shit", "tlqkf", "Qudtls", "sibal"]],
    ["숫자와 자모를 섞은 말", ["ㅅ1ㅣ2ㅂ3ㅏ4ㄹ", "2ㅅㅂ2", "시1ㅂ"]],
  ])("%s", (_label, nicknames) => {
    for (const nickname of nicknames) expect(findBannedWord(nickname), nickname).not.toBeNull();
  });
});

describe("findBannedWord: 사람 이름과 흔한 말은 걸리지 않는다", () => {
  it("금칙어와 글자가 겹치는 흔한 성과 이름 조합(신병철, 조지훈)", () => {
    for (const name of ["신병철", "조지훈", "한남규", "홍어진", "박애자", "김보람", "윤자영", "정자현", "강민수"]) {
      expect(findBannedWord(name), name).toBeNull();
    }
  });

  it(`흔한 성 ${SURNAMES.length}개 × 이름 ${GIVEN_NAMES.length}개 조합은 하나도 걸리지 않는다`, () => {
    const blocked: string[] = [];
    for (const surname of SURNAMES) {
      for (const given of GIVEN_NAMES) {
        const name = surname + given;
        if (findBannedWord(name) !== null) blocked.push(`${name}(${findBannedWord(name)})`);
      }
    }
    expect(blocked).toEqual([]);
  });

  it("두 글자 성 '황보' 다음 '지'로 시작하는 이름(황보지훈)은 받는다. 같은 닉네임의 다른 자리에 나온 금칙어는 잡는다", () => {
    expect(ALLOWED_CONTEXTS).toEqual(["황보지"]);
    for (const name of ["황보지훈", "황보지영", "황보지은2", "황보민"]) expect(findBannedWord(name), name).toBeNull();
    expect(findBannedWord("황보지보지")).toBe("보지");
    expect(findBannedWord("황보지랄")).toBe("지랄");
    expect(findBannedWord("보지황보지")).toBe("보지");
  });

  it("이름 뒤에 숫자나 ㅋㅋ를 붙여도 이름은 걸리지 않는다", () => {
    for (const nickname of ["신병철2026", "조지훈ㅋㅋ", "박보람07", "홍어진ㅎㅎ", "김자영123"]) {
      expect(findBannedWord(nickname), nickname).toBeNull();
    }
  });

  it("로마자 이름과 영어 이름", () => {
    for (const nickname of ["ShinByungchul", "JoJihoon", "KimSibin", "Dickson", "Hancock", "Cassie", "Grape"]) {
      expect(findBannedWord(nickname), nickname).toBeNull();
    }
  });

  it("짧은 꼴을 넣지 않은 흔한 말: 시바견, 졸라맨, 애널리스트, 카펠라, 가족같이", () => {
    for (const nickname of ["시바견", "졸라맨", "애널리스트", "카펠라", "가족같이", "신발", "자장면", "보조지원"]) {
      expect(findBannedWord(nickname), nickname).toBeNull();
    }
  });

  it("'시발점', '병신년' 같은 일반 단어는 금칙어가 들어 있어 걸린다(감수한다)", () => {
    expect(findBannedWord("시발점")).toBe("시발");
    expect(findBannedWord("병신년")).toBe("병신");
  });
});

describe("checkNickname: 금칙어", () => {
  it("금칙어가 들어 있으면 banned", () => {
    for (const nickname of ["시1발", "ㅅㅂ", "개새끼", "fuck", "김치녀"]) {
      expect(checkNickname(nickname), nickname).toEqual({ ok: false, problem: "banned" });
    }
  });

  it("길이와 글자 규칙을 먼저 본다(금칙어가 들어 있어도 띄어쓰기가 있으면 characters)", () => {
    expect(checkNickname("ㅗ")).toEqual({ ok: false, problem: "length" });
    expect(checkNickname("시 발")).toEqual({ ok: false, problem: "characters" });
  });

  it("실명은 받는다", () => {
    expect(checkNickname("신병철")).toEqual({ ok: true, value: "신병철" });
    expect(checkNickname("조지훈")).toEqual({ ok: true, value: "조지훈" });
  });
});

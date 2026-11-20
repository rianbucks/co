/**
 * 경상 방언 정밀 감정서 PNG(1200×1600). 일반 감정서(S6)와 구분되도록 한지 색 바탕, 적갈색 머리띠,
 * 이중 테두리와 모서리 장식, 비스듬한 일치 여부 도장, 네모난 직인을 쓴다.
 * 브라우저에서만 쓴다(canvas).
 */
import { SUBREGION_NAMES, type GyeongsangResult } from '@/lib/gyeongsang/contract';
import { ORIGIN_NAMES, judgeOriginMatch, type OriginKey } from '@/lib/gyeongsang/origin';

export const GS_CERTIFICATE_TITLE = '경상 방언 정밀 감정서';

/** 감정서 색. 화면 미리 보기(GsCertificate)도 같은 값을 쓴다. */
export const GS_CERTIFICATE_COLORS = {
  paper: '#f6efe2',
  backdrop: '#e9dfcc',
  ink: '#3b2a1f',
  muted: '#8a6d4f',
  maroon: '#7a2e2e',
  gold: '#b7791f',
  goldLight: '#f3d9a4',
  teal: '#2f6f73',
  track: '#e5dccb',
  match: '#2e7d4f',
  mismatch: '#b23a3a',
  seal: '#c0392b',
} as const;

const SANS = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const SERIF = '"AppleMyungjo", "Nanum Myeongjo", "Noto Serif KR", "Noto Serif CJK KR", serif';

const font = (weight: number, size: number, family: string = SANS) => `${weight} ${size}px ${family}`;

/** 발급일: 2026년 11월 20일 */
export function formatIssuedDate(issuedAt: string): string {
  return new Date(issuedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function gsCertificateFileName(certificateNo: string): string {
  return `${certificateNo}-정밀감정서.png`;
}

function cornerBrackets(context: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number) {
  const size = 46;
  const corners: Array<[number, number, number, number]> = [
    [left, top, 1, 1],
    [right, top, -1, 1],
    [left, bottom, 1, -1],
    [right, bottom, -1, -1],
  ];
  context.strokeStyle = GS_CERTIFICATE_COLORS.gold;
  context.lineWidth = 5;
  for (const [x, y, dx, dy] of corners) {
    context.beginPath();
    context.moveTo(x + dx * size, y);
    context.lineTo(x, y);
    context.lineTo(x, y + dy * size);
    context.stroke();
  }
}

export function renderGsCertificate(result: GyeongsangResult, origin: OriginKey): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const width = 1200;
    const height = 1600;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('이미지를 만들 수 없습니다.'));
      return;
    }

    const color = GS_CERTIFICATE_COLORS;
    const match = judgeOriginMatch(origin, result.subregions);
    const issuedDate = formatIssuedDate(result.issuedAt);

    // 바탕과 이중 테두리, 모서리 장식
    context.fillStyle = color.backdrop;
    context.fillRect(0, 0, width, height);
    context.fillStyle = color.paper;
    context.fillRect(40, 40, width - 80, height - 80);
    context.strokeStyle = color.maroon;
    context.lineWidth = 10;
    context.strokeRect(62, 62, width - 124, height - 124);
    context.strokeStyle = color.gold;
    context.lineWidth = 2;
    context.strokeRect(82, 82, width - 164, height - 164);
    cornerBrackets(context, 96, 96, width - 96, height - 96);

    // 머리띠와 제목
    context.fillStyle = color.maroon;
    context.fillRect(96, 120, width - 192, 230);
    context.textAlign = 'center';
    context.fillStyle = color.goldLight;
    context.font = font(600, 21);
    context.fillText('GYEONGSANG DIALECT PRECISION APPRAISAL', width / 2, 178);
    context.fillStyle = color.paper;
    context.font = font(800, 66, SERIF);
    context.fillText(GS_CERTIFICATE_TITLE, width / 2, 262);
    context.fillStyle = color.goldLight;
    context.font = font(500, 24);
    context.fillText('원산지증명서 · 경상 정밀 감정', width / 2, 316);

    // 문서번호와 발급일
    context.textAlign = 'left';
    context.fillStyle = color.muted;
    context.font = font(500, 22);
    context.fillText('문서번호', 140, 410);
    context.textAlign = 'right';
    context.fillText('발급일', 1060, 410);
    context.fillStyle = color.ink;
    context.font = font(700, 26);
    context.textAlign = 'left';
    context.fillText(result.certificateNo, 140, 450);
    context.textAlign = 'right';
    context.fillText(issuedDate, 1060, 450);

    const divider = (y: number) => {
      context.strokeStyle = color.gold;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(140, y);
      context.lineTo(1060, y);
      context.stroke();
    };
    divider(490);

    // 항목: 왼쪽 이름, 오른쪽 값
    const label = (text: string, y: number) => {
      context.textAlign = 'left';
      context.fillStyle = color.muted;
      context.font = font(700, 25);
      context.fillText(text, 140, y);
    };

    label('신고 원산지', 568);
    context.fillStyle = color.ink;
    context.font = font(800, 38, SERIF);
    context.fillText(`${ORIGIN_NAMES[origin]} (${SUBREGION_NAMES[match.subregion]})`, 400, 570);

    // 감정 성분: 왼쪽 경북권, 오른쪽 경남권
    label('감정 성분', 668);
    const barLeft = 400;
    const barWidth = 660;
    const gyeongbukWidth = (barWidth * result.subregions.gyeongbuk) / 100;
    context.fillStyle = color.track;
    context.beginPath();
    context.roundRect(barLeft, 640, barWidth, 36, 18);
    context.fill();
    context.save();
    context.beginPath();
    context.roundRect(barLeft, 640, barWidth, 36, 18);
    context.clip();
    context.fillStyle = color.gold;
    context.fillRect(barLeft, 640, gyeongbukWidth, 36);
    context.fillStyle = color.teal;
    context.fillRect(barLeft + gyeongbukWidth, 640, barWidth - gyeongbukWidth, 36);
    context.restore();
    context.font = font(700, 24);
    context.fillStyle = color.gold;
    context.textAlign = 'left';
    context.fillText(`${SUBREGION_NAMES.gyeongbuk} ${result.subregions.gyeongbuk}%`, barLeft, 718);
    context.fillStyle = color.teal;
    context.textAlign = 'right';
    context.fillText(`${SUBREGION_NAMES.gyeongnam} ${result.subregions.gyeongnam}%`, barLeft + barWidth, 718);

    // 일치 여부: 비스듬한 도장
    label('일치 여부', 818);
    const stampColor = match.matched ? color.match : color.mismatch;
    context.save();
    context.translate(400 + 300, 806);
    context.rotate((-4 * Math.PI) / 180);
    context.font = font(900, 38, SERIF);
    const stampTextWidth = context.measureText(match.label).width;
    const stampWidth = Math.min(640, stampTextWidth + 64);
    context.strokeStyle = stampColor;
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(-stampWidth / 2, -46, stampWidth, 84, 14);
    context.stroke();
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(-stampWidth / 2 + 8, -38, stampWidth - 16, 68, 10);
    context.stroke();
    context.fillStyle = stampColor;
    context.textAlign = 'center';
    context.fillText(match.label, 0, 8, stampWidth - 40);
    context.restore();

    // 경상 농도와 등급
    label('경상 농도', 948);
    context.textAlign = 'left';
    context.fillStyle = color.ink;
    context.font = font(800, 46, SERIF);
    context.fillText(`${result.intensity.score}`, 400, 952);
    const scoreWidth = context.measureText(`${result.intensity.score}`).width;
    context.font = font(600, 26);
    context.fillStyle = color.muted;
    context.fillText(' / 100점', 400 + scoreWidth, 952);
    context.fillStyle = color.track;
    context.beginPath();
    context.roundRect(400, 978, barWidth, 14, 7);
    context.fill();
    context.fillStyle = color.maroon;
    context.beginPath();
    context.roundRect(400, 978, Math.max(14, (barWidth * result.intensity.score) / 100), 14, 7);
    context.fill();

    label('등급', 1068);
    context.textAlign = 'left';
    context.fillStyle = color.ink;
    context.font = font(800, 38, SERIF);
    context.fillText(`${result.intensity.grade}등급 · ${result.intensity.gradeName}`, 400, 1070, 660);

    divider(1140);

    // 증명 문구, 발급 기관, 직인
    context.textAlign = 'center';
    context.fillStyle = color.ink;
    context.font = font(600, 30, SERIF);
    context.fillText('위와 같이 경상 방언 정밀 감정 결과를 증명합니다.', width / 2, 1232);
    context.fillStyle = color.muted;
    context.font = font(500, 25);
    context.fillText(issuedDate, width / 2, 1286);

    // 직인은 안쪽 테두리(아래 1518) 위에 두고, 발급 기관은 직인 가운데 높이에 맞춘다.
    context.fillStyle = color.ink;
    context.font = font(800, 36, SERIF);
    context.textAlign = 'right';
    context.fillText('경상 방언 정밀 감정위원회', 900, 1397);

    const sealX = 930;
    const sealY = 1318;
    const sealSize = 132;
    context.strokeStyle = color.seal;
    context.lineWidth = 6;
    context.strokeRect(sealX, sealY, sealSize, sealSize);
    context.lineWidth = 2;
    context.strokeRect(sealX + 9, sealY + 9, sealSize - 18, sealSize - 18);
    context.fillStyle = color.seal;
    context.font = font(900, 40, SERIF);
    context.textAlign = 'center';
    context.fillText('경상', sealX + sealSize / 2, sealY + 60);
    context.fillText('감정', sealX + sealSize / 2, sealY + 108);

    context.fillStyle = color.muted;
    context.font = font(500, 19);
    context.fillText('본 감정서는 음성 분석 결과를 기록한 문서이며, 신고 원산지는 저장하지 않습니다.', width / 2, 1488);

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 파일을 만들지 못했습니다.'));
    }, 'image/png');
  });
}

export function downloadPng(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

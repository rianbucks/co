import { notFound } from "next/navigation";
import RecordingTestPage from "./RecordingTestPage";

/** 실제 기기 점검 전용 화면은 운영 배포에서 공개하지 않는다. */
export default function TestRecordingRoute() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RecordingTestPage />;
}

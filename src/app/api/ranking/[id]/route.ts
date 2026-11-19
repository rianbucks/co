/**
 * DELETE /api/ranking/{id}: 운영자가 랭킹 항목을 지운다.
 * 헤더 Authorization: Bearer <ADMIN_TOKEN>. 성공 204, 토큰이 없거나 틀리면 401, 없는 항목은 404.
 */
import { isMockMode } from "@/lib/config";
import {
  deleteRanking,
  isAdminRequest,
  isAdminTokenConfigured,
  rankingError,
  toHttpResponse,
} from "@/lib/ranking/service";
import { rankingStoreFromEnv } from "@/lib/ranking/store";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!isAdminTokenConfigured(adminToken)) {
      console.error("[ranking] ADMIN_TOKEN이 없거나 16자보다 짧아 삭제 요청을 받지 않는다");
    }
    if (!isAdminRequest(request.headers.get("authorization"), adminToken)) {
      return toHttpResponse(rankingError({ error: "unauthorized" }));
    }

    const { id } = await params;
    const store = rankingStoreFromEnv(process.env, { mock: isMockMode(process.env) });
    const outcome = await deleteRanking(id, store);
    if (outcome.status === 204) console.warn("[ranking] 운영자가 항목을 삭제했다", { id });
    return toHttpResponse(outcome);
  } catch (error) {
    console.error("[ranking] 삭제 중 예외", error);
    return toHttpResponse(rankingError({ error: "server_error" }));
  }
}

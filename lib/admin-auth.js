// 관리자 페이지용 간단 비밀번호 게이트.
// 실습/데모 목적입니다 — 세션 관리·해싱·레이트리밋이 없는 평문 비교이므로
// 실제 고객 데이터를 다루는 운영 환경에는 그대로 쓰지 마세요.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

function checkAdminAuth(req) {
  const header = req.headers && req.headers['x-admin-password'];
  return typeof header === 'string' && header.length > 0 && header === ADMIN_PASSWORD;
}

module.exports = { checkAdminAuth, ADMIN_PASSWORD };

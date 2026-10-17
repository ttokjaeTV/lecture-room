/* =========================================================
   강의실 설정 (4안 홈페이지 안에 들어간 강의실) — 이 파일만 고치면 됩니다
   ========================================================= */
window.LR_CONFIG = {
  SITE_NAME: '누부공 강의실',

  // 홈페이지 상단바·푸터 안에 들어가는 방식 (강의실 자체 상단바는 숨김)
  EMBED: true,

  // 진도 막대 위를 걸어가는 캐릭터 그림 (비우면 표시 안 함)
  CHARACTER_IMG: 'assets/img/character.png',

  // 입장 비밀번호 (SHA-256 값). 사이트 전체 잠금(assets/lr/site-gate.js)의 값을 그대로 따른다.
  // 바꾸는 법: lecture-room/tools/password-hash.html 에서 값을 만들어 붙여넣기
  SITE_PASSWORD_SHA256: window.LR_SITE_HASH || 'c5cc15b6430ca720613daef384c58149870660959a4ecbb76ba3b55ba02ad77e',

  // Supabase 연결 정보 (Project Settings → API Keys). 비워 두면 데모 모드(이 브라우저에만 저장)
  SUPABASE_URL: 'https://vpphzfbuzkmhlojvfkjr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_KsEHk7U9y729c6w9L5KF3Q_9WTRTF5j',   // 공개용(publishable) 키. secret 키는 절대 넣지 말 것

  // 수강 권한이 없는 강의의 [수강 신청하기] 버튼이 갈 곳
  // 회원가입 동의 항목의 [보기] 링크 (비우면 링크 없이 문구만)
  TERMS_URL: 'legal/terms.html',
  PRIVACY_URL: 'legal/privacy.html',

  PURCHASE_URL: 'lectures-shop.html',
  HOME_URL: '',

  CONTACT_TEXT: '추가 시청이 필요하면 카페 1:1 문의로 연락 주세요.'
};

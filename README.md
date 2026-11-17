# Ashen Company (가제)

AI 용병과 함께하는 다크 판타지 텍스트 던전 RPG.

원칙: **규칙은 코드, 말은 AI.** 호감도·전투·보상은 코드가 계산하고, AI는 대사와 선택지 문장만 만든다.

## 실행

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY를 채우면 실제 AI, 비우면 mock
npm run dev                  # http://localhost:3000
```

| 명령 | 설명 |
|---|---|
| `npm test` | 테스트 (Vitest) |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 린트 |

## 폴더 구조

```
src/
  app/              페이지와 API 주소만 (page, layout, api/talk)
  components/game/  게임 화면 (길드, 대화, 초상화 등)
  game/             순수 게임 규칙. React·Next·AI를 import하지 않는다
  data/             특성 표(랜덤 용병 재료), 고유 용병
  test/             테스트용 예시 용병
  server/ai/        AI 호출, 프롬프트, mock. 서버 전용
  lib/schemas.ts    프론트와 서버가 같이 쓰는 Zod 타입
public/             이미지, 사운드 (나중에)
```

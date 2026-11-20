// 임시 실루엣. 진짜 그림(Spine 파츠)이 생기면 이 컴포넌트만 바꾼다.
// 직업은 무기 모양으로, 적은 몸 모양으로 구별한다.

const WEAPON: Record<string, React.ReactNode> = {
  // 오른손 쪽에 든 무기 (캐릭터는 오른쪽을 바라본다)
  // 검과 방패 (방패는 앞쪽 팔에)
  knight: (
    <>
      <path d="M50 34 L66 10 M48 30 l6 4" strokeWidth={3} />
      <path d="M52 40 h12 v14 q-6 8 -12 0 z" strokeWidth={1.5} />
    </>
  ),
  assassin: <path d="M46 46 L58 40" strokeWidth={3} />,
  nun: <path d="M50 30 v18 M45 35 h10" strokeWidth={2.5} />,
  archer: <path d="M52 22 q12 18 0 36 M52 22 v36" strokeWidth={2} fill="none" />,
  greatsword: <path d="M44 50 L70 12" strokeWidth={5} />,
  herbalist: <path d="M48 44 h10 v10 h-10 z" strokeWidth={2} />,
  mage: <path d="M48 58 L56 14 M56 14 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0" strokeWidth={2.5} />,
  spiritcaller: <circle cx={56} cy={30} r={6} strokeWidth={2} fill="none" />,
};

/** 용병 실루엣. 종족에 따라 키와 체격이 조금 다르다 */
export function MercSilhouette({ job, race }: { job?: string; race?: string }) {
  const scale = { dwarf: [1.15, 0.82], elf: [0.92, 1.08], barbarian: [1.15, 1.08], beastfolk: [1, 1] }[race ?? ""] ?? [1, 1];
  return (
    <svg viewBox="0 0 80 100" className="h-full w-full overflow-visible" aria-hidden>
      <g transform={`translate(40 100) scale(${scale[0]} ${scale[1]}) translate(-40 -100)`} className="fill-current stroke-current">
        {race === "beastfolk" && <path d="M27 12 l3 -9 4 8 M46 11 l4 -8 3 9" strokeWidth={2} />}
        <circle cx={40} cy={18} r={9} />
        <path d="M28 30 q12 -6 24 0 l4 34 h-32 z" />
        <path d="M30 64 l-3 34 h7 l6 -30 6 30 h7 l-3 -34 z" />
        <path d="M30 32 l-8 24 M50 32 l2 14" strokeWidth={5} strokeLinecap="round" />
        {job && WEAPON[job]}
      </g>
    </svg>
  );
}

/** 적 실루엣. 이름에서 종류를 알아낸다 (왼쪽을 바라본다) */
export function EnemySilhouette({ name }: { name: string }) {
  const body = name.includes("쥐")
    ? // 낮고 넓은 쥐떼
      <path d="M8 96 q4 -26 30 -26 q24 0 34 18 l6 -2 -2 10 z M18 74 l-6 -6 2 9 M30 70 l-3 -7 6 5" />
    : name.includes("사냥개")
      ? // 길쭉한 네발 짐승
        <path d="M6 60 q8 -12 22 -6 l30 2 q16 0 18 14 l-4 26 h-6 l-2 -20 h-26 l-4 20 h-6 l-2 -24 q-14 0 -20 -12 z" />
      : name.includes("파수병")
        ? // 크고 각진 갑옷
          <path d="M28 6 h24 v16 h-24 z M18 24 h44 l4 40 h-52 z M22 64 h14 v34 h-14 z M44 64 h14 v34 h-14 z M10 26 v40 h6 v-40 z" />
        : name.includes("포자")
          ? // 부풀어 오른 덩어리
            <path d="M14 98 q-10 -40 14 -60 q12 -24 30 -6 q22 14 12 66 z M30 30 a5 5 0 1 0 0.1 0 M52 40 a4 4 0 1 0 0.1 0" />
          : // 구부정한 망자
            <path d="M44 16 a9 9 0 1 0 0.1 0 M30 30 q16 -4 24 8 l-2 30 h-24 z M30 68 l-6 30 h7 l7 -26 4 26 h7 l-4 -30 z M30 34 l-14 20" strokeWidth={4} />;
  return (
    <svg viewBox="0 0 80 100" className="h-full w-full overflow-visible" aria-hidden>
      <g className="fill-current stroke-current">{body}</g>
    </svg>
  );
}

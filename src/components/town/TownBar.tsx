import { CURRENCY } from "@/data/economy";
import { Button } from "@/components/common/parts";

/** 마을 화면 위쪽 바: 지금 있는 곳, 날짜(원정 횟수), 금화, 마을로 돌아가기 */
export function TownBar({
  place,
  day,
  gold,
  onBack,
}: {
  place: string;
  day: number;
  gold: number;
  /** 마을(홈)이 아닐 때만 */
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-3">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button className="!px-2.5 !py-1 text-xs" onClick={onBack}>
            ← 마을
          </Button>
        )}
        <p className="text-xs tracking-[0.3em] text-ash">변경 마을 · {place}</p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-ash">{day}일째</span>
        <span className="text-ember">
          {CURRENCY} {gold}
        </span>
      </div>
    </div>
  );
}

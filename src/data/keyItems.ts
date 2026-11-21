// 히든 열쇠: 클랜 창고에 보관하고 원정을 넘어 유지된다 (종류마다 최대 1개).
// 히든 층(data/regions.ts의 hidden)에 들어가는 열쇠다. 규칙은 game/state/state.ts의 원정 종료.
// - 이번 원정에서 얻은 열쇠는 살아 돌아와야 창고에 들어간다 (전멸하면 잃는다)
// - 이미 가진 열쇠를 또 얻으면 금화로 바꾼다
// - 히든 층에 들어갔을 때: 히든 보스를 쓰러뜨리고 나오면 소모, 맵·전투 후퇴는 유지, 전멸하면 잃는다

export type KeyItemId = "world_tree_branch" | "blood_invitation";

export type KeyItem = {
  id: KeyItemId;
  name: string;
  description: string;
  /** 이미 가지고 있을 때 또 얻으면 바뀌는 금화 */
  duplicateGold: number;
};

export const KEY_ITEMS: Record<KeyItemId, KeyItem> = {
  world_tree_branch: {
    id: "world_tree_branch",
    name: "세계수의 가지",
    description: "나무 거인이 품고 있던 가지. 숲 깊은 곳의 무언가가 이 냄새에 반응한다고 한다.",
    duplicateGold: 30,
  },
  blood_invitation: {
    id: "blood_invitation",
    name: "핏빛 초대장",
    description: "붉은 밀랍으로 봉한 초대장. 받는 사람의 이름이 저절로 적혀 있다.",
    duplicateGold: 50,
  },
};

export function isKeyItem(id: string): id is KeyItemId {
  return id in KEY_ITEMS;
}

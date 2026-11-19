// 개발·테스트용 샘플 용병. 길드가 이 용병들로 채워진 채 시작한다.
// 직업 8개와 종족 5개가 모두 한 번 이상 나오고, 패시브도 골고루 들어 있다.
// 프로필은 AI 없이 직접 쓴 것이다. 실제 모집(모집 공고)은 그대로 AI로 만든다.
// 끄려면 USE_SAMPLE_ROSTER를 false로 바꾼다.
import { resolveTraits, rollStart, seededRandom } from "../game/generate";
import { rollSkills } from "./skillgen";
import type { MercProfile, MercSeed, MercTraits } from "../lib/schemas";

export const USE_SAMPLE_ROSTER = true;

type Sample = {
  id: string;
  traits: MercTraits;
  passives: string[];
  profile: MercProfile;
};

const SAMPLES: Sample[] = [
  {
    id: "s-bran",
    traits: {
      race: "human",
      job: "knight",
      personalities: ["honorable"],
      background: "veteran",
    },
    passives: ["solidarity"],
    profile: {
      name: "브란",
      title: "말수 적은 기사",
      persona:
        "한 번 한 약속은 목숨을 걸고 지킨다. 대신 남에게도 똑같은 것을 요구한다.",
      background:
        "국경 수비대에서 십 년을 버텼다. 부대가 해산된 뒤 창 하나만 들고 길드에 왔다.",
      secret: "마지막 전투에서 자기 명령 때문에 부하 셋을 잃었다.",
      speechStyle: "짧고 단정한 존댓말. 군대식 표현이 섞인다.",
      exampleLines: [
        "약속은 지키십시오. 저도 지키겠습니다.",
        "앞은 제가 맡겠습니다.",
      ],
    },
  },
  {
    id: "s-durgan",
    traits: {
      race: "dwarf",
      job: "greatsword",
      personalities: ["jovial"],
      background: "deserter",
    },
    passives: ["rising_cheer"],
    profile: {
      name: "두르강",
      title: "노래하는 대검사",
      persona:
        "맞을수록 신이 나는 드워프. 무너진 고향 얘기만 나오면 웃음이 사라진다.",
      background:
        "고향을 되찾겠다는 원정대에 있었지만, 원정이 엉망이 되자 대검만 챙겨 빠져나왔다.",
      secret: "원정대가 버린 동료들이 아직 던전 어딘가에 갇혀 있다고 믿는다.",
      speechStyle: "호탕한 반말. 크게 웃고 술 얘기를 자주 한다.",
      exampleLines: [
        "하하! 한 대 더 맞으면 노래가 절로 나오겠군!",
        "술값은 네가 내는 거지?",
      ],
    },
  },
  {
    id: "s-elowen",
    traits: {
      race: "elf",
      job: "spiritcaller",
      personalities: ["proud"],
      background: "wanderer",
    },
    passives: ["wind_blessing"],
    profile: {
      name: "엘로웬",
      title: "바람을 듣는 정령사",
      persona:
        "인간을 한 수 아래로 보지만, 바람의 정령이 고른 사람이라면 따라간다.",
      background:
        "숲을 떠나 오래 떠돌았다. 묶인 바람 정령이 점점 약해지는 것을 느끼고 있다.",
      secret:
        "자신의 정령이 병들어 가는 이유가 던전 깊은 곳에 있다고 생각한다.",
      speechStyle: "느리고 고풍스러운 말투. 상대를 '그대'라고 부른다.",
      exampleLines: [
        "그대의 발소리는 너무 크구나.",
        "바람이 그대를 가리킨다면, 따르지.",
      ],
    },
  },
  {
    id: "s-kesh",
    traits: {
      race: "beastfolk",
      job: "assassin",
      personalities: ["paranoid"],
      background: "ex_slave",
    },
    passives: ["finishing_bite"],
    profile: {
      name: "케쉬",
      title: "등을 보이지 않는 암살자",
      persona:
        "누구도 믿지 않는다. 냄새로 사람을 먼저 판단하고, 말은 그다음이다.",
      background: "인간 귀족의 사냥개 노릇을 하다 쇠사슬을 끊고 도망쳤다.",
      secret: "옛 주인의 문장이 새겨진 단검을 아직 버리지 못했다.",
      speechStyle: "짧고 날카로운 반말. 냄새와 기척 얘기를 한다.",
      exampleLines: ["거짓말 냄새가 나.", "내 뒤에 서지 마."],
    },
  },
  {
    id: "s-ragna",
    traits: {
      race: "barbarian",
      job: "archer",
      personalities: ["reckless"],
      background: "war_orphan",
    },
    passives: ["war_cry"],
    profile: {
      name: "라그나",
      title: "맹세 문신의 궁수",
      persona:
        "겁을 모르고 먼저 뛰어든다. 맹세를 깨는 자는 절대 용서하지 않는다.",
      background:
        "북쪽 부족이 전쟁으로 흩어진 뒤 홀로 남부로 내려왔다. 팔에 맹세 문신이 셋 있다.",
      secret: "세 번째 문신은 부족을 버린 자에게 복수하겠다는 맹세다.",
      speechStyle: "단순하고 직설적인 반말. 맹세라는 말을 자주 쓴다.",
      exampleLines: ["말했으면 지켜라.", "먼저 쏘고 나중에 생각한다."],
    },
  },
  {
    id: "s-mirel",
    traits: {
      race: "human",
      job: "nun",
      personalities: ["kind"],
      background: "plague_survivor",
    },
    passives: [],
    profile: {
      name: "미렐",
      title: "다정한 떠돌이 수녀",
      persona:
        "누구에게나 손을 내민다. 이 땅에서 살아남기엔 너무 무르다는 말을 듣는다.",
      background: "역병이 휩쓴 마을에서 혼자 살아남아 수녀원에 들어갔다.",
      secret: "자기만 살아남은 이유가 신의 뜻이 아니라는 것을 알고 있다.",
      speechStyle: "부드러운 존댓말. 상대의 안부를 먼저 묻는다.",
      exampleLines: [
        "다치신 데는 없으세요?",
        "같이 가요. 혼자 가시면 안 돼요.",
      ],
    },
  },
  {
    id: "s-aithne",
    traits: {
      race: "elf",
      job: "mage",
      personalities: ["cynical"],
      background: "fallen_noble",
    },
    passives: ["first_strike"],
    profile: {
      name: "아이시네",
      title: "냉소하는 불꽃 술사",
      persona:
        "세상이 망한 걸 마법 탓으로 돌리는 사람들을 비웃는다. 그 비웃음이 자기를 향할 때도 있다.",
      background:
        "숲의 명가 출신이지만 금지된 불의 술법을 익혀 이름을 빼앗겼다.",
      secret: "자신이 익힌 술법이 정말 재앙과 관련 있을지도 모른다고 의심한다.",
      speechStyle: "건조하고 비꼬는 말투. 존댓말과 반말을 섞는다.",
      exampleLines: [
        "마법이 무섭다고? 그럼 굶어 죽는 건 안 무섭고?",
        "불은 거짓말을 안 해.",
      ],
    },
  },
  {
    id: "s-tob",
    traits: {
      race: "beastfolk",
      job: "herbalist",
      personalities: ["greedy"],
      background: "debtor",
    },
    passives: ["wild_recovery"],
    profile: {
      name: "토브",
      title: "빚쟁이 약초꾼",
      persona:
        "약값은 꼭 받는다. 빚이 많아서 금화 냄새에 누구보다 먼저 반응한다.",
      background:
        "약초 장사로 진 빚을 갚으려고 던전에 들어간다. 상처는 이상하게 빨리 낫는다.",
      secret: "빚을 진 상대는 그를 사냥하던 인간 상단이다.",
      speechStyle: "능글맞은 반말. 값을 따지는 말이 입에 붙어 있다.",
      exampleLines: [
        "그 약? 공짜는 아니야.",
        "금화 소리가 들리면 따라가는 거지.",
      ],
    },
  },
];

/** 호감도 효과를 시험하려고 샘플 용병마다 단계가 다르게 둔다 (적대 ~ 신뢰) */
const SAMPLE_AFFINITY: Record<string, number> = {
  "s-bran": 60, // 호의
  "s-durgan": 80, // 신뢰
  "s-elowen": 30, // 경계
  "s-kesh": 8, // 적대
  "s-ragna": 45, // 중립
  "s-mirel": 90, // 신뢰
  "s-aithne": 40, // 중립
  "s-tob": 18, // 경계
};
/** 고용 의향도 100으로 고정한다 (80 이상이라 동행 제안이 바로 성공한다) */
export const SAMPLE_WILLINGNESS = 100;

/** 샘플 용병 시드. 고용 의향은 실제 모집과 같은 규칙으로 계산한다 (시드 고정이라 매번 같다) */
export function sampleSeeds(): MercSeed[] {
  return SAMPLES.map((s, i) => ({
    id: s.id,
    traits: s.traits,
    start: {
      ...rollStart(resolveTraits(s.traits) ?? [], seededRandom(1000 + i)),
      affinity: SAMPLE_AFFINITY[s.id] ?? 50,
      willingness: SAMPLE_WILLINGNESS,
    },
    level: "apprentice",
    passives: s.passives,
    // 직업 2 + 종족 1 + 직업·종족 1 (시드 고정이라 매번 같다)
    skills: rollSkills(s.traits.job, s.traits.race, seededRandom(2000 + i)),
    profile: s.profile,
  }));
}

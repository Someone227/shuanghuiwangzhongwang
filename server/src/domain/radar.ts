/**
 * 政策雷达（Radar）
 *
 * 政策库有 32 份政策、333 个表单字段，而字段命名几乎没有统一约定
 * （同一件事在不同政策里叫 education.level / student.educationLevel / education.stage…）。
 * 逐份政策填一遍太累，用户真正想问的是：「我这种情况，32 份里哪些能申？」
 *
 * 做法：
 * 1. 定义一套「统一画像槽位」（RadarSlot）—— 只收跨政策真正复用的信息（21 项）。
 * 2. 用规则表把每份政策的字段映射到槽位（FIELD_RULES）。
 *    - 映射不上、或者槽位值在该政策的选项里没有对应项时，宁可不写 ——
 *      留空只会得到「待补充」，写错会得到「不符合」，后者更伤人。
 * 3. 把槽位值翻译成该政策自己的字段 key，交给 matcher.evaluate 逐份判定。
 * 4. 按结论分四层：能申 / 差一点 / 还缺信息 / 不符合。
 *
 * 全程纯函数、不联网、不调用大模型 —— 和单政策判定引擎同源，结果可复现。
 */
import { evaluate } from './matcher.js';
import type { ConditionGroup, EvaluationResult, PolicyCategory, PolicyLevel, Policy, ProfileField, Verdict } from './types.js';

/* ------------------------------------------------------------------ *
 * 一、统一画像槽位
 * ------------------------------------------------------------------ */

export type RadarSlotKind = 'select' | 'number' | 'boolean' | 'multiselect';

export interface RadarSlotOption {
  /** 存进画像的值 */
  value: string;
  /** 展示文案 */
  label: string;
  /** 匹配政策字段选项时额外尝试的写法（同一件事的不同叫法） */
  aliases?: string[];
}

export interface RadarSlot {
  key: string;
  label: string;
  kind: RadarSlotKind;
  group: '学业情况' | '身份与阶段' | '家庭情况' | '品行与其他';
  unit?: string;
  placeholder?: string;
  /** 为什么建议填这一项：填了能判断哪些政策 */
  hint?: string;
  /** 只有部分人才需要填（如残疾等级）：表单里标「（选填）」，避免被当成必填 */
  optional?: boolean;
  options?: RadarSlotOption[];
}

/**
 * 统一画像槽位：21 项，覆盖政策库里跨政策复用的高频条件。
 *
 * 刻意只收「多份政策都会问」的信息 —— 政策特有的条款（如「父亲是否服刑」）
 * 不放进统一画像，留给单份政策的判定页。
 */
export const RADAR_SLOTS: RadarSlot[] = [
  // 学业情况
  {
    key: 'eduLevel',
    label: '当前学历/学段',
    kind: 'select',
    group: '学业情况',
    hint: '几乎每份政策都会限定学段，填了能筛掉一大半不相关的',
    options: [
      { value: '幼儿园', label: '幼儿园', aliases: ['幼儿', '学前教育', '普惠性幼儿园'] },
      { value: '小学', label: '小学', aliases: ['小学', '义务教育'] },
      { value: '初中', label: '初中', aliases: ['初中', '义务教育'] },
      { value: '高中', label: '普通高中', aliases: ['高中', '普通高中'] },
      { value: '中职', label: '中等职业学校', aliases: ['中职', '中等职业', '中专', '职业高中'] },
      { value: '专科', label: '专科（高职）', aliases: ['专科', '高职', '高等职业', '高等专科', '大专'] },
      { value: '本科', label: '本科', aliases: ['本科', '普通本科', '大学本科', '本专科'] },
      { value: '硕士', label: '硕士研究生', aliases: ['硕士', '硕士研究生', '研究生'] },
      { value: '博士', label: '博士研究生', aliases: ['博士', '博士研究生', '研究生'] },
    ],
  },
  {
    key: 'grade',
    label: '当前年级',
    kind: 'number',
    group: '学业情况',
    placeholder: '如 2',
    hint: '政策常写「二年级及以上」，需要数字',
  },
  {
    key: 'enrollYear',
    label: '入学年份',
    kind: 'number',
    group: '学业情况',
    placeholder: '如 2023',
    hint: '部分政策用入学年份判断「是否仍在正常学制内」',
  },
  {
    key: 'schoolType',
    label: '就读学校类型',
    kind: 'select',
    group: '学业情况',
    hint: '区分公办/民办、本科/高职，很多资助政策按学校类型分层',
    options: [
      { value: '中央部门所属高校', label: '中央部门所属高校', aliases: ['中央部门所属', '中央部属'] },
      { value: '地方所属高校', label: '地方所属高校', aliases: ['地方所属', '地方高校'] },
      { value: '公办普通本科', label: '公办普通本科', aliases: ['公办普通本科', '全日制公办普通高等学校', '公办普通高等学校'] },
      { value: '公办高职高专', label: '公办高职/高专', aliases: ['公办高等职业', '公办高等专科', '高等职业学校', '高等专科学校'] },
      { value: '民办高校', label: '民办高校（含独立学院）', aliases: ['民办', '独立学院'] },
      { value: '中等职业学校', label: '中等职业学校', aliases: ['中等职业', '中职', '技工学校'] },
      { value: '普通高中', label: '普通高中', aliases: ['普通高中'] },
      { value: '初中', label: '初中', aliases: ['初中'] },
      { value: '小学', label: '小学', aliases: ['小学'] },
      { value: '幼儿园', label: '普惠性幼儿园', aliases: ['幼儿园', '普惠性幼儿园'] },
      { value: '科研机构', label: '科研机构等其他研究生培养机构', aliases: ['科研机构', '研究生培养单位'] },
    ],
  },
  {
    key: 'studyForm',
    label: '学习形式',
    kind: 'select',
    group: '学业情况',
    options: [
      { value: '全日制', label: '全日制', aliases: ['全日制'] },
      { value: '非全日制', label: '非全日制', aliases: ['非全日制'] },
    ],
  },
  {
    key: 'academicRank',
    label: '学习成绩排名（前 %）',
    kind: 'number',
    group: '学业情况',
    unit: '%',
    placeholder: '如 10 表示前 10%',
    hint: '奖学金类政策普遍要求「排名前 10%/30%」',
  },
  {
    key: 'compositeRank',
    label: '综合考评排名（前 %）',
    kind: 'number',
    group: '学业情况',
    unit: '%',
    placeholder: '如 15',
  },
  {
    key: 'excellent',
    label: '品学兼优、表现突出（学习成绩优秀 / 生活俭朴 / 积极上进）',
    kind: 'boolean',
    group: '学业情况',
    hint: '奖学金和励志奖学金普遍要求「品学兼优、表现突出」，按实际情况自评即可',
  },
  {
    key: 'ethnicity',
    label: '民族',
    kind: 'select',
    group: '身份与阶段',
    hint: '少数民族骨干计划等政策会要求',
    options: [
      { value: '汉族', label: '汉族' },
      { value: '少数民族', label: '少数民族', aliases: ['少数民族', '民族自治'] },
    ],
  },

  // 身份与阶段
  {
    key: 'nationality',
    label: '国籍',
    kind: 'select',
    group: '身份与阶段',
    options: [
      { value: '中华人民共和国', label: '中国', aliases: ['中华人民共和国', '中国', '中国国籍'] },
      { value: '其他', label: '其他国家', aliases: ['其他', '外国'] },
    ],
  },
  {
    key: 'age',
    label: '年龄',
    kind: 'number',
    group: '身份与阶段',
    unit: '岁',
    placeholder: '如 20',
  },
  {
    key: 'enrollmentStatus',
    label: '学籍状态',
    kind: 'select',
    group: '身份与阶段',
    options: [
      { value: '在籍在校', label: '在籍在校', aliases: ['在籍在校', '在校生', '在校'] },
      { value: '休学', label: '休学/保留学籍', aliases: ['休学', '保留学籍'] },
      { value: '已毕业', label: '已毕业', aliases: ['毕业', '已毕业'] },
      { value: '退学', label: '退学', aliases: ['退学'] },
    ],
  },
  {
    key: 'freshGraduate',
    label: '是否应届毕业生',
    kind: 'boolean',
    group: '身份与阶段',
    hint: '基层就业、升学类政策常要求应届',
  },
  {
    key: 'graduateYear',
    label: '毕业年份',
    kind: 'number',
    group: '身份与阶段',
    placeholder: '如 2026',
  },
  {
    key: 'graduatePlan',
    label: '是否通过国家统一招生计划录取（统招全日制在籍）',
    kind: 'boolean',
    group: '身份与阶段',
    hint: '资助类政策普遍要求「纳入全国研究生招生计划」「国家普通本科招生计划录取」，统招生填「是」',
  },

  // 家庭情况
  {
    key: 'economicDifficulty',
    label: '家庭经济是否困难',
    kind: 'boolean',
    group: '家庭情况',
    hint: '助学金、助学贷款、困难认定的总开关',
  },
  {
    key: 'specialGroups',
    label: '是否属于这些特殊群体',
    kind: 'multiselect',
    group: '家庭情况',
    hint: '可多选；勾选的项会写进政策要求「属于特殊群体」的判定',
    options: [
      { value: '建档立卡', label: '建档立卡（脱贫）家庭学生', aliases: ['建档立卡', '脱贫家庭'] },
      { value: '低保', label: '最低生活保障家庭学生', aliases: ['低保', '最低生活保障'] },
      { value: '特困供养', label: '特困救助供养学生', aliases: ['特困', '特困供养', '特困救助'] },
      { value: '孤儿', label: '孤儿/事实无人抚养儿童', aliases: ['孤儿', '无人抚养'] },
      { value: '残疾', label: '残疾学生本人', aliases: ['残疾', '残疾人证'] },
      { value: '烈士子女', label: '烈士子女', aliases: ['烈士子女'] },
      { value: '突发变故', label: '家庭遭重大灾害/突发变故', aliases: ['自然灾害', '突发意外', '突发事件'] },
      { value: '深度贫困地区', label: '位于深度贫困/连片特困地区', aliases: ['深度贫困', '连片特困'] },
      { value: 'none', label: '以上都不符合', aliases: ['均不属于', '都不符合'] },
    ],
  },
  {
    key: 'disabilityLevel',
    label: '残疾等级',
    kind: 'select',
    group: '家庭情况',
    optional: true,
    hint: '只有持残疾人证的才需要按等级填；没有残疾就选「没有残疾」，不用留空',
    options: [
      { value: '一级', label: '一级' },
      { value: '二级', label: '二级' },
      { value: '三级', label: '三级' },
      { value: '四级', label: '四级' },
      { value: 'none', label: '没有残疾', aliases: ['没有残疾', '无残疾', '非残疾', '不适用'] },
    ],
  },
  {
    key: 'ruralHukou',
    label: '户籍是否为农村',
    kind: 'boolean',
    group: '家庭情况',
  },
  {
    key: 'localHukou',
    label: '是否具有本地户籍或居住证',
    kind: 'boolean',
    group: '家庭情况',
    hint: '临时救助、地方补贴常要求本地户籍/居住证',
  },

  // 品行与其他
  {
    key: 'political',
    label: '思想政治表现良好（热爱祖国、拥护党的领导）',
    kind: 'boolean',
    group: '品行与其他',
    hint: '奖助学金普遍把这条写成硬性条件，如实填写即可',
  },
  {
    key: 'honest',
    label: '诚实守信、品德优良',
    kind: 'boolean',
    group: '品行与其他',
  },
  {
    key: 'lawAbiding',
    label: '遵守法律法规与校纪校规',
    kind: 'boolean',
    group: '品行与其他',
  },
  {
    key: 'voluntary',
    label: '自愿提出申请',
    kind: 'boolean',
    group: '品行与其他',
    hint: '多数政策要求「本人自愿申请」，默认按「是」填',
  },
  {
    key: 'militaryService',
    label: '是否服兵役/退役士兵',
    kind: 'boolean',
    group: '品行与其他',
    hint: '入伍资助、退役复学政策需要',
  },
  {
    key: 'teacherMajor',
    label: '是否师范类专业',
    kind: 'boolean',
    group: '品行与其他',
    hint: '公费师范生、优师专项需要',
  },
];

/** 槽位索引，便于查找 */
const SLOT_BY_KEY = new Map(RADAR_SLOTS.map((slot) => [slot.key, slot]));

/* ------------------------------------------------------------------ *
 * 二、字段映射规则
 * ------------------------------------------------------------------ *
 *
 * 规则按「具体 -> 通用」排序：先匹配先赢。
 * - keys：字段 key 精确列表（小写比较）
 * - keyEnds：字段 key 末段精确列表
 * - label：字段 label 正则
 * - type：只接受这些字段类型，类型不符直接跳过（防止把 boolean 槽位写进 select 字段）
 * - flag：multiselect 槽位命中哪个选项时才写 true
 * - valueMap：把槽位取值翻译成该字段的取值
 *   （典型：统一画像里「学习形式=全日制」，政策字段却是 boolean「是否全日制在校生」）
 */

interface FieldRule {
  slot: string;
  type: ProfileField['type'] | Array<ProfileField['type']>;
  keys?: string[];
  keyEnds?: string[];
  label?: RegExp;
  flag?: string;
  valueMap?: Record<string, unknown>;
}

const FIELD_RULES: FieldRule[] = [
  // ---------- 国籍 ----------
  { slot: 'nationality', type: 'select', keys: ['nationality', 'identity.nationality', 'person.nationality'] },
  { slot: 'nationality', type: 'select', label: /国籍/ },

  // ---------- 学历 / 学段 ----------
  { slot: 'eduLevel', type: 'select', keys: ['education.level', 'student.educationLevel', 'educationLevel', 'degreeLevel', 'education.stage', 'student.stage', 'stage'] },
  { slot: 'eduLevel', type: 'select', label: /学历层次|就读学历|教育阶段|修读课程层次|就读阶段/ },

  // ---------- 学校类型 ----------
  { slot: 'schoolType', type: 'select', keys: ['student.schoolType', 'school.type', 'student.schoolCategory', 'schoolCategory'] },
  { slot: 'schoolType', type: 'select', label: /学校类型|高校类型|学校性质|就读学校类型|学校类别/ },
  // 「就读高校类型」讲的是主管关系（中央部门所属/地方所属），也归到 schoolType
  { slot: 'schoolType', type: 'select', label: /高校类型|主管/ },

  // ---------- 学习形式 ----------
  { slot: 'studyForm', type: 'select', keys: ['student.studyForm', 'studyForm', 'student.studyMode', 'studyMode'] },
  { slot: 'studyForm', type: 'select', label: /学习形式|培养方式/ },
  // 很多政策不问「学习形式」，而是直接问 boolean「是否全日制在校生」
  {
    slot: 'studyForm',
    type: 'boolean',
    label: /全日制/,
    valueMap: { 全日制: true, 非全日制: false },
  },

  // ---------- 年级 ----------
  { slot: 'grade', type: 'number', keys: ['education.grade', 'student.grade', 'academic.grade', 'grade'] },
  { slot: 'grade', type: 'number', label: /^年级$|^s*年级|当前年级|就读年级|在园年级/ },

  // ---------- 入学年份 ----------
  { slot: 'enrollYear', type: 'number', keys: ['education.enrollmentYear', 'enrollYear', 'student.enrollmentYear'] },
  { slot: 'enrollYear', type: 'number', label: /入学年份|入学年度|入学时间/ },

  // ---------- 成绩排名 ----------
  { slot: 'academicRank', type: 'number', keys: ['academic.rankPercent', 'academic.rank', 'major.rankPercent'] },
  { slot: 'academicRank', type: 'number', label: /学习成绩排名.*百分|成绩排名百分|学习排名百分/ },
  { slot: 'compositeRank', type: 'number', keys: ['academic.comprehensiveRankPercent', 'academic.compositeRank', 'academic.comprehensiveRank'] },
  { slot: 'compositeRank', type: 'number', label: /综合.*排名.*百分|综合考评.*百分/ },

  // ---------- 年龄 ----------
  { slot: 'age', type: 'number', keys: ['age', 'identity.age', 'age.current', 'personal.age', 'child.age'] },
  { slot: 'age', type: 'number', label: /^年龄$|本人年龄/ },

  // ---------- 学籍状态 ----------
  { slot: 'enrollmentStatus', type: 'select', keys: ['enrollmentStatus', 'education.enrollmentStatus', 'student.enrollmentStatus', 'student.status'] },
  { slot: 'enrollmentStatus', type: 'select', label: /学籍状态|在校状态/ },

  // ---------- 应届 / 毕业年份 ----------
  { slot: 'freshGraduate', type: 'boolean', keys: ['isFreshGraduate', 'student.isFreshGraduate', 'identity.isFreshGraduate'] },
  { slot: 'freshGraduate', type: 'boolean', label: /是否(为)?应届(高校)?毕业生/ },
  { slot: 'graduateYear', type: 'number', keys: ['education.graduationYear', 'identity.graduationYear', 'graduationYear'] },
  { slot: 'graduateYear', type: 'number', label: /毕业年份|毕业年度/ },

  // ---------- 研究生招生计划 ----------
  { slot: 'graduatePlan', type: 'boolean', keys: ['student.isIncludedInGraduatePlan', 'enrollmentPlan', 'study.enrollmentPlan'] },
  { slot: 'graduatePlan', type: 'boolean', label: /纳入全国研究生招生计划|纳入国家(普通本科|研究生)?招生计划|纳入国家统一招生计划/ },

  // ---------- 家庭经济困难 ----------
  { slot: 'economicDifficulty', type: 'boolean', keys: ['family.economicDifficulty', 'familyFinancialDifficulty', 'student.isFinancialDifficulty', 'economicDifficulty'] },
  { slot: 'economicDifficulty', type: 'boolean', label: /家庭经济(是否)?困难|经济状况是否难以满足|家庭经济状况困难|属于家庭经济困难学生|家庭经济困难情况|家庭经济困难学生/ },
  // 「家庭经济困难认定情况」是 select（已认定/未认定），也归到困难判定
  {
    slot: 'economicDifficulty',
    type: 'select',
    label: /家庭经济困难认定情况/,
    valueMap: { true: '已认定为家庭经济困难', false: '未认定' },
  },

  // ---------- 学籍状态（boolean 写法）----------
  { slot: 'enrollmentStatus', type: 'boolean', label: /是否在籍在校/, valueMap: { 在籍在校: true, 已毕业: false, 休学: false, 退学: false } },

  // ---------- 特殊群体（多选，命中才写 true）----------
  { slot: 'specialGroups', type: 'boolean', flag: '建档立卡', label: /建档立卡|脱贫家庭/ },
  { slot: 'specialGroups', type: 'boolean', flag: '低保', label: /低保|最低生活保障/ },
  { slot: 'specialGroups', type: 'boolean', flag: '特困供养', label: /特困(救助)?供养|特困人员/ },
  { slot: 'specialGroups', type: 'boolean', flag: '孤儿', label: /孤儿|事实无人抚养/ },
  { slot: 'specialGroups', type: 'boolean', flag: '烈士子女', label: /烈士子女/ },
  { slot: 'specialGroups', type: 'boolean', flag: '突发变故', label: /重大自然灾害|突发意外|突发事件|火灾、交通事故/ },
  { slot: 'specialGroups', type: 'boolean', flag: '深度贫困地区', label: /深度贫困|连片特困/ },
  { slot: 'specialGroups', type: 'boolean', flag: '*', label: /是否属于特殊群体|特殊群体/ },
  { slot: 'specialGroups', type: 'multiselect', keys: ['family.specialGroupTypes', 'specialGroupTypes'], flag: '*' },

  // ---------- 残疾 ----------
  { slot: 'specialGroups', type: 'boolean', flag: '残疾', label: /残疾人证|本人是否残疾|残疾学生/ },
  { slot: 'disabilityLevel', type: 'select', keys: ['disability.level', 'disabilityLevel', 'person.disabilityLevel'] },
  { slot: 'disabilityLevel', type: 'select', label: /残疾等级/ },
  // 选了「没有残疾」：顺手把「是否持有残疾人证」这类 boolean 判否，不让用户再填一遍
  { slot: 'disabilityLevel', type: 'boolean', keys: ['disability.hasCertificate'], valueMap: { none: false } },
  { slot: 'disabilityLevel', type: 'boolean', label: /残疾人证/, valueMap: { none: false } },

  // ---------- 户籍 ----------
  { slot: 'ruralHukou', type: 'boolean', keys: ['isRural', 'hukou.isRural', 'identity.isRural'] },
  { slot: 'ruralHukou', type: 'boolean', label: /农村户籍|户籍是否为农村/ },
  { slot: 'localHukou', type: 'boolean', keys: ['hukou.isLocal', 'isLocalHukou', 'residence.hasLocalHukou'] },
  { slot: 'localHukou', type: 'boolean', label: /本地户籍|持有当地居住证|户籍所在地与经常居住地是否一致/ },

  // ---------- 品行 ----------
  { slot: 'political', type: 'boolean', keys: ['political.support', 'politicalSupport', 'loveSocialistCountry', 'conduct.political'] },
  { slot: 'political', type: 'boolean', label: /热爱社会主义祖国|热爱祖国|拥护中国共产党的领导|拥护党的/ },
  { slot: 'honest', type: 'boolean', keys: ['conduct.integrity', 'honest', 'honestAndExcellent', 'conduct.honest'] },
  { slot: 'honest', type: 'boolean', label: /诚实守信|道德品质优良/ },
  { slot: 'lawAbiding', type: 'boolean', keys: ['conduct.compliance', 'lawAbiding', 'conduct.lawAbiding'] },
  { slot: 'lawAbiding', type: 'boolean', label: /遵守宪法|遵守法律|遵守学校规章制度|遵守学校各项规章制度/ },
  { slot: 'voluntary', type: 'boolean', keys: ['application.voluntary', 'voluntary', 'application.isVoluntary'] },
  { slot: 'voluntary', type: 'boolean', label: /自愿(提出)?申请|本人自愿/ },

  // ---------- 品学兼优 / 综合表现 ----------
  { slot: 'excellent', type: 'boolean', keys: ['academic.isExcellent', 'performance.isExcellent', 'isExcellent'] },
  { slot: 'excellent', type: 'boolean', label: /学习成绩(是否)?(优异|优秀)|品学兼优|综合素质(是否)?优秀|生活(是否)?俭朴|勤奋学习|积极上进|表现非常突出|表现特别突出|科研能力(是否)?显著|发展潜力(是否)?突出/ },

  // ---------- 民族 ----------
  { slot: 'ethnicity', type: 'boolean', keys: ['ethnicity.isMinority', 'isMinority', 'person.isMinority'] },
  { slot: 'ethnicity', type: 'boolean', label: /是否为少数民族|少数民族/ , valueMap: { 汉族: false, 少数民族: true } },
  { slot: 'ethnicity', type: 'select', keys: ['ethnicity', 'person.ethnicity', 'nation'] },
  { slot: 'ethnicity', type: 'select', label: /^民族$/ },

  // ---------- 兵役 / 师范 ----------
  { slot: 'militaryService', type: 'boolean', keys: ['military.isVeteran', 'isVeteran', 'military.enlisted'] },
  { slot: 'militaryService', type: 'boolean', label: /退役士兵|应征入伍服义务兵役|退役后自愿回校复学/ },
  { slot: 'teacherMajor', type: 'boolean', keys: ['education.isTeacherMajor', 'isTeacherMajor', 'major.isNormal'] },
  { slot: 'teacherMajor', type: 'boolean', label: /师范专业|师范类专业/ },
];

/* ------------------------------------------------------------------ *
 * 三、映射与扫描
 * ------------------------------------------------------------------ */

/** 去掉括号/空格/标点后比较，避免「专科（高职）」和「专科(高职)」对不上 */
function normalizeOption(text: string): string {
  return text.replace(/[\s（）()【】\[\]「」、，,。·・\-—_/]/g, '').toLowerCase();
}

/**
 * 在政策字段的选项里，找到能表达槽位值的那一项。
 *
 * 三种匹配：完全相同 -> 互相包含（取更具体的那个方向的第一个）。
 * 找不到就返回 undefined —— 调用方会保持该字段为空，结论落到「待补充」而不是「不符合」。
 */
export function matchOption(candidates: string[], options: string[]): string | undefined {
  const normalizedOptions = options.map((raw) => ({ raw, norm: normalizeOption(raw) }));

  for (const candidate of candidates) {
    const norm = normalizeOption(candidate);
    if (!norm) continue;
    const exact = normalizedOptions.find((item) => item.norm === norm);
    if (exact) return exact.raw;
  }

  for (const candidate of candidates) {
    const norm = normalizeOption(candidate);
    if (norm.length < 2) continue;
    const contains = normalizedOptions.find(
      (item) => item.norm.includes(norm) || (item.norm.length >= 2 && norm.includes(item.norm)),
    );
    if (contains) return contains.raw;
  }

  // 第三轮：办学层次关键词。
  // 政策里同一件事的写法差得很远（「本科」vs「全日制普通本科高等学校」），
  // 但层次关键词（本科/高职/高中…）是稳定的，按关键词对齐。
  // 注意「本科」不是「本专科」的子串（本-专-科），所以这里靠同义组对齐，而不是字符串包含。
  for (const candidate of candidates) {
    const norm = normalizeOption(candidate);
    const words = LEVEL_WORDS.filter((word) => norm.includes(word));
    for (const word of words) {
      const compatible = LEVEL_COMPAT[word] ?? [word];
      const hit = normalizedOptions.find((item) => compatible.some((alias) => item.norm.includes(alias)));
      if (hit) return hit.raw;
    }
  }

  return undefined;
}

/** 办学层次关键词，用于 matchOption 的兜底对齐（长词在前，避免「本科」吃掉「本专科」） */
const LEVEL_WORDS = ['第二学士学位', '博士研究生', '硕士研究生', '本专科', '研究生', '本科', '高职', '高等职业', '高等专科', '专科', '中职', '中等职业', '高中', '初中', '小学', '幼儿园'];

/**
 * 层次同义词表：左边是画像里的写法，右边是政策原文可能用的写法。
 * 只列真正等价的词 —— 「硕士」绝不能兼容「研究生」，否则会命中「博士研究生」。
 */
const LEVEL_COMPAT: Record<string, string[]> = {
  第二学士学位: ['第二学士学位', '本专科', '本科'],
  本专科: ['本专科', '本科', '专科', '高职', '高等职业', '高等专科'],
  本科: ['本科', '本专科', '学士'],
  专科: ['专科', '本专科', '高职', '高等职业', '高等专科'],
  高职: ['高职', '高等职业', '高等专科', '专科', '本专科'],
  高等职业: ['高职', '高等职业', '高等专科', '专科', '本专科'],
  高等专科: ['高职', '高等职业', '高等专科', '专科', '本专科'],
  硕士研究生: ['硕士研究生', '硕士'],
  硕士: ['硕士研究生', '硕士'],
  博士研究生: ['博士研究生', '博士'],
  博士: ['博士研究生', '博士'],
  研究生: ['研究生', '硕士研究生', '博士研究生'],
  中职: ['中职', '中等职业', '技工学校', '技工'],
  中等职业: ['中职', '中等职业', '技工学校', '技工'],
  高中: ['高中', '普通高中', '高中阶段'],
  初中: ['初中'],
  小学: ['小学'],
  幼儿园: ['幼儿园', '学前'],
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string' && value !== '') return [value];
  return [];
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function ruleMatches(rule: FieldRule, field: ProfileField): boolean {
  const types = Array.isArray(rule.type) ? rule.type : [rule.type];
  if (!types.includes(field.type)) return false;
  // multiselect 槽位可能写到 boolean 字段上（勾选了某群体 -> true），规则用 flag 表达
  const key = field.key.toLowerCase();
  if (rule.keys && rule.keys.some((item) => item.toLowerCase() === key)) return true;
  if (rule.keyEnds) {
    const last = key.split('.').pop() ?? '';
    if (rule.keyEnds.some((item) => item.toLowerCase() === last)) return true;
  }
  if (rule.label && rule.label.test(field.label)) return true;
  return false;
}

/** 一个字段可能被多条规则命中：保留全部候选，按规则表顺序尝试取值 */
function collectFieldCandidates(policy: Policy): Map<string, FieldRule[]> {
  const candidates = new Map<string, FieldRule[]>();
  for (const field of policy.fields ?? []) {
    const hits = FIELD_RULES.filter((rule) => ruleMatches(rule, field));
    if (hits.length > 0) candidates.set(field.key, hits);
  }
  return candidates;
}

interface SlotValueResult {
  ok: boolean;
  value?: unknown;
}

/**
 * 把一个槽位值翻译成某个政策字段能接受的值。
 *
 * select 槽位必须映射到该政策自己的选项，否则宁可不写：
 * 例如统一画像里「本科」，在选项只有「本专科（含第二学士学位和预科生）」的政策里
 * 可以通过别名「本专科」命中；但若选项是「研究生培养单位」则映射失败，保持空值。
 */
function mapValueToField(slot: RadarSlot, raw: unknown, field: ProfileField, rule?: FieldRule): SlotValueResult {
  if (isEmptyValue(raw)) return { ok: false };

  // 显式取值映射优先：例如「学习形式=全日制」-> 政策字段 boolean「是否全日制在校生」= true
  if (rule?.valueMap) {
    const mapped = rule.valueMap[String(raw)] ?? (raw === true ? rule.valueMap.true : raw === false ? rule.valueMap.false : undefined);
    if (mapped === undefined) return { ok: false };
    return { ok: true, value: mapped };
  }

  if (field.type === 'boolean') {
    if (slot.kind === 'multiselect') {
      const picked = asStringArray(raw);
      if (picked.length === 0) return { ok: false };
      const flag = rule?.flag;
      // 用户明确勾了「以上都不符合」：这些互斥的事实条件可以写成 false
      if (picked.includes('none')) return { ok: true, value: false };
      if (!flag) return { ok: false };
      if (flag === '*') return { ok: true, value: true };
      return { ok: picked.includes(flag), value: picked.includes(flag) ? true : undefined };
    }
    if (typeof raw !== 'boolean') return { ok: false };
    return { ok: true, value: raw };
  }

  if (field.type === 'number') {
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) return { ok: false };
    return { ok: true, value: num };
  }

  if (field.type === 'select') {
    const options = field.options ?? [];
    if (options.length === 0) return { ok: false };
    const canonical = String(raw);
    const option = SLOT_BY_KEY.get(slot.key)?.options?.find((item) => item.value === canonical);
    const candidates = [canonical, ...(option?.aliases ?? [])];
    const hit = matchOption(candidates, options);
    if (!hit) return { ok: false };
    return { ok: true, value: hit };
  }

  return { ok: false };
}

export interface RadarProfileBuild {
  /** 翻译成该政策字段 key 的画像，可直接交给 evaluate */
  profile: Record<string, unknown>;
  /** 实际用上的槽位（前端展示「这份政策用到了你填的哪几项」） */
  usedSlots: string[];
  /** 该政策有、但统一画像里没有对应槽位的字段 */
  unmappedFields: string[];
  /**
   * 统一画像「能过问」的字段 key —— 有映射规则就算，不管用户填没填。
   *
   * 用来区分两种「还缺信息」：
   * - 能过问但没填：在雷达页补填就能消掉；
   * - 政策特有字段：只能进政策页逐条填。
   */
  coverableFields: string[];
}

/**
 * 把统一画像翻译成某份政策的画像。
 *
 * 只写「能确定表达」的值：映射失败或用户没填的字段一律留空，
 * 这样判定结论只会是「待补充」，不会凭空判成「不符合」。
 */
export function buildPolicyProfile(policy: Policy, slots: Record<string, unknown>): RadarProfileBuild {
  const profile: Record<string, unknown> = {};
  const usedSlots = new Set<string>();
  const candidates = collectFieldCandidates(policy);
  const unmappedFields: string[] = [];
  const coverableFields: string[] = [];

  for (const field of policy.fields ?? []) {
    const rules = candidates.get(field.key);
    if (!rules || rules.length === 0) {
      unmappedFields.push(field.label);
      continue;
    }
    coverableFields.push(field.key);

    let mapped = false;
    for (const rule of rules) {
      const slot = SLOT_BY_KEY.get(rule.slot);
      if (!slot) continue;
      const raw = slots[slot.key];
      const result = mapValueToField(slot, raw, field, rule);
      if (result.ok && result.value !== undefined) {
        profile[field.key] = result.value;
        usedSlots.add(slot.key);
        mapped = true;
        break;
      }
    }

    if (!mapped && !unmappedFields.includes(field.label)) unmappedFields.push(field.label);
  }

  return { profile, usedSlots: [...usedSlots], unmappedFields, coverableFields };
}

export type RadarStatus = 'eligible' | 'near' | 'incomplete' | 'ineligible';

export interface RadarScanItem {
  policyId: string;
  title: string;
  category: PolicyCategory;
  level: PolicyLevel;
  year: number;
  status: RadarStatus;
  overall: Verdict;
  /** 硬性条件通过数 */
  pass: number;
  /** 硬性条件不满足数 */
  fail: number;
  /** 还缺信息的硬性条件数 */
  unknown: number;
  /** 硬性条件下标总数 */
  total: number;
  /** 不满足的条件（最多 4 条，前端直接展示「差在哪」） */
  blockers: Array<{ label: string; gap?: string; hint?: string }>;
  /** 还缺的信息（最多 4 条） */
  missing: Array<{ label: string; reason: string; kind: 'radar' | 'policy' }>;
  /** 这份政策用到了哪些槽位 */
  usedSlots: string[];
  /** 用不上统一画像的字段数（说明这份政策有很多特有条款） */
  policySpecificFields: number;
  /** 学段明显不符（政策面向的学段里没有用户这一档） */
  stageConflict?: boolean;
  /** 统一画像能过问、但还缺信息的条件数 */
  radarUnknown: number;
  /** 政策特有条款还缺信息的条件数（只能进政策页补） */
  policyUnknown: number;
  hasLocalOverride?: boolean;
}

export interface RadarSummary {
  /** 填了多少项 */
  filled: number;
  /** 槽位总数 */
  totalSlots: number;
  eligible: number;
  near: number;
  incomplete: number;
  ineligible: number;
  /** 一共算了多少份政策 */
  policies: number;
  /** 硬性条件总数 */
  conditions: number;
  /** 通过 / 不满足 / 待补充 的条件数 */
  pass: number;
  fail: number;
  unknown: number;
}

export interface RadarResult {
  items: RadarScanItem[];
  summary: RadarSummary;
  /** 没填的槽位，按「填了能解锁多少份政策」排序（前端提示先填哪几项最划算） */
  suggestions: Array<{ slot: RadarSlot; unlockedPolicies: number }>;
}

/**
 * 分层判定。
 *
 * 关键：不能因为「政策特有条款没填」就把一份政策判成「还缺很多信息」——
 * 那类条款统一画像本来就收不了，用户必须进政策页逐条填。
 * 所以按「统一画像能过问的条件还差几项」来分层：
 * - 全满足 -> 能申
 * - 有明确不满足 -> 不符合
 * - 能过问的还差 0 项（只剩政策特有条款）-> 差一点：进去补完就能定
 * - 能过问的还差 1-2 项 -> 差一点：回雷达补这两项
 * - 差得更多 -> 还缺信息
 */
function classify(result: EvaluationResult, radarUnknown: number): RadarStatus {
  if (result.overall === 'fail') return 'ineligible';
  if (result.overall === 'pass') return 'eligible';
  // 没有明确卡点、统一画像能过问的条件也都满足了（且确实判定通过过几条）：
  // 剩下的只是政策特有条款，进政策页补完就能定 —— 这已经是「大方向可以申」
  if (radarUnknown === 0 && result.summary.pass >= 2) return 'eligible';
  return radarUnknown <= 2 ? 'near' : 'incomplete';
}

const STATUS_ORDER: Record<RadarStatus, number> = {
  eligible: 0,
  near: 1,
  incomplete: 2,
  ineligible: 3,
};

/**
 * 学段关键词表：顺序从低到高，长词在前避免「本科」吃掉「本专科」。
 *
 * 政策的学段要求经常写在条款正文里（「在公办幼儿园就读」「义务教育阶段学生」），
 * 对应字段却不一定是 select，统一画像抓不到。这里从政策文本里反推面向学段，
 * 用户学段完全不在其中时直接排除 —— 否则会出现「本科生能申免费学前教育」这种结论。
 */
const STAGE_PATTERNS: Array<{ stage: string; re: RegExp }> = [
  { stage: '幼儿园', re: /幼儿园|学前教育|学前一年|在园/ },
  { stage: '小学', re: /小学/ },
  { stage: '初中', re: /初中/ },
  { stage: '高中', re: /普通高中|高中阶段/ },
  { stage: '中职', re: /中等职业|中职|技工学校/ },
  { stage: '专科', re: /高职|高等职业|高等专科|专科/ },
  { stage: '本科', re: /本科|本专科|学士/ },
  { stage: '硕士', re: /硕士研究生|硕士/ },
  { stage: '博士', re: /博士研究生|博士/ },
];

/** 把用户的学历/学段换算成学段关键词（本科 -> 本科；硕士 -> 硕士） */
function toStageWord(eduLevel: unknown): string | undefined {
  if (typeof eduLevel !== 'string' || eduLevel === '') return undefined;
  const hit = STAGE_PATTERNS.find((item) => item.stage === eduLevel);
  return hit?.stage;
}

/**
 * 推断政策面向的学段。
 *
 * 只看「有实质约束力」的文本：标题、条件 label、条件引用原文、字段 label。
 * 命中多个学段说明是多学段通用政策（如「普通本科高校、高等职业学校国家助学金」涵盖专科+本科）。
 */
export function inferPolicyStages(policy: Policy): string[] {
  const texts: string[] = [policy.title];
  for (const group of policy.conditions ?? []) {
    for (const condition of group.conditions ?? []) {
      texts.push(condition.label, condition.quote);
    }
  }
  for (const field of policy.fields ?? []) {
    texts.push(field.label);
    if (field.options?.length) texts.push(field.options.join(' '));
  }
  const blob = texts.join(' ');
  return STAGE_PATTERNS.filter((item) => item.re.test(blob)).map((item) => item.stage);
}

/** 条件 id -> 字段 key，用来判断这条条件是不是统一画像能过问的 */
function conditionFieldMap(policy: Policy): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of policy.conditions ?? []) {
    for (const condition of group.conditions ?? []) {
      map.set(condition.id, condition.field);
    }
  }
  return map;
}

function scanOne(policy: Policy, slots: Record<string, unknown>): { item: RadarScanItem; result: EvaluationResult } {
  const built = buildPolicyProfile(policy, slots);
  const result = evaluate(policy, built.profile);

  const coverable = new Set(built.coverableFields);
  const fieldByCondition = conditionFieldMap(policy);

  // 学段护栏：政策面向的学段里没有用户这一档，直接排除并说清原因
  const policyStages = inferPolicyStages(policy);
  const userStage = toStageWord(slots.eduLevel);
  const stageConflict = Boolean(userStage && policyStages.length > 0 && !policyStages.includes(userStage!));
  const isCoverable = (conditionId: string): boolean => {
    const field = fieldByCondition.get(conditionId);
    return field ? coverable.has(field) : false;
  };

  const hardConditions = result.conditions.filter((item) => item.verdict !== 'warn');
  const unknownConditions = hardConditions.filter((item) => item.verdict === 'unknown');
  const radarUnknown = unknownConditions.filter((item) => isCoverable(item.conditionId)).length;
  const policyUnknown = unknownConditions.length - radarUnknown;

  const blockers = hardConditions
    .filter((item) => item.verdict === 'fail')
    .slice(0, 4)
    .map((item) => ({ label: item.label, gap: item.gap, hint: item.hint }));
  const missing = unknownConditions.slice(0, 4).map((item) => ({
    label: item.label,
    reason: item.reason,
    kind: (isCoverable(item.conditionId) ? 'radar' : 'policy') as 'radar' | 'policy',
  }));

  if (stageConflict) {
    blockers.unshift({
      label: `面向${policyStages.join('/')}，不包含${userStage}`,
      gap: `你填的是「${String(slots.eduLevel)}」，这份政策面向${policyStages.join('、')}`,
      hint: '学段不符就不用准备了，把时间留给真正能申的',
    });
  }

  return {
    item: {
      policyId: policy.id,
      title: policy.title,
      category: policy.category,
      level: policy.level,
      year: policy.year,
      status: stageConflict ? 'ineligible' : classify(result, radarUnknown),
      stageConflict,
      overall: result.overall,
      pass: result.summary.pass,
      fail: result.summary.fail,
      unknown: result.summary.unknown,
      total: hardConditions.length,
      blockers,
      missing,
      usedSlots: built.usedSlots,
      policySpecificFields: built.unmappedFields.length,
      radarUnknown,
      policyUnknown,
    },
    result,
  };
}

/**
 * 扫描全部政策：统一画像 -> 每份政策的结论与分层。
 *
 * 纯函数，可在浏览器里跑（静态部署）或在服务端跑（/api/radar/scan）。
 */
export function scanPolicies(policies: Policy[], slots: Record<string, unknown>): RadarResult {
  const filledSlots = RADAR_SLOTS.filter((slot) => !isEmptyValue(slots[slot.key]));

  const scanned = policies
    .map((policy) => scanOne(policy, slots))
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.item.status] - STATUS_ORDER[b.item.status];
      if (statusDiff !== 0) return statusDiff;
      if (Boolean(a.item.stageConflict) !== Boolean(b.item.stageConflict)) {
        return a.item.stageConflict ? 1 : -1;
      }
      // 同层内：不符合的按不满足数升序（差得少的排前面），其余按待补充升序
      if (a.item.status === 'ineligible') return a.item.fail - b.item.fail;
      return a.item.unknown - b.item.unknown || a.item.title.localeCompare(b.item.title, 'zh-CN');
    });

  const items = scanned.map((entry) => entry.item);
  const conditionTotals = scanned.reduce(
    (acc, entry) => {
      for (const condition of entry.result.conditions) {
        if (condition.verdict === 'warn') continue;
        if (condition.verdict === 'pass') acc.pass += 1;
        else if (condition.verdict === 'fail') acc.fail += 1;
        else acc.unknown += 1;
        acc.conditions += 1;
      }
      return acc;
    },
    { pass: 0, fail: 0, unknown: 0, conditions: 0 },
  );

  const summary: RadarSummary = {
    filled: filledSlots.length,
    totalSlots: RADAR_SLOTS.length,
    eligible: items.filter((item) => item.status === 'eligible').length,
    near: items.filter((item) => item.status === 'near').length,
    incomplete: items.filter((item) => item.status === 'incomplete').length,
    ineligible: items.filter((item) => item.status === 'ineligible').length,
    policies: items.length,
    conditions: conditionTotals.conditions,
    pass: conditionTotals.pass,
    fail: conditionTotals.fail,
    unknown: conditionTotals.unknown,
  };

  return { items, summary, suggestions: buildSuggestions(policies, slots) };
}

/**
 * 「先填哪一项最划算」：对每个没填的槽位，估算填了之后能参与判定的政策数。
 *
 * 估算方式：该槽位在各政策里能映射到字段的政策数（不要求映射值成立）。
 */
export function buildSuggestions(policies: Policy[], slots: Record<string, unknown>): Array<{ slot: RadarSlot; unlockedPolicies: number }> {
  const unlocked = new Map<string, Set<string>>();
  for (const policy of policies) {
    const candidates = collectFieldCandidates(policy);
    const slotsInPolicy = new Set<string>();
    for (const rules of candidates.values()) {
      for (const rule of rules) slotsInPolicy.add(rule.slot);
    }
    for (const slotKey of slotsInPolicy) {
      if (!unlocked.has(slotKey)) unlocked.set(slotKey, new Set());
      unlocked.get(slotKey)!.add(policy.id);
    }
  }

  return RADAR_SLOTS.filter((slot) => isEmptyValue(slots[slot.key]))
    .map((slot) => ({ slot, unlockedPolicies: unlocked.get(slot.key)?.size ?? 0 }))
    .filter((item) => item.unlockedPolicies > 0)
    .sort((a, b) => b.unlockedPolicies - a.unlockedPolicies || a.slot.label.localeCompare(b.slot.label, 'zh-CN'));
}

/** 统计每个槽位能覆盖多少份政策（构建静态数据时也用它给前端做提示） */
export function slotCoverage(policies: Policy[]): Record<string, number> {
  const result = buildSuggestions(policies, {});
  const map: Record<string, number> = {};
  for (const item of result) map[item.slot.key] = item.unlockedPolicies;
  return map;
}

/** 雷达页需要的精简政策数据（静态部署时只加载这一份，不必拉 32 份全文） */
export interface RadarPolicyBundle {
  id: string;
  title: string;
  category: PolicyCategory;
  level: PolicyLevel;
  year: number;
  fields: ProfileField[];
  conditions: ConditionGroup[];
  materials: Policy['materials'];
}

/**
 * 精简政策包也能扫描。
 *
 * 静态部署时不下载 32 份政策全文，只下发 toRadarBundle() 的精简包；
 * 而 evaluate() 只读 fields 与 conditions 两项，精简包已经完整包含，
 * 所以这里可以安全地按 Policy 使用。
 */
export function scanBundles(bundles: RadarPolicyBundle[], slots: Record<string, unknown>): RadarResult {
  return scanPolicies(
    bundles.map((bundle) => toScannablePolicy(bundle)),
    slots,
  );
}

/**
 * 把精简包补成 evaluate() 能安全消费的 Policy。
 *
 * evaluate() 除了 fields / conditions，还会遍历 deadlines 生成「接下来做什么」，
 * 精简包为了省体积没带这些展示用字段，这里补空数组，避免运行时报 not iterable。
 */
function toScannablePolicy(bundle: RadarPolicyBundle): Policy {
  return {
    ...bundle,
    issuer: '',
    sourceUrl: undefined,
    originalText: '',
    sections: [],
    deadlines: [],
    notes: [],
    extraction: { engine: 'manual', at: '' },
  } as unknown as Policy;
}

export function toRadarBundle(policy: Policy): RadarPolicyBundle {
  return {
    id: policy.id,
    title: policy.title,
    category: policy.category,
    level: policy.level,
    year: policy.year,
    fields: policy.fields ?? [],
    conditions: policy.conditions ?? [],
    materials: policy.materials ?? [],
  };
}

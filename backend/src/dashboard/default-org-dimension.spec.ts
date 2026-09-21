import { buildJobPositionResolver, JobPositionRecord } from '../org-directory/job-position-directory';
import { defaultOrgDimension, OrgDimension } from './default-org-dimension';

/**
 * F044 `AC-G42`／`AC-G43`／`AC-G87` — 預設環圖維度之判定（🔴 **後端**純函式）。
 * 語料要求＝F044 §癸 (d) 之七個向量（🔴 全數落在後端 jest，前端 vitest 不承擔任何一個）。
 *
 * 🔴 **本檔對實作全盲**：`./default-org-dimension` 於建環當下尚不存在 ⇒ 預期紅燈為
 *    `Cannot find module './default-org-dimension'`。
 *    `buildJobPositionResolver` 為**既有**符號（`org-directory/job-position-directory.ts`），
 *    刻意以真貨驅動 ⇒ 「禁跨公司 fallback」不是靠一個替身假裝出來的。
 *
 * 契約（architecture-spec §15.3 逐字）：
 *   `export type OrgDimension = 'company' | 'division' | 'department';`
 *   `export function defaultOrgDimension(jobPositionName: string | null): OrgDimension;`
 */

/**
 * 🔴 **實查之歧義代碼**（F044 §已查證之既有事實 #7、`upstream-hr-source-contract.md` §5.4.2）：
 * `B01` 於 AS／AE ＝ `本部長`、於 **AD ＝ `本處長`**；`C04` 於 AS／AE ＝ `處長`、於 AD ＝ `部長`。
 * 🔴 **語料必須含兩家以上公司**——只有一家時 §癸 (d) 之 ①②④ 三個向量全部恆真。
 */
const JOB_POSITIONS: readonly JobPositionRecord[] = [
  { companyCode: 'AS', code: 'A01', name: '董事長' },
  { companyCode: 'AS', code: 'A02', name: '總經理' },
  { companyCode: 'AS', code: 'B01', name: '本部長' },
  { companyCode: 'AS', code: 'B03', name: '部長' },
  { companyCode: 'AS', code: 'C04', name: '處長' },
  // 🔴 只存在於 AS，AD 無此碼 ⇒ §癸 (d) ④ 之跨公司 fallback 反例。
  { companyCode: 'AS', code: 'D04', name: '營業經理' },
  { companyCode: 'AD', code: 'B01', name: '本處長' },
  { companyCode: 'AD', code: 'B03', name: '處長' },
  { companyCode: 'AD', code: 'C04', name: '部長' },
];

const resolve = buildJobPositionResolver(JOB_POSITIONS);

/** 🔒 型別層鎖：`OrgDimension` 之值域恰三值（`AC-G87` 回傳之 `defaultDimension` 值域）。 */
const ALL_DIMENSIONS: readonly OrgDimension[] = ['company', 'division', 'department'];

describe('defaultOrgDimension — §癸 (d) 七個鑑別向量（AC-G42／AC-G43）', () => {
  /**
   * ① 🔴 **本項最關鍵之向量**：AD 之 `B01` ＝ `本處長` ⇒ `'department'`。
   *    若實作以 `code === 'B01'` 判定（禁以 code 直接比對，`AC-G43`），它會回 `'division'` ⇒ 翻紅。
   *    ② 與 ① 成對：AS 之同一個 `B01` ＝ `本部長` ⇒ `'division'`。兩者共同證明判定走的是
   *    **name** 而非 **code**——只有其中一列時，`code === 'B01' → division` 仍然全綠。
   */
  it('① AD 之 B01（本處長）→ department（禁以 code 比對之關鍵向量）', () => {
    expect(defaultOrgDimension(resolve('AD', 'B01'))).toBe('department');
  });

  it('② AS 之 B01（本部長）→ division（與① 成對）', () => {
    expect(defaultOrgDimension(resolve('AS', 'B01'))).toBe('division');
  });

  it('③ AD 之 C04（部長）與 AS 之 C04（處長）皆 → department', () => {
    expect(resolve('AD', 'C04')).toBe('部長');
    expect(resolve('AS', 'C04')).toBe('處長');
    expect(defaultOrgDimension(resolve('AD', 'C04'))).toBe('department');
    expect(defaultOrgDimension(resolve('AS', 'C04'))).toBe('department');
  });

  /**
   * ④ 🔴 跨公司 fallback 之反例：`D04` 只存在於 AS。以 AD 之 companyCode 查 ⇒ **必須** `null`。
   *    若實作允許 fallback，它會拿到 AS 的 `營業經理`——本案之斷言會在 `toBeNull()` 就翻紅。
   *    ⚠ 本案同時是「`AC-G43` 之解析必須走 `buildJobPositionResolver`」的載體：換成任何
   *    一個會 fallback 的自製解析器，第一句即紅。
   */
  it('④ 跨公司 fallback 反例：AD 查 AS 專有之 D04 → null → department', () => {
    expect(resolve('AD', 'D04')).toBeNull();
    expect(defaultOrgDimension(resolve('AD', 'D04'))).toBe('department');
  });

  it('⑤ jobPositionCode 為 null 之帳號 → department', () => {
    expect(resolve('AS', null)).toBeNull();
    expect(defaultOrgDimension(null)).toBe('department');
  });

  /**
   * ⑥⑦ ⚠ **人工 fixture，真實語料中沒有載體**：`副本部長`／`副總經理` 皆不存在於上游已記錄之
   * `VW_JOB_FUN` 名稱清單（正式環境四家共 75 列），全 repo grep `副本部` 零命中。
   * 🔴 **不得宣稱此二列在實機上被驗過**（architecture-spec §15.10 #8：永遠無法覆核）。
   */
  it('⑥ 人工 fixture：副本部長 → division（白名單逐字保留之前瞻條目）', () => {
    expect(defaultOrgDimension('副本部長')).toBe('division');
  });

  it('⑦ 人工 fixture：副總經理 → department（驗完整字串相等，非 includes）', () => {
    // 🔴 `includes('總經理')` 之下本列會被誤判為 'company' ⇒ 這是「禁 includes」唯一的鑑別力來源。
    expect(defaultOrgDimension('副總經理')).toBe('department');
  });
});

describe('defaultOrgDimension — 逐字白名單與比對方式（AC-G42）', () => {
  it('董事長／總經理 → company', () => {
    expect(defaultOrgDimension('董事長')).toBe('company');
    expect(defaultOrgDimension('總經理')).toBe('company');
  });

  it('本部長 → division', () => {
    expect(defaultOrgDimension('本部長')).toBe('division');
  });

  it('輸出恆落在 OrgDimension 之三值內（值域封閉）', () => {
    for (const name of ['董事長', '總經理', '本部長', '副本部長', '部長', '', null]) {
      expect(ALL_DIMENSIONS).toContain(defaultOrgDimension(name));
    }
  });

  it.each(['', '部長', '處長', '本處長', '室長', '科長', '專員'])(
    '其餘一切（%s）→ department',
    (name) => {
      expect(defaultOrgDimension(name)).toBe('department');
    },
  );

  it('trim 後完整字串相等：前後空白不影響命中', () => {
    expect(defaultOrgDimension('  董事長  ')).toBe('company');
    expect(defaultOrgDimension('\t本部長\n')).toBe('division');
  });

  /**
   * 🔴 負向鎖定（`AC-G42`「禁 includes／startsWith／正則部分比對」之直接載體）：
   * 包含白名單字樣但**不等於**它者，一律 department。
   * §癸 自證：把比對改成 `name.includes('本部長')`，本案第 2 列（`副本部長助理`）翻紅；
   * 改成 `startsWith('總經理')`，第 4 列（`總經理室`）翻紅。
   */
  it.each(['董事長特助', '副本部長助理', '代理總經理', '總經理室', '本部長秘書'])(
    '含白名單字樣但非完整相等（%s）→ department',
    (name) => {
      expect(defaultOrgDimension(name)).toBe('department');
    },
  );
});

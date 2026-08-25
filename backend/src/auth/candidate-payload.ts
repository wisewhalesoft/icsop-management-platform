import { CandidateAccount } from './multi-account-picker';

/**
 * F001 帳號選擇 delta — 選擇畫面候選查詢端點之 payload 投影（`AC-M12`／`AC-M14`／`AC-M15`）。
 * 純函式，接受注入之顯示名稱解析器，不自行連 DB。
 */

export interface CandidateDisplayRow {
  accountId: string;
  companyCode: string;
  companyName: string;
  orgCode: string | null;
  orgName: string;
  roleCode: string;
  roleName: string;
  loginId: string;
}

export interface DisplayResolvers {
  companyName(companyCode: string | null | undefined): string | null;
  orgName(orgCode: string | null | undefined): Promise<string | null>;
  roleName(roleCode: string | null | undefined): string;
}

/** 缺值顯示規則（`AC-M14`）：空/缺漏 → em dash；有值但無對照 → 顯示原值；有對照 → 顯示解析結果。 */
function displayOrDash(raw: string | null | undefined, resolved: string | null): string {
  if (raw == null || raw.trim() === '') return '—';
  return resolved ?? raw;
}

export async function buildCandidatePayload(
  email: string,
  name: string,
  candidates: readonly CandidateAccount[],
  resolvers: DisplayResolvers,
): Promise<{ email: string; name: string; candidates: CandidateDisplayRow[] }> {
  const rows = await Promise.all(
    candidates.map(async (c): Promise<CandidateDisplayRow> => {
      const orgResolved = await resolvers.orgName(c.orgCode);
      return {
        accountId: c.accountId,
        companyCode: c.companyCode,
        companyName: displayOrDash(c.companyCode, resolvers.companyName(c.companyCode)),
        orgCode: c.orgCode ?? null,
        orgName: displayOrDash(c.orgCode, orgResolved),
        roleCode: c.roleCode ?? '',
        roleName: resolvers.roleName(c.roleCode),
        loginId: c.loginId,
      };
    }),
  );
  return { email, name, candidates: rows };
}

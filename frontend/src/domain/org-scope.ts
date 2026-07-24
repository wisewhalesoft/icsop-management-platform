/**
 * 前台「使用部門」是否命中使用者組織路徑之判定（純邏輯，無 IO）。
 *
 * 版面權威：prototypes/03-public-list.html 卡片使用部門高亮（in-scope 段以 primary-700 呈現）。
 * 語意權威：與後端「置頂＝祖先鏈」一致（見 icsop-public-browsing-features）——文件之任一使用部門
 * 若為使用者部門之祖先或自身（＝使用者部門落於該使用部門子樹），即屬 in-scope。
 *
 * 5 碼前綴階層：組織代碼以左至右前綴編碼層級（本部 1 碼、部 2 碼、處/室 3、課 4、Root 00000）。
 * 去除尾綴 0 得「代碼前綴」；B 為 A 之後代 ⇔ B 前綴以 A 前綴為開頭。Root（00000→前綴 ''）為所有人祖先。
 */

/** 去除尾綴 0 得代碼前綴（Root `00000` → `''`）。 */
export function codePrefixOf(orgCode: string): string {
  return orgCode.replace(/0+$/, '');
}

/**
 * scopeCode 是否為 userOrgCode 之祖先或自身（＝userOrgCode 落於 scopeCode 子樹）。
 * 任一為空 → false（無從判定，保守不高亮）。
 */
export function isAncestorOrSelf(
  scopeCode: string | null | undefined,
  userOrgCode: string | null | undefined,
): boolean {
  if (!scopeCode || !userOrgCode) return false;
  return codePrefixOf(userOrgCode).startsWith(codePrefixOf(scopeCode));
}

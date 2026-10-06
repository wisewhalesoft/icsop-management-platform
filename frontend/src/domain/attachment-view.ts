/**
 * 🔵 2026-10-06 附件線上檢視（後台 F016 `AC-AV1`／前台 F018・F039 `AC-FV2`）：前後台共用之判定與逐字文案。
 * 🔴 前後台各寫一份即為分歧之起點（本 repo 文案稽核已兩度抓到漏改頁）。
 * 🔒 可檢視＝`format === 'pdf'`（與後端 `storage/viewable-format.ts` 同一白名單）；xlsx／xls 只能下載。
 */
export const ATTACH_VIEW_BTN_TEXT = '檢視';
export const ATTACH_VIEW_FAILED_TEXT = '檢視失敗，請稍後再試。';
export const attachViewAria = (name: string): string => `檢視「${name}」`;
export const isViewableAttachment = (format: string): boolean => format.toLowerCase() === 'pdf';

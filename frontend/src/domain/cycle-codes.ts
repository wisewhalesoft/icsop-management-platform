/**
 * ICSOP 文件編號第 2 段＝循環代碼（權威來源：prototypes/14-document-create.html 之 CYCLE_CODE；
 * 對應九大標準循環）。後端 LIFECYCLE 目前未存代碼欄，故建立頁依循環「名稱」查表帶入編號前綴。
 * 名稱不在表中者（自訂循環）→ 無代碼，前綴顯示占位、編號需自行輸入完整段。
 */
export const CYCLE_CODE: Record<string, string> = {
  銷售及收款循環: 'SRC',
  採購及付款循環: 'PUC',
  產品企劃循環: 'PPC',
  薪工循環: 'LWC',
  融資循環: 'FC',
  '不動產、廠房及設備循環': 'FAC',
  投資循環: 'IC',
  電腦化資訊系統控制作業: 'CIPS',
  管理性控制作業: 'GCA',
};

/** 依循環名稱取代碼（查無回空字串）。 */
export function cycleCodeOf(name: string | undefined | null): string {
  return (name && CYCLE_CODE[name]) || '';
}

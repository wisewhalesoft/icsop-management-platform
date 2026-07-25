# e2e — Prototype-Fidelity Acceptance Ring (Playwright)

Uncle-Bob 約束 #1（acceptance tests）之落地。這些測試由 `/prototypes/*.html` **機械衍生**、對
implementation **全盲**（只斷言 prototype 所定義之欄位/卡片/文案/狀態），並對**執行中的整合環境**
（docker 前端 :5173 → nginx → 後端）跑——故亦能揪出 deploy/proxy 類 bug（如本 session 的 nginx 代理、
viewer iframe），這些是 unit（mock fetch）與 int（直打後端）測不到的。

## 為何存在
本 session 的 prototype 漂移（文件清單掉欄、儀表板缺 KPI 卡、doc-index 顯裸 UUID）都能被此 ring 攔下：
若欄位/卡片消失，對應 `fidelity-*.spec.ts` 立即紅燈——不必等到六個 feature 後才人工 audit 揪出。

## 執行（需 ICSOPAdmin 測試帳號）
憑證一律走 env（勿硬編）。需一組可用途徑 B 帳密登入之 **ICSOPAdmin** 測試帳號：

```bash
cd e2e
npm install
npx playwright install chromium          # 首次：下載瀏覽器

export E2E_BASE_URL=http://localhost:5173  # docker 前端埠
export E2E_COMPANY=AS
export E2E_LOGIN_ID=<icsop-admin 測試帳號>
export E2E_PASSWORD=<其密碼>

npm run test:e2e         # 跑 ring（需 app 執行中）
npm run test:e2e:list    # 只列出測試（不需登入/不需 app），驗證檔案可解析
```

`global-setup.ts` 以 `POST /auth/login` 登入一次、存 `storage/icsop-admin.json`，所有測試重用該
storageState。`storage/` 已 gitignore（不進版控）。

## 目前涵蓋（首批，刻意精選「已完全對齊、無延後項」之頁）
| 檔案 | 守門的漂移 | 權威 prototype |
|---|---|---|
| `fidelity-document-list.spec.ts` | 文件清單 11 欄完整 | 13-document-list |
| `fidelity-dashboard-kpi.spec.ts` | 儀表板 ICSOPAdmin 4 張 KPI 卡＋角色過濾 | 07-admin-shell |
| `fidelity-doc-index.spec.ts` | doc-index 顯示文件編號非裸 UUID | 21-document-index-management |

## 待擴充
- SysAdmin storageState fixture（驗「停用帳號待覆核」等 SysAdmin 專屬卡、權限矩陣頁 18）。
- 帳號管理欄位（含已裁定之延後項：職位／最後活動→最後登入，須以「裁定後的預期集合」而非裸 prototype 斷言）。
- 前台流程（清單/詳情/檢視器）需已公告 seed 文件。

> 原則：測試斷言的是**裁定後的預期 UI**（prototype ＋ 已記錄之 deviation，見
> `docs/specs/prototype-alignment/`），不是裸 prototype；且永遠由 prototype+spec 衍生，不讀實作碼。

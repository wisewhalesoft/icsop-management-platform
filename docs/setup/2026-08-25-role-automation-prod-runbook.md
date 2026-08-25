# 正式站部署 Runbook — 角色自動化（2026-08-25）

對象：**正式站 `icsop.hfcfinance.com.tw`（DTGHFC01/ 172.20.203.31）**
compose 專案名固定為 `icsop`（`docker-compose.yml` 之 `name:`），指令一律於 repo 根目錄執行。

> ⚠ 本文之指令為 Linux 遠端主機。**不需要** `MSYS_NO_PATHCONV=1`（那是本機 Windows Git Bash 才需要的）。

---

## 0. 這次部署包含什麼

| 項目 | 影響 |
|---|---|
| 3 支 migration | `AUDIT_LOG.targetAccountId`、`ACCOUNT.roleSource`、`ROLE_DOWNGRADE_PENDING` 去重索引 |
| 角色變更稽核 | `PATCH /admin/accounts/:id/role` 起寫 `AUDIT_LOG`（此前完全無紀錄） |
| **F025 權限矩陣兩列變更** | **ICSOP 管理員對「帳號管理」由唯讀升為 CRUD、對「角色指派」為受限CRUD**（不得指派 SysAdmin／ICSOPAdmin） |
| 角色推導引擎 | 隨每日 02:00 同步執行；首次需一次性放寬閾值 |

🔴 **第三項是使用者可見的權限變更**，上線前請確認 ICSOP 管理員知悉自己多了帳號管理權。

---

## 1. 🔴 順序很重要：先跑 migration，再換容器

**不要**先 `up -d --build` 再補 migration。新 image 的 entity 已宣告 `ACCOUNT.roleSource`，
DB 若還沒有該欄，**任何查 ACCOUNT 的請求（含登入）都會回 500**——我們在 dev 已實際踩過。

三支 migration 皆為 additive（加欄／加索引），**舊版程式碼對新欄位無感**，
故「先 migration、後換容器」完全安全，且沒有服務中斷空窗。

```bash
cd ~/icsop-management-platform     # 依實際路徑調整

# ① 取得新版程式碼
git pull origin main
git log --oneline -1               # 應為 merge: 2026-08-25 角色自動化

# ② 只 build image，不動現有容器（服務持續運行）
docker compose build backend frontend

# ③ 先確認有哪些 migration 待跑（唯讀，不會改任何東西）
docker compose run --rm --no-deps backend \
  npx typeorm -d dist/database/data-source.js migration:show
```

預期看到最後三行為 `[ ]`（待跑）：

```
[ ] AuditTargetAccount1724457600000
[ ] AccountRoleSource1724544000000
[ ] AlertRoleDowngrade1724630400000
```

```bash
# ④ 跑 migration（用新 image 的一次性容器，現有服務不受影響）
docker compose run --rm --no-deps backend npm run migration:run:prod

# ⑤ 複驗：三支應全部變成 [X]
docker compose run --rm --no-deps backend \
  npx typeorm -d dist/database/data-source.js migration:show | tail -5
```

`AccountRoleSource` 這支會順帶執行一段回填：
`UPDATE ACCOUNT SET roleSource='manual' WHERE source='manual'`
——手動建立之帳號其角色本就是人工指派的，標 `manual` 使推導不覆寫（`OQ-RA-05`）。

```bash
# ⑥ 換容器（🔴 --force-recreate 不可省：--build 只換 image 不換容器）
docker compose up -d --build --force-recreate --remove-orphans

# ⑦ 確認三容器 healthy
docker compose ps
```

### 驗證 app 正常

```bash
# 登入端點：應回 401（帳號不存在），不是 500
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://icsop.hfcfinance.com.tw/auth/login \
  -H "Content-Type: application/json" -d '{"loginId":"zzprobe","password":"x"}'
```

**回 500 代表 migration 沒跑成功**，去看 `docker compose logs backend | grep -i "Invalid column"`。

---

## 2. 手動觸發角色推導

### 2-1. 先跑一次「不帶覆寫」— 這是免費的 dry-run

閾值會擋下來，但推導計畫**已經算完**並把確切數字報出來。**先看數字再決定要不要套用。**

```bash
docker compose exec backend npm run sync:once:prod 2>&1 | \
  grep -E "COMPID=|status=|角色推導變更量|角色降級|DISAPPEARED"
```

判讀：

| 輸出 | 意思 |
|---|---|
| `角色推導變更量 N/M 超過閾值 5.0%，整批未套用` | 正常，這就是 dry-run 結果。記下 N/M |
| 該公司**沒有**此警告，且同步 `success` | 變更數 ≤10（絕對下限）**已直接套用** |
| `status=failed errorCode=DISAPPEARED_RATIO_EXCEEDED` | 🔴 該公司卡在**消失閾值**，推導根本跑不到，見 §3 |

> 📌 dev 實測參考：AD 124/163、AJ 91/131、AE 已直接套用（5 筆）、**AS 卡在消失閾值**。

### 2-2. 逐家套用（**不要一次四家**）

放寬值要大於該公司的實際比例。dev 用 `0.9` 涵蓋 76%／69%。

```bash
# AD
docker compose exec \
  -e SYNC_ONLY_COMPID=AD -e SYNC_ROLE_CHANGE_THRESHOLD=0.9 \
  backend npm run sync:once:prod 2>&1 | \
  grep -E "角色變更閾值|COMPID=|status=|角色推導|角色降級"

# AJ
docker compose exec \
  -e SYNC_ONLY_COMPID=AJ -e SYNC_ROLE_CHANGE_THRESHOLD=0.9 \
  backend npm run sync:once:prod 2>&1 | \
  grep -E "角色變更閾值|COMPID=|status=|角色推導|角色降級"

# AE（若 dry-run 已自動套用則可略過）
docker compose exec \
  -e SYNC_ONLY_COMPID=AE -e SYNC_ROLE_CHANGE_THRESHOLD=0.9 \
  backend npm run sync:once:prod

# AS（僅在 §3 之消失閾值問題解決後才跑）
docker compose exec \
  -e SYNC_ONLY_COMPID=AS -e SYNC_ROLE_CHANGE_THRESHOLD=0.9 \
  backend npm run sync:once:prod
```

**成功的判準**：出現 `⚠ 角色變更閾值已被 SYNC_ROLE_CHANGE_THRESHOLD 覆寫為 90.0%`
且**不再**出現「超過閾值…整批未套用」。

🔒 **覆寫變數用 `docker compose exec -e` 傳，不要寫進 `.env`。**
這樣它只存在於該次執行，不會留下常設旁路。跑完後可確認：

```bash
docker compose exec backend sh -c 'echo "${SYNC_ROLE_CHANGE_THRESHOLD:-未設}"'   # 應為「未設」
grep -c SYNC_ROLE_CHANGE_THRESHOLD .env                                          # 應為 0
```

### 2-3. 驗證推導結果

```bash
docker compose exec backend node -e "
const {AppDataSource}=require('./dist/database/data-source.js');
(async()=>{await AppDataSource.initialize();
const s=await AppDataSource.query(\"SELECT companyCode c, SUM(CASE WHEN roleCode='Supervisor' THEN 1 ELSE 0 END) sup, SUM(CASE WHEN userSubtype='business' THEN 1 ELSE 0 END) biz, COUNT(*) tot FROM ACCOUNT WHERE source='upstream' AND status='active' GROUP BY companyCode\");
console.log('公司  主管  業務  總數  業務佔比');
s.forEach(x=>console.log('  '+x.c+'   '+String(x.sup).padStart(3)+'  '+String(x.biz).padStart(4)+'  '+String(x.tot).padStart(4)+'   '+(100*x.biz/x.tot).toFixed(1)+'%'));
const a=await AppDataSource.query(\"SELECT alertKind k, COUNT(*) n FROM ORG_CHANGE_ALERT WHERE status='pending' GROUP BY alertKind\");
console.log('pending 告警:'); a.forEach(x=>console.log('  '+x.k+' = '+x.n));
await AppDataSource.destroy();})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
"
```

**合理性檢查**（2026-08-25 上游實查之業務佔比）：AD ≈ 56.5%、AJ ≈ 58.2%、AS ≈ 49.9%、AE ≈ 12.5%。
實際值會略低（母體為 active 帳號、非在職者），但**若某家出現 0% 或 90%+，停下來查**。

若出現 `ROLE_DOWNGRADE_PENDING` 告警，代表有人已不在部門主管名單中。
**角色不會被自動降級**（裁定 Q1.3），需由管理員於「組織人員異動管理」逐筆確認後手動調整。

---

## 3. 🔴 若 AS 卡在消失閾值

dev 上 AS 是 `DISAPPEARED_RATIO_EXCEEDED`（74 人 / 6.6%）。**正式站請先自行確認是否也如此。**

**不要**用 `SYNC_DISAPPEARED_THRESHOLD` 硬推過去——那會**停用**那些帳號。
先查明他們的性質：

```bash
docker compose exec backend node -e "
const {loadUpstreamConfig}=require('./dist/org-sync/org-sync.config.js');
const {AppDataSource}=require('./dist/database/data-source.js');
const sql=require('mssql');
(async()=>{
  const cfg=loadUpstreamConfig(); const L=cfg.ref.linkedServer, D=cfg.ref.remoteDb;
  const pool=await new sql.ConnectionPool({server:cfg.host,port:cfg.port,user:cfg.user,password:cfg.password,database:cfg.database,options:{trustServerCertificate:cfg.trustServerCertificate,encrypt:true},connectionTimeout:30000,requestTimeout:120000}).connect();
  const q=async(s)=>(await pool.request().query(s)).recordset;
  await AppDataSource.initialize();
  const loc=await AppDataSource.query(\"SELECT loginId FROM ACCOUNT WHERE companyCode='AS' AND source='upstream' AND status='active'\");
  const act=new Set((await q(\`SELECT NO FROM OPENQUERY([\${L}],'SELECT NO FROM [\${D}].[dbo].[VW_PERSONNEL_SQL] WHERE COMPID=''AS'' AND RESIGN_DATE >= CAST(GETDATE() AS DATE)') s\`)).map(r=>String(r.NO).trim()));
  const miss=loc.map(r=>String(r.loginId).trim()).filter(x=>!act.has(x));
  console.log('本地在職但上游不在職：'+miss.length+' 人');
  const inq=miss.map(m=>\"''\"+m+\"''\").join(',');
  const any=await q(\`SELECT COMPID, NO FROM OPENQUERY([\${L}],'SELECT COMPID, NO FROM [\${D}].[dbo].[VW_PERSONNEL_SQL] WHERE NO IN (\${inq})') s\`);
  const byC={}; any.forEach(r=>{const k=String(r.COMPID).trim(); byC[k]=(byC[k]||0)+1;});
  console.log('其中在上游其他公司找得到（＝轉調，非離職）：'+any.length+' 人');
  Object.keys(byC).sort().forEach(k=>console.log('   COMPID='+k+' : '+byC[k]));
  console.log('完全查無（性質待確認，**絕不可逕行停用**）：'+(miss.length-any.length)+' 人');
  await AppDataSource.destroy(); await pool.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
"
```

**判讀與處置**：

| 類別 | 意義 | 處置 |
|---|---|---|
| 在其他 COMPID 找得到、未離職 | 轉調他公司 | 本公司舊帳號應停用（正常人事異動） |
| 完全查無 | ⚠ 性質不明 | **先通報上游人資確認**。可能是舊來源 `VW_HPMUSER` 污染殘留（契約 §3.7），也可能是上游漏資料——後者若逕行停用即為大規模誤停用 |

> 📌 **AS 卡住不影響其他三家。**推導掛在同步成功路徑之後，任何前置階段中止都會連帶讓推導失效。
> 這是已知的結構耦合，記於 delta 文件。

---

## 4. 回退

三支 migration 皆有 `down()`：

```bash
# 一次退一支，共三次
docker compose run --rm --no-deps backend \
  npx typeorm -d dist/database/data-source.js migration:revert
```

⚠ `AccountRoleSource` 的 `down()` 會 **DROP COLUMN**，`roleSource` 的值全部消失。
但該值可由 `source` 欄重建（`source='manual'` ⇒ `roleSource='manual'`），無實質資料損失。

⚠ 已被推導改寫的 `roleCode`／`userSubtype` **不會**隨 revert 還原。
若需回復，只能靠部署前的 DB 備份。**跑推導前請先確認有備份。**

---

## 5. 部署後檢查清單

- [ ] `migration:show` 三支皆 `[X]`
- [ ] 三容器 `healthy`
- [ ] 登入端點回 401（非 500）
- [ ] 實際登入一次（含 Azure AD SSO 完整流程）
- [ ] 各公司業務佔比落在合理範圍
- [ ] `SYNC_ROLE_CHANGE_THRESHOLD` 未殘留於 `.env` 或容器環境
- [ ] ICSOP 管理員已知悉其帳號管理權限變更（F025）
- [ ] 隔日確認 02:00 排程同步正常（此後推導自動維持）

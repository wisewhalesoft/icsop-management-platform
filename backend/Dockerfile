# === build stage ===
FROM node:22-alpine AS build
WORKDIR /app
# 🔵 公司 TLS 攔截之根 CA（可選；見 infra/certs/README.md）。
# 端點防毒／網管設備對 HTTPS 做 SSL inspection 時，容器內 npm 會以
# SELF_SIGNED_CERT_IN_CHAIN 全數失敗，而 npm 只印出誤導性的
# 「Exit handler never called!」——真正的錯誤只在 /root/.npm/_logs/*-debug-0.log 裡。
#
# 🔴 **信任範圍刻意收窄到「只有 build 時的 npm registry 連線」**：本段設定的是
#    `npm_config_cafile`（npm 自己的 CA 檔），**不是** Node 行程層的額外信任錨點。
#    ⚠ 後者會留在**執行中的容器**裡，使本服務對 Azure Blob／AAD／MSSQL 之**全部對外 TLS**
#    都信任該 MITM CA——那是真的削弱，且 F001 `AC-E8` 明文禁止**行程層的額外信任錨點**
#    （該環境變數之字面即列於 `AC-E8` 之禁用清單，故此處刻意不複述；完整說明見
#    infra/certs/README.md「為什麼不用行程層環境變數」）。🔒 **不得改回行程層環境變數。**
# ⚠ 無憑證時 bundle 為空檔 ⇒ `-s` 判定為偽 ⇒ 完全不設定，不影響無需此設定的機器。
COPY --from=corpcerts / /tmp/corpcerts/
RUN cat /tmp/corpcerts/*.crt > /tmp/corp-ca-bundle.pem 2>/dev/null || :
COPY package*.json ./
RUN CAFILE=/tmp/corp-ca-bundle.pem; \
    [ -s "$CAFILE" ] && export npm_config_cafile="$CAFILE"; \
    npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# === runtime stage ===
FROM node:22-alpine AS runtime
WORKDIR /app
# 🔵 公司 TLS 攔截之根 CA（可選）——本 stage 亦有 `npm ci --omit=dev`，同樣需要。
#    🔴 理由與**不得改回行程層環境變數**之禁令同 build stage（見上方；勿只改一處）。
#    🔒 本 stage 尤其關鍵：它就是**執行中的容器**——行程層信任錨點一旦留在這裡，
#       本服務對外的每一條 TLS 連線都會信任該 MITM CA。
COPY --from=corpcerts / /tmp/corpcerts/
RUN cat /tmp/corpcerts/*.crt > /tmp/corp-ca-bundle.pem 2>/dev/null || :
ENV NODE_ENV=production
# ⚠ Bug 2（時區語意）：行程時區釘死為 UTC，與 data-source.ts 之 `useUTC: true` 為一組、缺一不可。
# MSSQL 之 datetime 欄位不帶時區資訊，行程時區一旦浮動，寫入/讀取兩端就可能各自解讀成不同瞬間。
# 本 ENV 亦涵蓋以同一 image 執行的一次性 init 服務（migration／seed-*／org-sync）——其中 org-sync
# 會寫入 SYNC_RUN.watermark 與 hireDate/resignDate，屬「影響資料正確性而非顯示」之路徑。
# ⚠ 勿於 .env 設定 TZ：env_file 之值會蓋過本 ENV（compose 已對各服務顯式再釘一次以防萬一）。
ENV TZ=UTC
COPY package*.json ./
# ⚠ `npm cache clean` 與安裝同屬一個 RUN：cafile 只在本行的 shell 內生效，不寫進 image。
RUN CAFILE=/tmp/corp-ca-bundle.pem; \
    [ -s "$CAFILE" ] && export npm_config_cafile="$CAFILE"; \
    npm ci --omit=dev && npm cache clean --force
# ⚠ 缺失 #6（architecture-spec §10.10 A10）：CJK 浮水印字型必須進 image，否則
# loadCjkFontBytes() 回 null → 退化 Helvetica + asciiSafe → 浮水印之中文全變 `?`。
# 置於 COPY --from=build 之前：assets 幾乎不變、dist 每次都變，不變的放前面才有 layer 快取效益。
# 不加到 build stage：build 只跑 tsc，字型不參與編譯，且 `COPY --from=build` 只帶 dist。
COPY assets ./assets
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]

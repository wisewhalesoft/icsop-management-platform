/**
 * 依賴結構 metric gate（Uncle Bob 約束 #4 之一：dependency structure）。
 * 主規則 no-circular 守護本專案「反循環 DI」模式（以 useFactory 自建 store、不互 import 模組）。
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: '禁止模組循環相依 — 守護反循環 DI 模式；發現即 error（gate 失敗）。',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // 僅計 runtime import（type-only 循環於編譯期抹除、不造成 DI/初始化循環）；對齊本專案「反循環」關切。
    tsPreCompilationDeps: false,
    exclude: { path: '\\.(spec|itest)\\.ts$' },
  },
};

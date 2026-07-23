import {
  cleanText,
  extract,
  normalizeChapterSection,
  rejoinCells,
} from './template-aware-extractor';
import { runExtractStage } from './extract-stage';
import { FakeIndexRunStore } from './index-run';
import {
  MergedOrPlainCell,
  ParsedXlsWorkbook,
  RawSectionBlock,
} from './extraction.types';

/**
 * F028 .xls 模板感知內文抽取與清洗 · 單元測試（TS-F028-001～023）。
 * 輸入一律為 ParsedXlsWorkbook fixture（非真實 .xls 位元組；真實二進位解析＝[integration] TS-024/025）。
 */

const HEADER = {
  documentNumber: 'ICSOP-SRC-101-1',
  edition: "26'01",
  draftingDept: '營運管理部',
  pageOf: '第1頁 共5頁',
  draftedDate: '2026-01-01',
};

const cell = (
  value: string | null,
  isMergeAnchor = false,
  mergeSpan = 1,
): MergedOrPlainCell => ({ value, isMergeAnchor, mergeSpan });

const plainCells = (text: string): MergedOrPlainCell[] => [cell(text)];

function rawSection(over: Partial<RawSectionBlock> = {}): RawSectionBlock {
  return {
    chapterNo: '第1章',
    sectionNo: '第1節',
    executor: '審查人員',
    timeLimit: '1 個工作天',
    contentCells: plainCells('確認申請單完整性。'),
    pageNumber: 1,
    ...over,
  };
}

function workbook(over: {
  sheetNames?: string[];
  hasStandardFlag?: Record<string, boolean>;
  sections?: RawSectionBlock[];
  purpose?: string;
  scope?: string;
  changeLog?: {
    edition: string;
    effectiveDate: string;
    changeItem: string;
    changeSummary: string;
  }[];
  signOff?: { chiefName?: string; deptManagerName?: string };
} = {}): ParsedXlsWorkbook {
  const names = over.sheetNames ?? [
    '封面',
    '目錄&目的',
    '.流程圖',
    '作業流程',
    '變更履歷',
  ];
  const flags =
    over.hasStandardFlag ??
    Object.fromEntries(names.map((n) => [n, true]));
  return {
    sheetNames: names,
    hasStandardFlag: flags,
    sheets: {
      封面: {
        headerBlock: HEADER,
        signOffBlock: {
          chiefName: over.signOff?.chiefName ?? '王處長',
          deptManagerName: over.signOff?.deptManagerName ?? '李經理',
          signatureFields: ['核准', '審核', '製表'],
        },
      },
      '目錄&目的': {
        purpose: over.purpose ?? '規範車輛分期進件之作業標準。',
        scope: over.scope ?? '適用於營運管理部所有進件人員。',
        linkedDocs: [],
        chapterOutline: [],
      },
      '.流程圖': {},
      作業流程: { sections: over.sections ?? [rawSection()] },
      變更履歷: {
        rows: over.changeLog ?? [
          {
            edition: "26'01",
            effectiveDate: '2026-01-01',
            changeItem: '1',
            changeSummary: '初版制定。',
          },
        ],
      },
    },
  };
}

describe('F028 標準五表抽取（AC1）', () => {
  it('TS-F028-001 抽出目的／適用範圍（不遺漏、不截斷）', () => {
    const r = extract('DOC-1', workbook());
    expect(r.status).toBe('success');
    expect(r.documentId).toBe('DOC-1');
    expect(r.purpose).toContain('規範車輛分期進件之作業標準');
    expect(r.scope).toContain('適用於營運管理部所有進件人員');
  });

  it('TS-F028-002 依章/節抽出 3 節作業流程，欄位逐一對應', () => {
    const sections = [
      rawSection({
        chapterNo: '第1章',
        sectionNo: '第1節',
        executor: '甲',
        timeLimit: 'T1',
        contentCells: plainCells('步驟一。'),
      }),
      rawSection({
        chapterNo: '第1章',
        sectionNo: '第2節',
        executor: '乙',
        timeLimit: 'T2',
        contentCells: plainCells('步驟二。'),
      }),
      rawSection({
        chapterNo: '第2章',
        sectionNo: '第1節',
        executor: '丙',
        timeLimit: 'T3',
        contentCells: plainCells('步驟三。'),
      }),
    ];
    const r = extract('DOC-1', workbook({ sections }));
    expect(r.sections).toHaveLength(3);
    expect(r.sections[0]).toMatchObject({
      chapterSection: '第1章第1節',
      executor: '甲',
      timeLimit: 'T1',
      content: '步驟一。',
    });
    expect(r.sections[2].chapterSection).toBe('第2章第1節');
    expect(r.sections[2].content).toBe('步驟三。');
  });

  it('TS-F028-003 抽出變更履歷內容', () => {
    const r = extract(
      'DOC-1',
      workbook({
        changeLog: [
          { edition: "26'01", effectiveDate: '2026-01-01', changeItem: '1', changeSummary: '初版制定。' },
          { edition: "26'02", effectiveDate: '2026-03-01', changeItem: '2', changeSummary: '新增自檢章節。' },
        ],
      }),
    );
    expect(r.changeLog).toHaveLength(2);
    expect(r.changeLog.join('\n')).toContain('新增自檢章節');
  });

  it('TS-F028-004 章層級無節細分（sectionNo=null）→ 僅章號', () => {
    const r = extract(
      'DOC-1',
      workbook({
        sections: [
          rawSection({ chapterNo: '第3章', sectionNo: null, contentCells: plainCells('定期自檢及異常管理。') }),
        ],
      }),
    );
    expect(r.status).toBe('success');
    expect(r.sections[0].chapterSection).toBe('第3章');
    expect(r.sections[0].chapterSection).not.toContain('null');
  });
});

describe('F028 清洗（AC2）', () => {
  it('TS-F028-005 移除重複頁首字樣（任一內容皆不殘留）', () => {
    // 於作業內容與目的中夾雜重複頁首列。
    const noisyCells: MergedOrPlainCell[] = [
      cell('ICSOP-SRC-101-1'), // 頁首文件編號重複列
      cell('第1頁 共5頁'),
      cell('企業內部文件－僅供內部使用'),
      cell('確認申請單完整性。'),
    ];
    const r = extract(
      'DOC-1',
      workbook({
        sections: [rawSection({ contentCells: noisyCells })],
        purpose: '企業內部文件－僅供內部使用\n規範進件標準。',
      }),
    );
    const all = [r.purpose, r.scope, ...r.sections.map((s) => s.content)].join('\n');
    expect(all).toContain('確認申請單完整性');
    expect(all).not.toContain('ICSOP-SRC-101-1');
    expect(all).not.toContain('第1頁 共5頁');
    expect(all).not.toContain('企業內部文件');
  });

  it('TS-F028-006 移除簽核區人員姓名', () => {
    const r = extract(
      'DOC-1',
      workbook({
        signOff: { chiefName: '王大處長', deptManagerName: '李副理' },
        sections: [rawSection({ contentCells: plainCells('簽核：王大處長 核准。') })],
      }),
    );
    const all = [r.purpose, r.scope, ...r.sections.map((s) => s.content)].join('\n');
    expect(all).not.toContain('王大處長');
    expect(all).not.toContain('李副理');
  });

  it('TS-F028-007 版面用途空白合併儲存格 → 不產生空白段落', () => {
    const cells: MergedOrPlainCell[] = [
      cell('實際內容一。', true, 2),
      cell(null, false, 2),
      cell(null), // 純版面空白
      cell('   '), // 空白字元
      cell('實際內容二。'),
    ];
    const r = extract('DOC-1', workbook({ sections: [rawSection({ contentCells: cells })] }));
    const content = r.sections[0].content;
    expect(content).toBe('實際內容一。\n實際內容二。');
    expect(content).not.toMatch(/\n\s*\n/); // 無空白段落
  });

  it('TS-F028-008 流程圖表不進入抽取結果', () => {
    const r = extract('DOC-1', workbook());
    // .流程圖 存在於 sheetNames 但其內容不納入任何 section（本 feature 不讀取該表）。
    expect(r.status).toBe('success');
    expect(r.sections.every((s) => !s.content.includes('流程圖'))).toBe(true);
  });
});

describe('F028 合併儲存格接合（AC3）', () => {
  it('TS-F028-009 跨 2 列合併 → 單一連續段落', () => {
    const cells = [
      cell('執行者應先確認申請單完整性，', true, 2),
      cell(null, false, 2),
    ];
    expect(rejoinCells(cells)).toBe('執行者應先確認申請單完整性，');
  });

  it('TS-F028-010 跨 4 列合併長句完整還原（不漏字/截斷）', () => {
    const long = '執行者應先確認申請單完整性，並核對身分證影本、聯徵報告與收入證明，缺件者退回補正';
    const cells = [
      cell(long, true, 4),
      cell(null, false, 4),
      cell(null, false, 4),
      cell(null, false, 4),
    ];
    expect(rejoinCells(cells)).toBe(long);
  });

  it('TS-F028-011 同節多個獨立合併區塊互不竄接', () => {
    const cells = [
      cell('區塊A尾字。', true, 3),
      cell(null, false, 3),
      cell(null, false, 3),
      cell('中間一般列。'),
      cell('區塊B首字。', true, 2),
      cell(null, false, 2),
    ];
    expect(rejoinCells(cells)).toBe('區塊A尾字。\n中間一般列。\n區塊B首字。');
  });

  it('TS-F028-012 合併內含多子步驟（1./2.）保留原始編號/換行語意', () => {
    const cells = [cell('1. 收件登錄。\n2. 初步審查。', true, 2), cell(null, false, 2)];
    expect(rejoinCells(cells)).toBe('1. 收件登錄。\n2. 初步審查。');
  });

  it('TS-F028-013 全為 mergeSpan=1 → content 等於原始儲存格文字', () => {
    const cells = [cell('一般儲存格文字，未合併。')];
    expect(rejoinCells(cells)).toBe('一般儲存格文字，未合併。');
  });

  it('cleanText 純函式：inline 移除、整列頁首刪除、空列濾除', () => {
    const out = cleanText('ICSOP-SRC-101-1\n企業內部文件－僅供內部使用內文開始\n\n真正內容。', {
      lineNoise: ['ICSOP-SRC-101-1'],
      inlineNoise: ['企業內部文件－僅供內部使用'],
    });
    expect(out).toBe('內文開始\n真正內容。');
  });

  it('normalizeChapterSection：有節接合、無節僅章', () => {
    expect(normalizeChapterSection('第2章', '第3節')).toBe('第2章第3節');
    expect(normalizeChapterSection('第3章', null)).toBe('第3章');
  });
});

describe('F028 附件/流程圖排除（OQ-E09-05）', () => {
  it('TS-F028-014/015 抽取器簽章僅接受 (documentId, workbook)，不接受附件參照', () => {
    // 介面存在性驗證：函式 arity 為 2（documentId, workbook），無第三個附件參數。
    expect(extract.length).toBe(2);
  });
});

describe('F028 非標準模板抽取失敗（AC4 / EXTRACTION_FAILED）', () => {
  it('TS-F028-016 缺「變更履歷」→ failed，具體原因，無 sections', () => {
    const r = extract(
      'DOC-1',
      workbook({
        sheetNames: ['封面', '目錄&目的', '.流程圖', '作業流程'],
        hasStandardFlag: { 封面: true, '目錄&目的': true, '.流程圖': true, 作業流程: true },
      }),
    );
    expect(r.status).toBe('failed');
    expect(r.failureReason).toContain('變更履歷');
    expect(r.sections).toEqual([]);
  });

  it('TS-F028-017 名稱/旗標齊全但作業流程無可辨識章節 → 細粒度失敗', () => {
    const r = extract('DOC-1', workbook({ sections: [] }));
    expect(r.status).toBe('failed');
    expect(r.failureReason).toContain('作業流程');
  });

  it('TS-F028-018 節缺必要標籤欄位（executor 空白）→ 保守整份失敗（OQ-F028-04）', () => {
    const r = extract('DOC-1', workbook({ sections: [rawSection({ executor: '' })] }));
    expect(r.status).toBe('failed');
    expect(r.sections).toEqual([]);
  });

  it('TS-F028-019 抽取失敗不產生殘缺內容（sections 恆為空陣列）', () => {
    const r = extract(
      'DOC-1',
      workbook({ sheetNames: ['封面', '目錄&目的', '.流程圖', '作業流程'] }),
    );
    expect(r.sections).toEqual([]);
    expect(r.purpose).toBe('');
  });
});

describe('F028 INDEX_RUN（stage=extract）', () => {
  it('TS-F028-020 成功 → 標記 stage=extract、status 維持 running、交付 F029', async () => {
    const runStore = new FakeIndexRunStore();
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    const onExtracted = jest.fn().mockResolvedValue(undefined);
    const result = await runExtractStage({
      documentId: 'DOC-1',
      indexRunId: run.id,
      workbook: workbook(),
      runStore,
      onExtracted,
    });
    expect(result.status).toBe('success');
    expect(onExtracted).toHaveBeenCalledTimes(1);
    const after = await runStore.findById(run.id);
    expect(after?.status).toBe('running'); // 非 success（等 F029 embed）
    expect(after?.stage).toBe('extract');
    expect(after?.errorStage).toBeNull();
  });

  it('TS-F028-021 失敗 → status=failed, stage/errorStage=extract, errorMessage；不進入 F029', async () => {
    const runStore = new FakeIndexRunStore();
    const run = await runStore.create({ documentId: 'DOC-1', triggerType: 'xls_update', stage: 'extract' });
    const onExtracted = jest.fn().mockResolvedValue(undefined);
    await runExtractStage({
      documentId: 'DOC-1',
      indexRunId: run.id,
      workbook: workbook({ sheetNames: ['封面', '目錄&目的', '.流程圖', '作業流程'] }),
      runStore,
      onExtracted,
    });
    expect(onExtracted).not.toHaveBeenCalled();
    const after = await runStore.findById(run.id);
    expect(after?.status).toBe('failed');
    expect(after?.stage).toBe('extract');
    expect(after?.errorStage).toBe('extract');
    expect(after?.errorMessage).toBeTruthy();
  });
});

describe('F028 觸發來源無感知（TS-F028-022/023）', () => {
  it('TS-F028-022 以正確 documentId 回傳結果（result.documentId 對應）', () => {
    expect(extract('DOC-XYZ', workbook()).documentId).toBe('DOC-XYZ');
  });

  it('TS-F028-023 抽取邏輯不感知觸發來源（同輸入 → 同輸出，deterministic）', () => {
    const wb = workbook();
    expect(extract('DOC-1', wb)).toEqual(extract('DOC-1', wb));
  });
});

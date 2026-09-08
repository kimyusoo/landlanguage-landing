// leads 테이블 데이터를 엑셀(.xlsx) 버퍼로 변환하는 공용 로직.
const XLSX = require('xlsx');

function buildLeadsWorkbook(leads) {
  const rows = (leads || []).map((l) => ({
    접수일시: l.created_at ? new Date(l.created_at).toLocaleString('ko-KR') : '',
    시행사명: l.company || '',
    담당자명: l.name || '',
    연락처: l.phone || '',
    이메일: l.email || '',
    문의내용: l.message || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 20 }, // 접수일시
    { wch: 22 }, // 시행사명
    { wch: 14 }, // 담당자명
    { wch: 16 }, // 연락처
    { wch: 24 }, // 이메일
    { wch: 60 }, // 문의내용
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '리드');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildLeadsWorkbook };

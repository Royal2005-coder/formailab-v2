import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as XLSX from "xlsx";

const outputXlsx = resolve(process.argv[2] ?? "apps/web/public/sample-csv/AILAB_Full_Adaptive_Survey_Template.xlsx");
mkdirSync(dirname(outputXlsx), { recursive: true });

const sheets = {
  Guide: [
    { section: "Encoding", guidance: "Prefer XLSX or CSV files encoded as UTF-8 with comma delimiters." },
    { section: "Identifiers", guidance: "external_id values must be stable ASCII identifiers unique across groups, questions and variables." },
    { section: "Relevance", guidance: 'Use Lime-style expressions, for example BANK=="B2" and YEAR=="1" or SCORE >= 80.' },
    { section: "Missing values", guidance: "Use Q101.NAOK when an unanswered numeric value should evaluate as zero instead of failing." },
    { section: "Calculated variables", guidance: "Use equation questions or Variables.calculation. Supported functions include if, round, min, max, sum and arithmetic/comparison operators." },
    { section: "Matrix", guidance: "Add Options rows with axis=row for rows and axis=column for columns." },
    { section: "Mandatory Fields", guidance: 'Set mandatory column to "yes", "Y", "1", or "true" to require an answer, or "no" / "N" for optional/equation questions.' },
    { section: "Logic", guidance: "action=show assigns the expression as target relevance. Imported question/group relevance is compiled to adaptive routing." },
    { section: "Validation", guidance: "Always validate and review diagnostics/checksums before committing an import." },
  ],
  ExpressionExamples: [
    { function_or_operator: "if(cond, true_val, false_val)", syntax_example: 'if(Q101=="B", 1, 0)', description: "Trả về true_val nếu điều kiện đúng, ngược lại trả về false_val" },
    { function_or_operator: "round(expr, decimals)", syntax_example: "round(SCORE_VAR, 1)", description: "Làm tròn biểu thức số với số chữ số thập phân chỉ định" },
    { function_or_operator: "min(a, b, ...)", syntax_example: "min(Q102, 5)", description: "Lấy giá trị nhỏ nhất trong danh sách" },
    { function_or_operator: "max(a, b, ...)", syntax_example: "max(SCORE, 0)", description: "Lấy giá trị lớn nhất trong danh sách" },
    { function_or_operator: "sum(a, b, ...)", syntax_example: "sum(Q102.NAOK, Q202.NAOK)", description: "Tính tổng các giá trị số" },
    { function_or_operator: ".NAOK suffix", syntax_example: "Q102.NAOK", description: "Bỏ qua lỗi nếu câu hỏi chưa được trả lời (coi là 0)" },
    { function_or_operator: "Comparison: ==, !=, >, >=, <, <=", syntax_example: "SCORE >= 80", description: "Toán tử so sánh điều kiện điểm số và giá trị" },
    { function_or_operator: "Logic: and, or, not", syntax_example: 'BANK=="B2" and YEAR=="1"', description: "Toán tử logic kết hợp nhiều điều kiện" },
    { function_or_operator: "Arithmetic: +, -, *, /, %", syntax_example: "(A + B) / 2 * 100", description: "Cơ chế tính toán đại số tiêu chuẩn" },
  ],
  QuestionTypes: [
    { type: "singleChoice", canonical_name: "multipleChoiceSingle", description: "Câu hỏi trắc nghiệm chọn 1 đáp án duy nhất (Radio)" },
    { type: "multipleChoice", canonical_name: "multipleChoiceMulti", description: "Câu hỏi trắc nghiệm chọn nhiều đáp án (Checkbox)" },
    { type: "openText", canonical_name: "openText", description: "Câu hỏi nhập văn bản tự do ngắn/dài (Text)" },
    { type: "numeric", canonical_name: "openTextNumber", description: "Câu hỏi nhập số nguyên/số thực (Numeric Input)" },
    { type: "rating", canonical_name: "rating", description: "Thang điểm đánh giá (Rating Scale 1-5)" },
    { type: "matrix", canonical_name: "matrix", description: "Ma trận câu hỏi đa hàng đa cột (Array Grid)" },
    { type: "date", canonical_name: "date", description: "Câu hỏi chọn ngày tháng năm (Date Picker)" },
    { type: "ranking", canonical_name: "ranking", description: "Câu hỏi sắp xếp thứ tự ưu tiên (Ranking)" },
    { type: "fileUpload", canonical_name: "fileUpload", description: "Khối cho phép tải tệp tin lên hệ thống (File Upload)" },
    { type: "display", canonical_name: "description", description: "Khối hiển thị thông báo, văn bản hướng dẫn (Text Display)" },
    { type: "equation", canonical_name: "calculatedVariable", description: "Khối tính toán công thức toán học và điểm số (Equation)" },
  ],
  Survey: [{ external_id: "AILAB_TEST_BANK", default_language: "vi", title: "Ngân hàng câu hỏi thích ứng AI LAB (XLSX Master)", "title:en-US": "AI LAB Adaptive Test Bank Master" }],
  Groups: [
    { external_id: "G1_PROFILE", order: 0, title: "Phần 1: Phân loại đối tượng & Năm học", "title:en-US": "Routing profile", relevance: "1" },
    { external_id: "G2_YEAR_1", order: 1, title: "Phần 2A: Bộ đề kiểm tra kiến thức cho Sinh viên Năm 1", "title:en-US": "Year 1 test bank", relevance: 'BANK=="B2" and YEAR=="1"' },
    { external_id: "G3_YEAR_2", order: 2, title: "Phần 2B: Bộ đề nâng cao cho Sinh viên Năm 2 trở lên", "title:en-US": "Year 2+ test bank", relevance: 'BANK=="B2" and (YEAR=="2" or YEAR=="3" or YEAR=="4")' },
    { external_id: "G4_RESULT", order: 3, title: "Phần 3: Kết quả Điểm số & Rẽ nhánh theo xếp loại", "title:en-US": "Result & Score Branching", relevance: 'BANK=="B2"' },
  ],
  Questions: [
    { external_id: "BANK", group_external_id: "G1_PROFILE", type: "singleChoice", order: 0, text: "Bạn muốn thực hiện bộ đánh giá nào?", mandatory: "yes", relevance: "1", calculation: "", rating_range: "" },
    { external_id: "YEAR", group_external_id: "G1_PROFILE", type: "singleChoice", order: 1, text: "Bạn là sinh viên năm mấy?", mandatory: "yes", relevance: 'BANK=="B2"', calculation: "", rating_range: "" },
    { external_id: "Q101", group_external_id: "G2_YEAR_1", type: "singleChoice", order: 0, text: "Công cụ AI dạng notebook nghiên cứu nào hỗ trợ tải tài liệu và hỏi đáp trực tiếp?", mandatory: "yes", relevance: 'BANK=="B2" and YEAR=="1"', calculation: "", rating_range: "" },
    { external_id: "Q102", group_external_id: "G2_YEAR_1", type: "rating", order: 1, text: "Mức độ tự tin sử dụng AI trong học tập?", mandatory: "yes", relevance: 'BANK=="B2" and YEAR=="1"', calculation: "", rating_range: 5 },
    { external_id: "Q103", group_external_id: "G2_YEAR_1", type: "matrix", order: 2, text: "Ma trận tự đánh giá năng lực AI cơ bản", mandatory: "yes", relevance: 'BANK=="B2" and YEAR=="1"', calculation: "", rating_range: "" },
    { external_id: "Q201", group_external_id: "G3_YEAR_2", type: "singleChoice", order: 0, text: "Kỹ thuật nào giúp giảm thiểu hiện tượng ảo giác (Hallucination) của LLM?", mandatory: "yes", relevance: 'BANK=="B2" and (YEAR=="2" or YEAR=="3" or YEAR=="4")', calculation: "", rating_range: "" },
    { external_id: "Q202", group_external_id: "G3_YEAR_2", type: "rating", order: 1, text: "Đánh giá mức độ thành thạo tích hợp API AI vào ứng dụng thực tế?", mandatory: "yes", relevance: 'BANK=="B2" and (YEAR=="2" or YEAR=="3" or YEAR=="4")', calculation: "", rating_range: 5 },
    { external_id: "SCORE", group_external_id: "G4_RESULT", type: "equation", order: 0, text: "Điểm số: {SCORE}/100", mandatory: "no", relevance: 'BANK=="B2"', calculation: 'round((if(YEAR=="1", if(Q101=="B",1,0) + Q102.NAOK/5, if(Q201=="A",1,0) + Q202.NAOK/5) / 2) * 100, 1)', rating_range: "" },
    { external_id: "BRANCH_EXCELLENT", group_external_id: "G4_RESULT", type: "singleChoice", order: 1, text: "Chúc mừng! Bạn đạt Xếp loại Xuất sắc (>= 80%). Bạn có muốn đăng ký cấp Giấy khen/Chứng chỉ AI LAB?", mandatory: "no", relevance: 'SCORE >= 80', calculation: "", rating_range: "" },
    { external_id: "BRANCH_GOOD", group_external_id: "G4_RESULT", type: "singleChoice", order: 2, text: "Bạn đạt Xếp loại Khá/Trung bình (50% - 79%). Bạn có muốn thử lại bài đánh giá nâng cao không?", mandatory: "no", relevance: 'SCORE >= 50 and SCORE < 80', calculation: "", rating_range: "" },
    { external_id: "BRANCH_REMEDIAL", group_external_id: "G4_RESULT", type: "singleChoice", order: 3, text: "Kết quả dưới 50% (Cần bổ trợ). Bạn có muốn đăng ký tham gia khóa học bổ trợ kiến thức AI căn bản miễn phí không?", mandatory: "no", relevance: 'SCORE < 50', calculation: "", rating_range: "" },
  ],
  Options: [
    { external_id: "BANK_B1", question_external_id: "BANK", order: 0, value: "B1", label: "VSAIC Readiness", axis: "" },
    { external_id: "BANK_B2", question_external_id: "BANK", order: 1, value: "B2", label: "VSAIC Competency theo năm học", axis: "" },
    { external_id: "YEAR_1", question_external_id: "YEAR", order: 0, value: "1", label: "Sinh viên Năm 1", axis: "" },
    { external_id: "YEAR_2", question_external_id: "YEAR", order: 1, value: "2", label: "Sinh viên Năm 2", axis: "" },
    { external_id: "YEAR_3", question_external_id: "YEAR", order: 2, value: "3", label: "Sinh viên Năm 3", axis: "" },
    { external_id: "YEAR_4", question_external_id: "YEAR", order: 3, value: "4", label: "Sinh viên Năm 4", axis: "" },
    { external_id: "Q101_A", question_external_id: "Q101", order: 0, value: "A", label: "ChatGPT Web", axis: "" },
    { external_id: "Q101_B", question_external_id: "Q101", order: 1, value: "B", label: "NotebookLM (Đáp án đúng)", axis: "" },
    { external_id: "Q101_C", question_external_id: "Q101", order: 2, value: "C", label: "Claude 3.5 Sonnet", axis: "" },
    { external_id: "Q103_R1", question_external_id: "Q103", order: 0, value: "R1", label: "Kỹ năng thiết kế Prompt chính xác", axis: "row" },
    { external_id: "Q103_R2", question_external_id: "Q103", order: 1, value: "R2", label: "Kỹ năng phát hiện và sửa thông tin sai sót của AI", axis: "row" },
    { external_id: "Q103_C1", question_external_id: "Q103", order: 0, value: "1", label: "Mới bắt đầu (Cơ bản)", axis: "column" },
    { external_id: "Q103_C2", question_external_id: "Q103", order: 1, value: "2", label: "Thành thạo (Nâng cao)", axis: "column" },
    { external_id: "Q201_A", question_external_id: "Q201", order: 0, value: "A", label: "RAG - Retrieval-Augmented Generation (Đáp án đúng)", axis: "" },
    { external_id: "Q201_B", question_external_id: "Q201", order: 1, value: "B", label: "Tăng nhiệt độ (Temperature)", axis: "" },
    { external_id: "Q201_C", question_external_id: "Q201", order: 2, value: "C", label: "Giảm độ dài prompt", axis: "" },
    { external_id: "BRANCH_EXCELLENT_Y", question_external_id: "BRANCH_EXCELLENT", order: 0, value: "Y", label: "Có, Đăng ký cấp chứng chỉ ngay", axis: "" },
    { external_id: "BRANCH_EXCELLENT_N", question_external_id: "BRANCH_EXCELLENT", order: 1, value: "N", label: "Chưa, Để sau", axis: "" },
    { external_id: "BRANCH_GOOD_Y", question_external_id: "BRANCH_GOOD", order: 0, value: "Y", label: "Có, Tôi muốn thử sức lại", axis: "" },
    { external_id: "BRANCH_GOOD_N", question_external_id: "BRANCH_GOOD", order: 1, value: "N", label: "Không, Tôi giữ kết quả này", axis: "" },
    { external_id: "BRANCH_REMEDIAL_Y", question_external_id: "BRANCH_REMEDIAL", order: 0, value: "Y", label: "Có, Đăng ký khóa học bổ trợ miễn phí", axis: "" },
    { external_id: "BRANCH_REMEDIAL_N", question_external_id: "BRANCH_REMEDIAL", order: 1, value: "N", label: "Chưa, Tôi tự ôn tập lại", axis: "" },
  ],
  Logic: [
    { external_id: "SHOW_YEAR", target_external_id: "YEAR", expression: 'BANK=="B2"', action: "show" },
    { external_id: "SHOW_YEAR_1", target_external_id: "G2_YEAR_1", expression: 'BANK=="B2" and YEAR=="1"', action: "show" },
    { external_id: "SHOW_YEAR_2", target_external_id: "G3_YEAR_2", expression: 'BANK=="B2" and (YEAR=="2" or YEAR=="3" or YEAR=="4")', action: "show" },
    { external_id: "SHOW_EXCELLENT", target_external_id: "BRANCH_EXCELLENT", expression: 'SCORE >= 80', action: "show" },
    { external_id: "SHOW_GOOD", target_external_id: "BRANCH_GOOD", expression: 'SCORE >= 50 and SCORE < 80', action: "show" },
    { external_id: "SHOW_REMEDIAL", target_external_id: "BRANCH_REMEDIAL", expression: 'SCORE < 50', action: "show" },
  ],
  Variables: [
    { external_id: "SCORE_VAR", type: "number", name: "SCORE", default_value: 0, calculation: 'round((if(YEAR=="1", if(Q101=="B",1,0) + Q102.NAOK/5, if(Q201=="A",1,0) + Q202.NAOK/5) / 2) * 100, 1)' },
    { external_id: "VCSCORE_VAR", type: "number", name: "VCSCORE", default_value: 0, calculation: 'SCORE' },
  ],
  Quotas: [{ external_id: "YEAR_1_LIMIT", limit: 1000, expression: 'BANK=="B2" and YEAR=="1"', outcome: "complete" }],
};

const workbook = XLSX.utils.book_new();
for (const [name, rows] of Object.entries(sheets)) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!cols"] = Object.keys(rows[0] ?? {}).map((key) => ({ wch: Math.min(60, Math.max(14, key.length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}
writeFileSync(outputXlsx, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
console.log("Generated XLSX Master Template:", outputXlsx);
